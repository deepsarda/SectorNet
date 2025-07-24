import { create } from 'zustand';
import { createActor } from '../services/ic';
import useAuthStore from './authStore';
import useSectorStore from './sectorStore'; 
import cryptoService from '../services/cryptoService';


const MESSAGES_PER_PAGE = 30; // Number of messages to fetch when scrolling up

const useChatStore = create((set, get) => ({
  // STATE
  messages: [], // Holds the messages for the active channel, sorted oldest to newest
  activeChannel: null, // The name of the currently viewed channel
  activeSectorId: null, // The principal ID of the sector this channel belongs to
  
  isLoading: false,       // For the initial load of a channel
  isLoadingOlder: false,  // For fetching older messages when scrolling up
  isSending: false,       // When a new message is being submitted
  
  hasOlderMessages: true, // Becomes false when a fetch returns fewer than a full page
  pollingIntervalId: null,// To hold the ID of our `setInterval` for cleanup

  // ACTIONS

  // Called when a user clicks on a channel link.
  // It resets the state and fetches the first page of messages.
  setActiveChannel: (sectorId, channelName) => {
    const { pollingIntervalId, activeChannel } = get();
    // Do nothing if we're already in this channel
    if (activeChannel === channelName) return;

    // Clean up previous channel's state
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
    }
    set({ messages: [], activeChannel: channelName, activeSectorId: sectorId, hasOlderMessages: true, isLoading: true });

    get().fetchInitialMessages();
    get().startPolling();
  },
  
  fetchInitialMessages: async () => {
      const { activeSectorId, activeChannel } = get();
      if (!activeSectorId || !activeChannel) return;
      
      try {
        const actor = createActor('sector_canister', { canisterId: activeSectorId, agentOptions: { identity: useAuthStore.getState().identity }});
        const results = await actor.get_messages(activeChannel, MESSAGES_PER_PAGE, []); // `[]` for `before_id` means get latest
        
        // Results are newest first, so we reverse them for display
        set({ messages: results.reverse(), isLoading: false });

      } catch (err) {
        console.error("Error fetching initial messages:", err);
        set({ isLoading: false });
      }
  },

  // Fetches the next batch of older messages for infinite scroll.
  fetchOlderMessages: async () => {
    const { isLoadingOlder, hasOlderMessages, messages, activeSectorId, activeChannel } = get();
    if (isLoadingOlder || !hasOlderMessages || messages.length === 0) return;

    set({ isLoadingOlder: true });
    try {
      const oldestMessageId = messages[0].id;
      const actor = createActor('sector_canister', { canisterId: activeSectorId, agentOptions: { identity: useAuthStore.getState().identity }});
      const results = await actor.get_messages(activeChannel, MESSAGES_PER_PAGE, [oldestMessageId]);

      if (results.length < MESSAGES_PER_PAGE) {
        set({ hasOlderMessages: false });
      }
      
      // Older messages are prepended to the array. Results are newest first, so we reverse them before prepending.
      set(state => ({ messages: [...results.reverse(), ...state.messages], isLoadingOlder: false }));

    } catch (err) {
      console.error("Error fetching older messages:", err);
      set({ isLoadingOlder: false });
    }
  },
  
  startPolling: () => {
      const intervalId = setInterval(async () => {
        const { messages, activeSectorId, activeChannel } = get();
        if (!activeSectorId || !activeChannel) return;
        
        // The ID of the last message, or a default string "0" if no messages exist.
        // The canister expects a String, not a BigInt.
        const latestMessageId = messages.length > 0 ? messages[messages.length - 1].id : "0";

        try {
            const actor = createActor('sector_canister', { canisterId: activeSectorId, agentOptions: { identity: useAuthStore.getState().identity }});
            // Call the new backend function with the correct arguments
            const result = await actor.get_new_messages(activeChannel, latestMessageId);

            if (result && 'Ok' in result && result.Ok.length > 0) {
                // The result is already a vector of messages
                const newMessages = result.Ok;
                set(state => ({ messages: [...state.messages, ...newMessages]}));
            }
        } catch(err) {
            // It's better to log this as a warning, as polling can fail intermittently
            console.warn("Polling for new messages failed:", err);
        }
      }, 3000); // Poll every 3 seconds

      set({ pollingIntervalId: intervalId });
  },

  stopPolling: () => {
    const { pollingIntervalId } = get();
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        set({ pollingIntervalId: null, activeChannel: null, activeSectorId: null });
    }
  },
  
  sendMessage: async (content) => {
    const { isSending, activeSectorId, activeChannel } = get();
    if (isSending || !content.trim()) return;

    set({ isSending: true });
    try {
      const { activeSectorData } = useSectorStore.getState();
      const securityModel = activeSectorData?.is_private ? 'HighSecurityE2EE' : 'StandardAccessControl';
      
      let encryptedContent;
      const keyEpoch = activeSectorData.current_key_epoch;


      if (securityModel === 'HighSecurityE2EE') {
        const sectorKey = cryptoService.getSectorKey(activeSectorId.toText(), keyEpoch);
        if (!sectorKey) {
          throw new Error("Cannot send message: No encryption key found for this sector and epoch.");
        }
        encryptedContent = await cryptoService.encryptMessage(content, sectorKey);
      } else {
        // For standard channels, we just encode the text to a blob
        encryptedContent = new TextEncoder().encode(content);
      }
      
      const actor = createActor('sector_canister', { canisterId: activeSectorId, agentOptions: { identity: useAuthStore.getState().identity } });
      await actor.send_message(activeChannel, new Uint8Array(encryptedContent), keyEpoch);

    } catch(err) {
      console.error("Error sending message:", err);
      // In a real app, you'd set an error state to show in the UI
      alert(err.message); 
    } finally {
      set({ isSending: false });
    }
  }
}));

export default useChatStore;
