import React, { useEffect, useRef, useState, useCallback } from 'react';
import useChatStore from '../../store/chatStore';
import useSectorStore from '../../store/sectorStore';
import useAuthStore from '../../store/authStore';
import getUserProfile from '../../services/userCache';
import cryptoService from '../../services/cryptoService';
import { ShieldCheckIcon, ShieldExclamationIcon } from '@heroicons/react/24/solid';
import KeyRotationManager from './KeyRotationManager'; 
import Markdown from 'react-markdown';
import getSectorRole from '../../services/roleCache';

const MessageLine = ({ message, securityModel, sectorId }) => {
  const [authorProfile, setAuthorProfile] = useState(null);
  const [authorSectorRole, setAuthorSectorRole] = useState(null); 
  const [decryptedContent, setDecryptedContent] = useState('...');
  const { principal } = useAuthStore();
  const { activeSectorData } = useSectorStore();

  const isMe = message.author_principal.equals(principal);

  useEffect(() => {
    getUserProfile(message.author_principal).then(setAuthorProfile);
    getSectorRole(sectorId, message.author_principal).then(setAuthorSectorRole);

    const decrypt = async () => {
      // The `encrypted_content_markdown` is a Vec<u8> (Uint8Array) from the canister
      const encryptedBuffer = new Uint8Array(message.encrypted_content_markdown).buffer;

      if (securityModel === 'HighSecurityE2EE') {
        const key = cryptoService.getSectorKey(sectorId.toText(), Number(message.key_epoch_id));
        if (!key) {
          setDecryptedContent('[Error: No key for this message epoch]');
          return;
        }
        const plaintext = await cryptoService.decryptMessage(encryptedBuffer, key);
        setDecryptedContent(plaintext || '[Decryption Failed]');
      } else {
        // Standard model is just plain text, but still needs decoding from a Uint8Array
        setDecryptedContent(new TextDecoder().decode(encryptedBuffer));
      }
    };
    decrypt();
  }, [message, securityModel, sectorId]);

  const timestamp = new Date(Number(message.timestamp / 1_000_000n)).toLocaleTimeString();
  const username = authorProfile?.username || message.author_principal.toText().substring(0, 8);
  
  // Get User Tag (Global Role)
  const userTag = authorProfile?.tags?.[0] ? Object.keys(authorProfile.tags[0])[0] : 'User';

  const sectorRole = authorSectorRole ? ` | ${Object.keys(authorSectorRole)[0]}` : '';
  const roleString = `[${userTag}${sectorRole}]`;
  return (
    <div className="text-sm">
      <div className="text-slate-500">
        <span className="text-slate-600 mr-2">[{timestamp}]</span>
        <span className="font-bold text-fuchsia-400">{`<${username}>`}</span>
        <span className="ml-2 text-cyan-400">{roleString}</span>
      </div>
      <div className="text-slate-200 pl-4 prose prose-sm prose-invert max-w-none">
        <Markdown>{decryptedContent}</Markdown>
      </div>
    </div>
  );
};

const ChatView = ({ channelName }) => {
  const { principal } = useAuthStore();
  const { activeSectorData } = useSectorStore();
  const chatState = useChatStore();
  const [messageInput, setMessageInput] = useState('');

  const chatContainerRef = useRef(null);
  const loaderRef = useRef(null);
  
  const isModerator = activeSectorData && 'Moderator' in activeSectorData.my_role;

  useEffect(() => {
    if (activeSectorData?.id && channelName) {
      // Assuming activeSectorData.id is a Principal
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
    chatState.fetchOlderMessages();
  }, [chatState.fetchOlderMessages]);


  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && chatState.hasOlderMessages && !chatState.isLoadingOlder) {
          handleFetchOlder();
        }
      },
      { root: chatContainerRef.current, threshold: 0.1 }
    );

    const loaderNode = loaderRef.current;
    if (loaderNode) observer.observe(loaderNode);
    return () => { if (loaderNode) observer.unobserve(loaderNode); };
  }, [handleFetchOlder, chatState.hasOlderMessages, chatState.isLoadingOlder]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
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
        {activeSectorData && activeSectorData.rekey_required && (
          <KeyRotationManager isModerator={isModerator} />
        )}
      </div>

      <div ref={chatContainerRef} className="flex-1 overflow-y-auto pr-2">
        {chatState.isLoading ? (
            <span className="loading loading-spinner mx-auto mt-4 block"></span>
        ) : (
            <>
                <div ref={loaderRef} className="text-center py-2">
                    {chatState.isLoadingOlder && (
                        <span className="loading loading-spinner loading-sm"></span>
                    )}
                </div>
                <div className="flex flex-col space-y-2">
                  {chatState.messages.map(msg => (
                    <MessageLine 
                      key={String(msg.id)} 
                      message={msg} 
                      securityModel={securityModel}
                      sectorId={activeSectorData.id}
                    />
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
            disabled={activeSectorData?.rekey_required}
          />
          <button 
            type="submit" 
            className="btn join-item bg-glassterm-accent text-black" 
            disabled={chatState.isSending || activeSectorData?.rekey_required}>
            {chatState.isSending ? <span className="loading loading-spinner loading-xs"></span> : "Send"}
          </button>
        </form>
         {activeSectorData?.rekey_required && <p className="text-xs text-red-400 mt-1">Messaging disabled until sector key is rotated.</p>}
      </div>
    </div>
  );
};

export default ChatView;