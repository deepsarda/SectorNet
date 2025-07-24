import { create } from 'zustand';
import { createActor } from '../services/ic';
import useAuthStore from './authStore';
import { idlFactory as inviteCanisterIdl } from 'declarations/invite_canister';
import { Principal } from '@dfinity/principal';
const POSTS_PER_PAGE = 20; 
const useSectorStore = create((set, get) => ({
  joinedSectors: [],      // Holds a list of {id, name, abbreviation}
  activeSectorData: null, // Holds details: { name, channels, my_role, etc. }
  isListLoading: false,
  isDetailsLoading: false,
  error: null,
  cryptoStatePoller: null, 

  // Fetches the list of sectors the user has joined from their profile
  fetchJoinedSectors: async () => {
    const { userCanister } = useAuthStore.getState();
    if (!userCanister) return;

    set({ isListLoading: true, error: null });
    try {
      const profileResult = await userCanister.get_profile_by_principal(useAuthStore.getState().principal);
      if (profileResult.length === 0) {
        throw new Error("User profile not found.");
      }
      const profile = profileResult[0];
      const sectorIds = profile.joined_sectors;

      // Now, for each sector ID, we need to get its name and abbreviation.
      // This requires creating a temporary actor for each one.
      // NOTE: This can be slow if a user has joined many sectors. A future optimization
      // needs a backend function that returns this data in a single call.
      const sectorInfoPromises = sectorIds.map(async (sectorId) => {
        const tempActor = createActor('sector_canister', { canisterId: sectorId });
        // Assuming a `get_public_info` method exists on the sector canister.
        // Let's use get_my_details and derive from it for now.
        const details = await tempActor.get_my_details();
        if (details.length > 0) {
          const name = details[0].name;
          return {
            id: sectorId,
            name: name,
            // Create abbreviation from the first two letters of the name
            abbreviation: name.substring(0, 2).toUpperCase(),
          };
        }
        return null;
      });
      
      const joinedSectors = (await Promise.all(sectorInfoPromises)).filter(Boolean); // Filter out any nulls
      
      set({ joinedSectors, isListLoading: false });

    } catch (err) {
      console.error("Error fetching joined sectors:", err);
      set({ error: "Failed to load sector list.", isListLoading: false });
    }
  },

  // Fetches the details of a single, active sector
  fetchSectorDetails: async (sectorId) => {
    get().stopCryptoPolling(); 
    const { identity } = useAuthStore.getState();
    if (!identity || !sectorId || sectorId === 'global') {
        set({ activeSectorData: null });
        return;
    }
    set({ isDetailsLoading: true, activeSectorData: null, error: null });
    try {
      // Create a dynamic actor for the specific sector using the user's identity
      const sectorActor = createActor('sector_canister', { 
        agentOptions: { identity },
        canisterId: sectorId 
      });

      const detailsResult = await sectorActor.get_my_details();
      if (detailsResult.length > 0) {
        set({ activeSectorData: detailsResult[0], isDetailsLoading: false });

        // If this is a private (E2EE) sector, start polling for crypto state changes.
        if (detailsResult[0].is_private) {
            get().startCryptoPolling(sectorId);
        }
        
        if (sectorId && sectorId !== 'global') {
          get().fetchInitialSectorFeed();
        }
      } else {
        throw new Error("Could not fetch sector details. You may not be a member.");
      }
    } catch (err) {
        console.error(`Error fetching details for sector ${sectorId}:`, err);
        set({ error: "Failed to load sector details.", isDetailsLoading: false });
    }
  
  },


  createNewSector: async (config) => {
    const { identity } = useAuthStore.getState();
    if (!identity) return { Err: "Not authenticated." };

    set({ isDetailsLoading: true, error: null });
    try {
      const factoryActor = createActor('sector_factory_canister', {
        agentOptions: { identity },
      });

      // The owner principal needs to be added to the config before sending
      const finalConfig = { ...config, owner: identity.getPrincipal() };

      const result = await factoryActor.create_new_sector(finalConfig);
      
      if ('Ok' in result) {
        // Success! The result.Ok is the new sector's Principal.
        // We now need to call the `join` function on the newly created canister
        // so the creator is automatically a member.
        const newSectorId = result.Ok;
        const newSectorActor = createActor('sector_canister', {
            agentOptions: { identity },
            canisterId: newSectorId,
        });

        // For public sectors, you just join. For private, the creator is already the owner/moderator.
        // The backend `init` function for sector_canister already adds the owner as a moderator.
        // But we still need to add it to the user's profile.
        const { userCanister } = useAuthStore.getState();
        await userCanister.add_joined_sector(newSectorId);
        
        await get().fetchJoinedSectors(); // Refresh the list in Pane 1
        set({ isDetailsLoading: false });
        return { Ok: newSectorId };
      } else {
        // The error is a variant, e.g., { RateLimitExceeded: null }
        const errorKey = Object.keys(result.Err)[0];
        const errorMessage = result.Err[errorKey] || errorKey;
        throw new Error(errorMessage);
      }
    } catch (err) {
      console.error("Error creating new sector:", err);
      set({ error: err.message, isDetailsLoading: false });
      return { Err: err.message };
    }
  },

  joinPrivateSector: async (inviteCode) => {
    const { identity } = useAuthStore.getState();
    if (!identity) return { Err: "Not authenticated." };

    set({ isDetailsLoading: true, error: null });
    try {
        // Resolve the code to get the sector principal
        const inviteActor = createActor('invite_canister'); // Public actor, no identity needed
        const sectorIdResult = await inviteActor.resolve_code(inviteCode);
        
        if (sectorIdResult.length === 0) {
            throw new Error("Invalid or expired invite code.");
        }
        const sectorId = sectorIdResult[0];

        // Create an actor for the resolved sector and call its join function
        const sectorActor = createActor('sector_canister', {
            agentOptions: { identity },
            canisterId: sectorId,
        });

        const joinResult = await sectorActor.join(); // The backend will add the member
        if ('Err' in joinResult) {
          const errorKey = Object.keys(joinResult.Err)[0];
          throw new Error(`Failed to join sector: ${errorKey}`);
        }

        // Add the sector to the user's profile
        const { userCanister } = useAuthStore.getState();
        await userCanister.add_joined_sector(sectorId);

        await get().fetchJoinedSectors(); // Refresh the list
        set({ isDetailsLoading: false });
        return { Ok: sectorId };

    } catch(err) {
        console.error("Error joining private sector:", err);
        set({ error: err.message, isDetailsLoading: false });
        return { Err: err.message };
    }
  },
fetchInitialSectorFeed: async () => {
    const { activeSectorData } = get();
    const { identity } = useAuthStore.getState();
    if (!activeSectorData?.id || !identity) return;

    set({ isFeedLoading: true, error: null, feedPage: 0, hasMoreFeed: true });
    try {
      const sectorActor = createActor('sector_canister', { canisterId: activeSectorData.id, agentOptions: { identity } });
      const postsResult = await sectorActor.get_sector_feed(0, POSTS_PER_PAGE);
      
      set({
        sectorPosts: postsResult,
        isFeedLoading: false,
        feedPage: 1,
        hasMoreFeed: postsResult.length === POSTS_PER_PAGE,
      });
    } catch (err) {
      console.error("Error fetching initial sector feed:", err);
      set({ error: "Failed to fetch sector posts.", isFeedLoading: false });
    }
  },

  fetchMoreSectorFeed: async () => {
    const { isFeedLoading, hasMoreFeed, feedPage, sectorPosts, activeSectorData } = get();
    const { identity } = useAuthStore.getState();
    if (isFeedLoading || !hasMoreFeed || !activeSectorData?.id || !identity) return;

    set({ isFeedLoading: true });
    try {
      const sectorActor = createActor('sector_canister', { canisterId: activeSectorData.id, agentOptions: { identity } });
      const newPosts = await sectorActor.get_sector_feed(feedPage, POSTS_PER_PAGE);
      
      set(state => ({
        sectorPosts: [...state.sectorPosts, ...newPosts],
        feedPage: state.feedPage + 1,
        hasMoreFeed: newPosts.length === POSTS_PER_PAGE,
        isFeedLoading: false,
      }));
    } catch (err) {
      console.error("Error fetching more sector posts:", err);
      set({ isFeedLoading: false });
    }
  },
  
  updateSectorConfig: async (updateData) => {
    const { activeSectorData } = get();
    const { identity } = useAuthStore.getState();
    if (!activeSectorData?.id || !identity) return { Err: "Not in a sector or not authenticated."};

    set({ isDetailsLoading: true, error: null });
    try {
        const sectorActor = createActor('sector_canister', { canisterId: activeSectorData.id, agentOptions: { identity } });
        const result = await sectorActor.update_sector_config(updateData);

        if('Err' in result) {
            throw new Error(Object.keys(result.Err)[0]);
        }
        
        // Refresh data on success
        await get().fetchSectorDetails(activeSectorData.id);
        set({ isDetailsLoading: false });
        return { Ok: null };

    } catch(err) {
        console.error("Error updating sector config:", err);
        set({ error: err.message, isDetailsLoading: false });
        return { Err: err.message };
    }
  },


  startCryptoPolling: (sectorId) => {
    const poller = setInterval(async () => {
      try {
        const sectorActor = createActor('sector_canister', { canisterId: sectorId });
        const newState = await sectorActor.get_crypto_state();
        
        // Update the activeSectorData with the latest crypto state
        set(state => ({
            activeSectorData: state.activeSectorData ? { ...state.activeSectorData, ...newState } : null
        }));

      } catch (err) {
        console.warn("Crypto state polling failed:", err);
      }
    }, 5000); // Poll every 5 seconds
    set({ cryptoStatePoller: poller });
  },
  
  stopCryptoPolling: () => {
    const { cryptoStatePoller } = get();
    if (cryptoStatePoller) {
      clearInterval(cryptoStatePoller);
      set({ cryptoStatePoller: null });
    }
  },

  // function to perform key Rotation
  performKeyRotation: async () => {
    const { activeSectorData } = get();
    const { identity } = useAuthStore.getState();
    if (!activeSectorData || !identity) return { Err: "Not in a sector." };
    
    set({ isDetailsLoading: true }); // Use the details loader for feedback
    
    try {
      const sectorActor = createActor('sector_canister', { canisterId: activeSectorData.id, agentOptions: { identity } });

      // Get the list of current members
      const membersResult = await sectorActor.get_members();
      if (membersResult.length === 0) throw new Error("Could not get member list.");
      const members = membersResult[0];

      // Generate a new sector key
      const newSectorKey = await cryptoService.generateSectorKey();
      const newEpochId = activeSectorData.current_key_epoch + 1;

      // For each member, get their public key and wrap the new sector key
      const keyBatchPromises = members.map(async (memberPrincipal) => {
        const profile = await getUserProfile(memberPrincipal);
        if (!profile) throw new Error(`Could not find profile for member ${memberPrincipal.toText()}`);
        
        const publicKeyJwk = JSON.parse(new TextDecoder().decode(profile.public_key));
        const userPublicKey = await cryptoService.importKeyJwk(publicKeyJwk, 'public');

        const wrappedKey = await cryptoService.wrapSectorKey(newSectorKey, userPublicKey);
        return [memberPrincipal, new Uint8Array(wrappedKey)];
      });
      
      const key_batch = await Promise.all(keyBatchPromises);

      // Call the canister with the batch of encrypted keys
      const result = await sectorActor.rotate_sector_key(key_batch);
      if ('Err' in result) throw new Error(`Canister rejection: ${result.Err}`);

      // On success, locally store the new key for the new epoch and save it
      cryptoService.addSectorKey(activeSectorData.id.toText(), newEpochId, newSectorKey);
      await cryptoService.saveKeystoreToStorage();

      // Manually trigger a poll to get the new state immediately
      get().startCryptoPolling(activeSectorData.id);

      set({ isDetailsLoading: false });
      return { Ok: null };

    } catch(err) {
      console.error("Key rotation failed:", err);
      set({ isDetailsLoading: false, error: err.message });
      return { Err: err.message };
    }
  },
}));

export default useSectorStore;
