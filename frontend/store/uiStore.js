import { create } from 'zustand';

// This store manages the dynamic state of the UI panes
const useUiStore = create((set) => ({
    // State
    isMobileNavOpen: false, // For the sliding menu on mobile
    
    // Represents what is shown in the main navigator (Pane 1)
    // 'global' or a sectorId (Principal as Text)
    activeNavigator: 'global', 

    // Represents what is selected in the contextual hub (Pane 2)
    // e.g., 'feed', 'proposals', or a channelName
    activeContext: 'feed',

    // Actions
    toggleMobileNav: () => set(state => ({ isMobileNavOpen: !state.isMobileNavOpen })),
    closeMobileNav: () => set({ isMobileNavOpen: false }),

    // Sets the primary context (e.g., user clicked on a Sector icon)
    setNavigator: (navigatorId) => set({
        activeNavigator: navigatorId,
        activeContext: 'feed', // Default to feed view when switching context
        isMobileNavOpen: false, // Close nav on selection
    }),

    // Sets the secondary context (e.g., user clicked on a channel)
    setContext: (context) => set({
        activeContext: context,
        isMobileNavOpen: false, // Close nav on selection
    }),
}));

export default useUiStore;