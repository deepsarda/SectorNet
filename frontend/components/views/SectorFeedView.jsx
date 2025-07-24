import React, { useEffect, useRef, useCallback, useState } from 'react';
import useSectorStore from '../../store/sectorStore';
import useAuthStore from '../../store/authStore';
import cryptoService from '../../services/cryptoService';
import Markdown from 'react-markdown';

const SectorPostItem = ({ post, sectorId, epoch }) => {
  const [decryptedContent, setDecryptedContent] = useState('[Decrypting...]');
  const [authorUsername, setAuthorUsername] = useState('...');
  
  const date = new Date(Number(post.timestamp / 1_000_000n));

  useEffect(() => {
    setAuthorUsername(post.author_principal.toText().substring(0, 12));

    const decrypt = async () => {
      const encryptedBuffer = new Uint8Array(post.encrypted_content_markdown).buffer;
      const key = cryptoService.getSectorKey(sectorId.toText(), epoch);
      if (!key) {
        setDecryptedContent('[Error: No key available for this post]');
        return;
      }
      const plaintext = await cryptoService.decryptMessage(encryptedBuffer, key);
      setDecryptedContent(plaintext || '[Decryption Failed]');
    };

    decrypt();
  }, [post, sectorId, epoch]);

  return (
    <div className="border border-slate-700 p-4 bg-slate-900/20 rounded-md">
      <p className="text-sm text-fuchsia-400">
        {`<${authorUsername}>`}
      </p>
      <div className="divider before:bg-slate-700 after:bg-slate-700 my-2"></div>
      <div className="text-slate-200 prose prose-sm prose-invert max-w-none">
        <Markdown>{decryptedContent}</Markdown>
      </div>
      <p className="text-xs text-slate-500 text-right mt-2">{date.toLocaleString()}</p>
    </div>
  );
};

const SectorFeedView = () => {
  const { 
    activeSectorData,
    sectorPosts, 
    isFeedLoading, 
    hasMoreFeed, 
    fetchInitialSectorFeed, 
    fetchMoreSectorFeed 
  } = useSectorStore();

  const observer = useRef();

  const lastPostElementRef = useCallback(node => {
    if (isFeedLoading) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMoreFeed) {
        fetchMoreSectorFeed();
      }
    });

    if (node) observer.current.observe(node);
  }, [isFeedLoading, hasMoreFeed, fetchMoreSectorFeed]);


  useEffect(() => {
    if (activeSectorData?.id) {
      fetchInitialSectorFeed();
    }
  }, [activeSectorData?.id, fetchInitialSectorFeed]);

  if (isFeedLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <span className="loading loading-spinner text-glassterm-accent loading-lg"></span>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl text-slate-100 mb-4">{activeSectorData?.name} Feed</h2>
      <div className="flex flex-col space-y-4">
        {sectorPosts.map((post, index) => {
          const props = {
            key: post.id,
            post: post,
            sectorId: activeSectorData.id,
            // Assuming for now all posts are encrypted with the current key epoch
            // A more robust solution would store the epoch with the post
            epoch: activeSectorData.current_key_epoch,
          };
          if (sectorPosts.length === index + 1) {
            return <div ref={lastPostElementRef}><SectorPostItem {...props} /></div>;
          } else {
            return <SectorPostItem {...props} />;
          }
        })}
        {!hasMoreFeed && <p className="text-center text-slate-500 py-4">End of Sector Feed.</p>}
      </div>
    </div>
  );
};

export default SectorFeedView;