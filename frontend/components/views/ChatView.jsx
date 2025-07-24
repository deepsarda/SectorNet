import React, { useEffect, useRef, useState, useCallback } from 'react';
import useChatStore from '../../store/chatStore';
import useSectorStore from '../../store/sectorStore';
import useAuthStore from '../../store/authStore';
import getUserProfile from '../../services/userCache';
import cryptoService from '../../services/cryptoService';
import { ShieldCheckIcon, ShieldExclamationIcon, KeyIcon } from '@heroicons/react/24/solid';
import KeyRotationManager from './KeyRotationManager'; 

const MessageItem = ({ message, isMe, securityModel, sectorId }) => {
  const [username, setUsername] = useState(() => isMe ? 'You' : '...');
  const [decryptedContent, setDecryptedContent] = useState('[Decrypting...]');

  useEffect(() => {
    if (!isMe) {
      getUserProfile(message.author_principal).then(p => p && setUsername(p.username));
    }
    
    // The Decryption Logic
    const decrypt = async () => {
      if (securityModel === 'HighSecurityE2EE') {
        const key = cryptoService.getSectorKey(sectorId.toText(), Number(message.key_epoch_id));
        if (!key) {
          setDecryptedContent('[Error: No key for this message epoch]');
          return;
        }
        const plaintext = await cryptoService.decryptMessage(message.encrypted_content_markdown, key);
        setDecryptedContent(plaintext || '[Decryption Failed]');
      } else {
        // Standard model is just plain text
        setDecryptedContent(new TextDecoder().decode(message.encrypted_content_markdown));
      }
    };
    decrypt();
  }, [message, isMe, securityModel, sectorId]);

  const date = new Date(Number(message.timestamp / 1_000_000n));

  return (
    <div className={`chat ${isMe ? 'chat-end' : 'chat-start'}`}>
      <div className="chat-header text-xs text-slate-500 mb-1">{username}<time className="ml-2">{date.toLocaleTimeString()}</time></div>
      <div className={`chat-bubble ${isMe ? 'chat-bubble-primary bg-glassterm-accent text-black' : 'bg-slate-700'}`}>{decryptedContent}</div>
    </div>
  );
};

// DEV-ONLY COMPONENT
const KeyManager = ({ sectorId }) => {
  const [hasKey, setHasKey] = useState(!!cryptoService.getSectorKey(sectorId.toText(), 1));

  const handleInstallKey = async () => {
    const key = await cryptoService.generateSectorKey();
    cryptoService.addSectorKey(sectorId.toText(), 1, key);
    await cryptoService.saveKeystoreToStorage();
    setHasKey(true);
    alert(`Key for epoch 1 installed for sector ${sectorId.toText().substring(0,5)}...`);
  };

  return (
    <div className="bg-orange-900/50 border border-orange-500 text-xs p-2 rounded-md my-2">
      <p className="font-bold">[Dev Panel]</p>
      <p>Sector requires an encryption key. Status: {hasKey ? "✅ Installed" : "❌ Missing"}</p>
      {!hasKey && <button className="btn btn-xs mt-1" onClick={handleInstallKey}>Install Test Key</button>}
    </div>
  );
}


const ChatView = ({ channelName }) => {
  const { principal } = useAuthStore();
  const { activeSectorData } = useSectorStore();
  const chatState = useChatStore();
  const [messageInput, setMessageInput] = useState('');

  const chatContainerRef = useRef(null);
  const loaderRef = useRef(null);

  useEffect(() => {
    if (activeSectorData?.id && channelName) {
      chatState.setActiveChannel(activeSectorData.id, channelName);
    }
    return () => {
      chatState.stopPolling();
    };
  }, [channelName, activeSectorData?.id]);

  useEffect(() => {
    const chatNode = chatContainerRef.current;
    if (chatNode) {
      const isScrolledNearBottom = chatNode.scrollHeight - chatNode.scrollTop <= chatNode.clientHeight + 100;
      if (isScrolledNearBottom) {
        chatNode.scrollTop = chatNode.scrollHeight;
      }
    }
  }, [chatState.messages.length]);

  const handleFetchOlder = useCallback(() => {
    const chatNode = chatContainerRef.current;
    if (!chatNode) return;
    const oldScrollHeight = chatNode.scrollHeight;
    const oldScrollTop = chatNode.scrollTop;
    
    chatState.fetchOlderMessages().then(() => {
      if (chatNode) {
        const newScrollHeight = chatNode.scrollHeight;
        chatNode.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
      }
    });
  }, [chatState.fetchOlderMessages]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && chatState.hasOlderMessages) {
          handleFetchOlder();
        }
      },
      { root: chatContainerRef.current, threshold: 1.0 }
    );

    const loaderNode = loaderRef.current;
    if (loaderNode) observer.observe(loaderNode);
    return () => { if (loaderNode) observer.unobserve(loaderNode); };
  }, [handleFetchOlder, chatState.hasOlderMessages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    chatState.sendMessage(messageInput);
    setMessageInput('');
  };

  const securityModel = activeSectorData?.is_private ? 'HighSecurityE2EE' : 'StandardAccessControl';
  
  return (
    <div className="h-full flex flex-col font-mono">
      <div className="border-b border-slate-700 pb-2 mb-2">
        <h2 className="text-xl text-slate-100 flex items-center">
          #{channelName}
          {securityModel === 'HighSecurityE2EE' ? (
            <ShieldCheckIcon className="w-5 h-5 ml-2 text-green-400" title="End-to-End Encrypted"/>
          ) : (
            <ShieldExclamationIcon className="w-5 h-5 ml-2 text-yellow-400" title="Standard Access Control (Not E2EE)"/>
          )}
        </h2>
        {/* Show the rekey manager only if a rekey is required */}
        {activeSectorData.rekey_required && (
          <KeyRotationManager isModerator = {isModerator} />
        )}
      </div>

      <div ref={chatContainerRef} className="flex-1 overflow-y-auto pr-2">
        {chatState.isLoading ? (
            <span className="loading loading-spinner mx-auto mt-4 block"></span>
        ) : (
            <>
                <div ref={loaderRef} className="text-center py-2">
                    {chatState.isLoadingOlder ? (
                        <span className="loading loading-spinner loading-sm"></span>
                    ) : !chatState.hasOlderMessages ? (
                        <p className="text-xs text-slate-500">You've reached the beginning of the channel history.</p>
                    ) : (
                        <p className="text-xs text-slate-600">Scroll up to load older messages.</p>
                    )}
                </div>
                <div className="flex flex-col space-y-4">
                  {chatState.messages.map(msg => (
                    <MessageItem key={String(msg.id)} message={msg} isMe={msg.author_principal.equals(principal)} />
                  ))}
                </div>
            </>
        )}
      </div>
      
      <div className="mt-4">
        <form onSubmit={handleSendMessage} className="join w-full">
          <input
            type="text"
            placeholder={`Message #${channelName}`}
            className="input input-bordered join-item w-full bg-slate-800"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
          />
          <button type="submit" className="btn join-item bg-glassterm-accent text-black" disabled={chatState.isSending}>
            {chatState.isSending ? <span className="loading loading-spinner loading-xs"></span> : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatView;