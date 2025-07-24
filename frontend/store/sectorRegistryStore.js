import { create } from 'zustand';
import { createActor } from '../services/ic';

const useSectorRegistryStore = create((set, get) => ({
  // State
  publicSectors: new Map(), // Map<sectorIdText: string, SectorInfo>
  isLoading: false,
  error: null,

  // Actions
  fetchPublicSectorInfo: async (sectorId) => {
    if (!sectorId) return;
    const sectorIdText = sectorId.toText();
    
    // Return from cache if available
    if (get().publicSectors.has(sectorIdText)) {
      return get().publicSectors.get(sectorIdText);
    }
    
    set({ isLoading: true });
    try {
      const actor = createActor('sector_registry_canister');
      // The search query with the full principal ID will return exactly one result if it exists.
      const results = await actor.search_sectors(sectorIdText);

      if (results.length > 0) {
        const sectorInfo = results[0];
        set(state => ({
          publicSectors: new Map(state.publicSectors).set(sectorIdText, sectorInfo),
          isLoading: false,
        }));
        return sectorInfo;
      } else {
        throw new Error("Sector not found in public registry.");
      }
    } catch (err) {
      console.error(`Failed to fetch public info for ${sectorIdText}:`, err);
      // Don't set a global error, just return null
      set({ isLoading: false });
      return null;
    }
  },
  
  // This action allows other stores/components to update the local cache
  // after an admin action, without needing to re-fetch.
  updateVettedStatusInCache: (sectorId, newStatus) => {
    const sectorIdText = sectorId.toText();
    const currentSectors = get().publicSectors;

    if (currentSectors.has(sectorIdText)) {
      const updatedInfo = { ...currentSectors.get(sectorIdText), is_vetted: newStatus };
      set({
        publicSectors: new Map(currentSectors).set(sectorIdText, updatedInfo),
      });
    }
  },

}));

export default useSectorRegistryStore;