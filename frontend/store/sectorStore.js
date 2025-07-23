import { create } from 'zustand';
import { createActor } from '../services/ic';
import useAuthStore from './authStore';

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

      } else {
        throw new Error("Could not fetch sector details. You may not be a member.");
      }
    } catch (err) {
        console.error(`Error fetching details for sector ${sectorId}:`, err);
        set({ error: "Failed to load sector details.", isDetailsLoading: false });
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
