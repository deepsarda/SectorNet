import { create } from 'zustand';
import { AuthClient } from "@dfinity/auth-client";
import { Secp256k1KeyIdentity } from "@dfinity/identity-secp256k1";
import { createActor } from '../services/ic';
import cryptoService from '../services/cryptoService';

const useAuthStore = create((set, get) => ({
  authClient: null,
  isAuthenticated: false,
  hasCryptoIdentity: false,
  identity: null,
  principal: null,
  userProfile: null,
  userCanister: null,
  status: 'initializing', // intializing / authenticated / unauthenticated

  initialize: async () => {
    try {
      const authClient = await AuthClient.create();
      set({ authClient });

      // Attempt to load cryptographic identity from local storage
      const keysLoaded = await cryptoService.loadKeystoreFromStorage();
      set({ hasCryptoIdentity: keysLoaded });
      
      const isAuthenticated = await authClient.isAuthenticated();
      
      if (isAuthenticated) {
        const identity = authClient.getIdentity();
        const principal = identity.getPrincipal();
        const userCanister = createActor("user_canister", { agentOptions: { identity } });

        set({ isAuthenticated: true, identity, principal, userCanister });
        
        await get().fetchUserProfile();
        set({ status: 'authenticated' });

      } else {
        set({ status: 'unauthenticated' });
      }
    } catch (error) {
      console.error("Failed to initialize auth client:", error);
      set({ status: 'unauthenticated' });
    }
  },

  login: async () => {
    const { authClient } = get();
    if (!authClient) return;

    const isDevelopment = process.env.DFX_NETWORK !== "ic";

    if (isDevelopment) {
      // Use a fixed identity for development
      const seed_phrase = "test test test test test test test test test test test junk";
      const identity = Secp256k1KeyIdentity.fromSeedPhrase(seed_phrase);
      
      const principal = identity.getPrincipal();
      const userCanister = createActor("user_canister", { agentOptions: { identity } });

      set({ 
        isAuthenticated: true, 
        identity, 
        principal, 
        userCanister,
        status: 'authenticated' 
      });

      await get().fetchUserProfile();
      
      return;
    }

    const identityProvider = "https://identity.ic0.app/#authorize";

    await authClient.login({
      identityProvider,
      onSuccess: () => get().initialize(),
      onError: (err) => {
        console.error("Login failed:", err);
        set({ status: 'unauthenticated' });
      }
    });
  },

  logout: async () => {
    const { authClient } = get();
    if (authClient) {
      await authClient.logout();
    }
    localStorage.removeItem('sectornet_keystore');
    set({ 
      isAuthenticated: false, 
      identity: null, 
      principal: null, 
      userProfile: null, 
      userCanister: null, 
      status: 'unauthenticated',
      hasCryptoIdentity: false,
    });
  },
  
  fetchUserProfile: async () => {
    const { userCanister, principal } = get();
    if (!userCanister || !principal) return;
    const profileResult = await userCanister.get_profile_by_principal(principal);
    if (profileResult.length > 0) {
      set({ userProfile: profileResult[0] });
    } else {
      set({ userProfile: null });
    }
  },
  
  // The core of the crypto integration
  createProfile: async (username) => {
    const { userCanister } = get();
    if (!userCanister) return { Err: "User canister not initialized." };
    
    // Generate the user's master RSA key pair
    const identityKeys = await cryptoService.generateIdentityKeys();

    // Export the public key to a storable format (JWK)
    const publicKeyJwk = await cryptoService.exportKeyJwk(identityKeys.publicKey);

    // Convert the JWK object to a Blob (Uint8Array) to send to the canister
    const publicKeyBlob = new TextEncoder().encode(JSON.stringify(publicKeyJwk));

    // Call the canister with the username and the public key blob
    const result = await userCanister.create_profile(username, publicKeyBlob);
    
    if (result && 'Ok' in result) {
      // On success, save the FULL keystore (including private key) to local storage
      await cryptoService.saveKeystoreToStorage();
      set({ hasCryptoIdentity: true });
      window.location.reload();
      // Re-fetch profile to update the UI
      await get().fetchUserProfile(); 
    }
    return result;
  }
}));

// Initialize the store as soon as the app loads
useAuthStore.getState().initialize();

export default useAuthStore;