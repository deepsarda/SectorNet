import React, { useEffect, useRef, useCallback, useState } from 'react';
import useGlobalFeedStore from '../../store/globalFeedStore';
import useAuthStore from '../../store/authStore';
import Markdown from 'react-markdown';

const NewPostForm = ({ onSubmit, isSubmitting, submissionError }) => {
  const [content, setContent] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    
    const result = await onSubmit(content);
    if (result.Ok) {
      setContent(''); // Clear form on success
    }
  };

  return (
    <div className="p-4 mb-4 bg-slate-800/50 border border-glassterm-border rounded-md">
      <h3 className="text-lg text-glassterm-accent font-bold mb-2">Create New Global Post</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          className="textarea textarea-bordered bg-slate-900 w-full h-24"
          placeholder="Share something with the entire network..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
        ></textarea>
        {submissionError && <p className="text-red-400 text-xs">{submissionError}</p>}
        <div className="text-right">
          <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
            {isSubmitting ? <span className="loading loading-spinner loading-xs"></span> : "Broadcast Post"}
          </button>
        </div>
      </form>
    </div>
  );
};


const PostItem = ({ post }) => {
  const date = new Date(Number(post.timestamp / 1_000_000n));

  // Safely access optional properties
  const userTag = post.author_user_tag?.[0] ? Object.keys(post.author_user_tag[0])[0] : 'User';
  const sectorRole = post.author_sector_role?.[0] ? ` | ${Object.keys(post.author_sector_role[0])[0]}` : '';
  const origin = post.origin_sector_id?.[0] ? `from [${post.origin_sector_id[0].toText().substring(0, 5)}]` : 'from [Direct]';
  
  return (
    <div className="border border-slate-700 p-4 bg-slate-900/20 rounded-md">
      <p className="text-sm text-fuchsia-400">
        {`<${post.author_username}> [${userTag}${sectorRole}] ${origin}`}
      </p>
      <div className="divider before:bg-slate-700 after:bg-slate-700 my-2"></div>
      <div className="text-slate-200 prose prose-sm prose-invert max-w-none">
        <Markdown>{post.content_markdown}</Markdown>
      </div>
      <p className="text-xs text-slate-500 text-right mt-2">{date.toLocaleString()}</p>
    </div>
  );
};

const GlobalFeedView = () => {
  const { 
    posts, 
    isLoading, 
    isLoadingMore, 
    hasMore, 
    error, 
    fetchInitialFeed, 
    fetchMorePosts,
    isSubmitting,
    submissionError,
    submitDirectPost,
  } = useGlobalFeedStore();

  const { userProfile } = useAuthStore(); // Get user profile for role checking
  const observer = useRef();

  // Determine if the current user has posting privileges
  const canPostGlobally = userProfile?.tags?.some(tag => 'Admin' in tag || 'GlobalPoster' in tag);

  const lastPostElementRef = useCallback(node => {
    if (isLoading) return; // Don't observe while loading
    if (observer.current) observer.current.disconnect(); // Disconnect previous observer
    
    observer.current = new IntersectionObserver(entries => {
      // If the loader element is visible and we have more posts to load...
      if (entries[0].isIntersecting && hasMore) {
        fetchMorePosts();
      }
    });

    if (node) observer.current.observe(node); // Start observing the new loader element
  }, [isLoading, hasMore, fetchMorePosts]);



  useEffect(() => {
    fetchInitialFeed();
  }, [fetchInitialFeed]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <span className="loading loading-spinner text-glassterm-accent loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }
  
  return (
    <div>
      <h2 className="text-xl text-slate-100 mb-4">Global Feed</h2>

      {canPostGlobally && (
        <NewPostForm 
          onSubmit={submitDirectPost}
          isSubmitting={isSubmitting}
          submissionError={submissionError}
        />
      )}
      
      {posts.length === 0 ? (
        <p className="text-slate-400 text-center py-8">The global feed is quiet...</p>
      ) : (
        <div className="flex flex-col space-y-4">
          {posts.map((post, index) => {
            if (posts.length === index + 1) {
              return <div ref={lastPostElementRef} key={String(post.id)}><PostItem post={post} /></div>;
            } else {
              return <PostItem key={String(post.id)} post={post} />;
            }
          })}

          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <span className="loading loading-spinner text-glassterm-accent"></span>
            </div>
          )}

          {!hasMore && (
            <div className="text-center text-slate-500 py-4">
              <p>You've reached the end of the feed.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalFeedView;