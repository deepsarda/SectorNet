import { create } from 'zustand';
import { createActor } from '../services/ic';

const POSTS_PER_PAGE = 20n; // Using BigInt for consistency with canister calls

const useGlobalFeedStore = create((set, get) => ({
  posts: [],
  page: 0n,
  isLoading: false,
  isLoadingMore: false, // Prevents multiple simultaneous 'load more' requests
  hasMore: true, // Assume there's more data until a fetch returns less than a full page
  error: null,

  // Fetches the very first page of the feed, replacing existing content
  fetchInitialFeed: async () => {
    // If we're already loading, don't do anything
    if (get().isLoading) return;

    set({ isLoading: true, error: null, page: 0n, hasMore: true });
    try {
      const actor = createActor('global_feed_canister');
      const postsResult = await actor.get_global_feed(0n, POSTS_PER_PAGE);
      
      set({
        posts: postsResult,
        isLoading: false,
        page: 1n, // We are now ready to fetch page 1
        hasMore: postsResult.length === Number(POSTS_PER_PAGE),
      });
    } catch (err) {
      console.error("Error fetching initial feed:", err);
      set({ error: "Failed to fetch posts.", isLoading: false });
    }
  },

  // Fetches the next page and appends it to the existing list
  fetchMorePosts: async () => {
    const { isLoadingMore, hasMore, page, posts } = get();

    // Prevent fetching if we're already loading, or if we know there's no more data
    if (isLoadingMore || !hasMore) return;

    set({ isLoadingMore: true });
    try {
      const actor = createActor('global_feed_canister');
      const nextPage = page;
      const newPosts = await actor.get_global_feed(nextPage, POSTS_PER_PAGE);
      
      set({
        // Append new posts to the existing array
        posts: [...posts, ...newPosts],
        // Increment the page number for the next fetch
        page: nextPage + 1n,
        // If the number of posts fetched is less than the page size, we've reached the end
        hasMore: newPosts.length === Number(POSTS_PER_PAGE),
        isLoadingMore: false,
      });
    } catch (err) {
      console.error("Error fetching more posts:", err);
      // Don't set a global error, maybe just log it or handle it silently
      set({ isLoadingMore: false });
    }
  },
  setVettedStatus: async (sectorId, newStatus) => {
    const { identity } = useAuthStore.getState();
    if (!identity) return { Err: "Admin identity not found." };
    
    set({ isLoading: true, error: null });
    try {
      const actor = createActor('global_feed_canister', { agentOptions: { identity }});
      const result = await actor.set_sector_vetted_status(sectorId, newStatus);

      if('Err' in result) {
        throw new Error(result.Err);
      }
      
      // On success, update the registry store's cache to reflect the change instantly.
      useSectorRegistryStore.getState().updateVettedStatusInCache(sectorId, newStatus);

      set({ isLoading: false });
      return { Ok: null };
    } catch (err) {
      console.error("Error setting vetted status:", err);
      const errorMessage = err.message || "Failed to set vetted status.";
      set({ error: errorMessage, isLoading: false });
      return { Err: errorMessage };
    }
  },
}));


export default useGlobalFeedStore;
