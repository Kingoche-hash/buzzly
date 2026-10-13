import { useEffect, useRef, useState } from 'react';
import { usePosts } from '../hooks/usePosts';
import PostCard from './PostCard';
import PostComposer from './PostComposer';

function PostSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-700 bg-slate-800 p-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-slate-700" />
        <div className="h-3 w-32 rounded bg-slate-700" />
      </div>
      <div className="mt-3 h-64 rounded-xl bg-slate-700" />
    </div>
  );
}

// The feed: everyone's posts and reposts, newest first.
// Shown beside the chat list on a computer, full screen on a phone.
export default function FeedPanel({ onBack }) {
  const {
    posts,
    loading,
    refreshing,
    error,
    refreshError,
    hasMore,
    loadingMore,
    moreError,
    loadMore,
    reload,
    refresh,
    newCount,
    updatePost,
    removePost,
    removeItem,
    addPost,
  } = usePosts({ live: true });

  const [composing, setComposing] = useState(false);
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);

  // When the bottom of the list comes into view, load the next page.
  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore || moreError) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '400px' }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, moreError, loadMore, posts.length]);

  // Fetch the newest posts and go to the top. Used by the refresh button and the "new posts" button.
  const handleRefresh = () => {
    if (refreshing) return;

    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    refresh();
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-slate-700 bg-slate-900 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to chats"
          className="rounded-lg px-2 py-1 hover:bg-slate-700 md:hidden"
        >
          ←
        </button>
        <h1 className="font-semibold">Feed</h1>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label={refreshing ? 'Refreshing the feed' : 'Refresh the feed'}
          title="Refresh"
          className="ml-auto rounded-lg bg-slate-700 px-3 py-1 text-lg leading-none hover:bg-slate-600 disabled:opacity-60"
        >
          <span aria-hidden="true" className={`inline-block ${refreshing ? 'animate-spin' : ''}`}>
            ↻
          </span>
        </button>

        <button
          type="button"
          onClick={() => setComposing(true)}
          className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-semibold hover:bg-emerald-500"
        >
          ＋ New post
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl space-y-4 px-3 py-4">
          {newCount > 0 && (
            <button
              type="button"
              onClick={handleRefresh}
              className="sticky top-2 z-10 mx-auto block rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold shadow-lg hover:bg-emerald-500"
            >
              ↑ {newCount === 1 ? '1 new post' : `${newCount} new posts`}
            </button>
          )}

          {refreshError && (
            <p role="alert" className="rounded-lg bg-red-950/60 px-3 py-2 text-center text-sm text-red-300">
              Could not refresh. {refreshError}{' '}
              <button type="button" onClick={handleRefresh} className="underline">
                Try again
              </button>
            </p>
          )}

          {loading && posts.length === 0 && (
            <>
              <PostSkeleton />
              <PostSkeleton />
            </>
          )}

          {error && (
            <div role="alert" className="py-10 text-center text-sm text-red-400">
              <p>{error}</p>
              <button
                type="button"
                onClick={reload}
                className="mt-3 rounded-lg bg-slate-700 px-3 py-1 text-slate-100 hover:bg-slate-600"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && posts.length === 0 && (
            <div className="py-16 text-center text-sm text-slate-500">
              <p className="text-4xl" aria-hidden="true">
                📸
              </p>
              <p className="mt-2 font-medium text-slate-300">No posts yet</p>
              <p className="mt-1">Be the first to share a photo.</p>
            </div>
          )}

          {posts.map((post) => (
            <PostCard
              key={post.itemId}
              post={post}
              onChange={updatePost}
              onRemove={removePost}
              onRemoveItem={removeItem}
            />
          ))}

          {hasMore && !moreError && (
            <div ref={sentinelRef} className="py-4 text-center text-sm text-slate-500">
              {loadingMore ? 'Loading...' : ''}
            </div>
          )}

          {moreError && (
            <div className="py-4 text-center text-sm text-red-400">
              <p>Could not load more posts.</p>
              <button
                type="button"
                onClick={loadMore}
                className="mt-2 rounded-lg bg-slate-700 px-3 py-1 text-slate-100 hover:bg-slate-600"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && !hasMore && posts.length > 0 && (
            <p className="py-4 text-center text-xs text-slate-500">You are all caught up ✨</p>
          )}
        </div>
      </div>

      {composing && <PostComposer onClose={() => setComposing(false)} onPosted={addPost} />}
    </section>
  );
}
