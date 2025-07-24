import React, { useEffect, useRef, useCallback } from 'react';
import useGlobalFeedStore from '../../store/globalFeedStore';
import Markdown from 'react-markdown'

const PostItem = ({ post }) => {
  const date = new Date(Number(post.timestamp / 1_000_000n));
  return (
    <div className="border border-slate-700 p-4 bg-slate-900/20 rounded-md">
      <p className="text-sm text-fuchsia-400">
        {`<${post.author_username}> [${Object.keys(post.author_user_tag[0])[0]} ${post.author_sector_role ? " | " + Object.keys(post.author_sector_role[0])[0] : ''}] from [${post.origin_sector_id[0]?.toText().substring(0, 5) ?? 'Direct'}]`}
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
    fetchMorePosts 
  } = useGlobalFeedStore();

  const observer = useRef();

  // This callback ref is the key. It's called by React when the element is mounted.
  // We set up our IntersectionObserver here.
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
    // Fetch the initial set of posts when the component first mounts.
    fetchInitialFeed();
  }, [fetchInitialFeed]);

  // Handle initial loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <span className="loading loading-spinner text-glassterm-accent loading-lg"></span>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return <p className="text-red-400">{error}</p>;
  }
  
  // Handle empty state
  if (posts.length === 0) {
      return <p className="text-slate-400">The global feed is quiet...</p>;
  }

  return (
    <div>
      <h2 className="text-xl text-slate-100 mb-4">Global Feed</h2>
      <div className="flex flex-col space-y-4">
        {posts.map((post, index) => {
          // If this is the last post, attach our ref to it.
          if (posts.length === index + 1) {
            return <div ref={lastPostElementRef} key={String(post.id)}><PostItem post={post} /></div>;
          } else {
            return <PostItem key={String(post.id)} post={post} />;
          }
        })}

        {/* Show a loading spinner at the bottom while fetching more posts */}
        {isLoadingMore && (
          <div className="flex justify-center py-4">
            <span className="loading loading-spinner text-glassterm-accent"></span>
          </div>
        )}

        {/* Show a message when there are no more posts to load */}
        {!hasMore && (
          <div className="text-center text-slate-500 py-4">
            <p>You've reached the end of the feed.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalFeedView;
