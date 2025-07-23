import { create } from 'zustand';

const useUiStore = create((set) => ({
  // --- STATE ---

  // Manages the slide-out menu on mobile viewports
  isMobileNavOpen: false,

  // Determines the primary context: 'global' or a sector's Principal ID as a string.
  // This controls what Pane2 will display.
  activeNavigator: 'global',

  // Determines the secondary context, like a specific feed or channel name.
  // This controls what Pane3 will display.
  activeContext: 'feed',


  // --- ACTIONS ---

  // Toggles the mobile navigation pane
  toggleMobileNav: () => set(state => ({ isMobileNavOpen: !state.isMobileNavOpen })),
  
  // Closes the mobile navigation, useful after a selection is made
  closeMobileNav: () => set({ isMobileNavOpen: false }),

  // Sets the primary navigator, resetting the secondary context to its default
  setNavigator: (navigatorId) => set({
    activeNavigator: navigatorId,
    activeContext: 'feed', // Always default to the 'feed' view when switching sectors/global
    isMobileNavOpen: false, // Close nav on selection
  }),

  // Sets the secondary context within the current navigator
  setContext: (contextId) => set({
    activeContext: contextId,
    isMobileNavOpen: false, // Close nav on selection
  }),
}));

export default useUiStore;
