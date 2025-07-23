import { create } from 'zustand';
import { AuthClient } from "@dfinity/auth-client";
import { createActor } from '../services/ic';

const useAuthStore = create((set, get) => ({
  authClient: null,
  isAuthenticated: false,
  identity: null,
  principal: null,
  userProfile: null,
  userCanister: null,
  status: 'initializing', // 'initializing' | 'anonymous' | 'authenticated' | 'unauthenticated'

  initialize: async () => {
    const authClient = await AuthClient.create();
    set({ authClient });
    const isAuthenticated = await authClient.isAuthenticated();
    
    if (isAuthenticated) {
      const identity = authClient.getIdentity();
      const principal = identity.getPrincipal();
      const userCanister = createActor("user_canister", { agentOptions: { identity } });

      set({ isAuthenticated: true, identity, principal, userCanister, status: 'authenticated' });
      
      // Now fetch the user's specific SectorNet profile
      const profileResult = await userCanister.get_profile_by_principal(principal);
      if (profileResult.length > 0) { // Candid optional arrays
        set({ userProfile: profileResult[0] });
      } else {
        // User is logged in but has no SectorNet profile, needs onboarding
        set({ userProfile: null });
      }
    } else {
      set({ status: 'unauthenticated' });
    }
  },

  login: async () => {
    const { authClient } = get();
    if (!authClient) return;

    const identityProvider = process.env.DFX_NETWORK === "ic"
      ? "https://identity.ic0.app/#authorize"
      : `http://${process.env.CANISTER_ID_INTERNET_IDENTITY}.localhost:4943`;

    await authClient.login({
      identityProvider,
      onSuccess: () => {
        get().initialize(); // Re-run the init process to get identity and profile
      },
    });
  },

  logout: async () => {
    const { authClient } = get();
    if (authClient) {
      await authClient.logout();
    }
    set({ isAuthenticated: false, identity: null, principal: null, userProfile: null, userCanister: null, status: 'unauthenticated' });
  },
  
  // Example action for creating a profile (to be used in an onboarding flow)
  createProfile: async (username, publicKey) => {
    const { userCanister } = get();
    if (!userCanister) return { Err: "Canister not initialized" };
    
    const result = await userCanister.create_profile(username, publicKey);
    if ('Ok' in result) {
      // Re-fetch profile to update the state
      await get().fetchUserProfile(); 
    }
    return result;
  }
}));

// Initialize the store as soon as the app loads
useAuthStore.getState().initialize();

export default useAuthStore;