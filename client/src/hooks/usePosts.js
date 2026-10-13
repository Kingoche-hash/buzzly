import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFeedRequest } from '../services/post.service';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useAuth } from './useAuth';
import { useSocket } from './useSocket';

const addUnique = (list, extra) => {
  const seen = new Set(list.map((post) => post.itemId));
  return [...list, ...extra.filter((post) => !seen.has(post.itemId))];
};

// The feed (everyone's posts), or one person's posts when userId is given.
// type: 'posts' or 'reposts' (profile tabs). live: also count new posts that others publish.
//
// A repost is a separate ENTRY (itemId) that points at the original post (_id),
// so the same post can appear twice in a list.
export const usePosts = ({ userId = null, type, live = false, limit = 10 } = {}) => {
  const { socket } = useSocket();
  const { user } = useAuth();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const loadingMoreRef = useRef(false);

  // Load the first page (again, when reload() is called).
  useEffect(() => {
    let cancelled = false;

    fetchFeedRequest({ userId, type, limit })
      .then((data) => {
        if (cancelled) return;
        setPosts(data.posts);
        setHasMore(data.hasMore);
        setCursor(data.nextCursor);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, type, limit, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError('');
    setMoreError(false);
    setNewCount(0);
    setReloadKey((key) => key + 1);
  }, []);

  // Someone else published a post or a repost.
  useEffect(() => {
    if (!socket || !live) return;

    const handleCreated = ({ authorId }) => {
      if (authorId !== user._id) setNewCount((count) => count + 1);
    };

    socket.on('post_created', handleCreated);

    return () => {
      socket.off('post_created', handleCreated);
    };
  }, [socket, live, user._id]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(false);

    try {
      const data = await fetchFeedRequest({ userId, type, limit, before: cursor });
      setPosts((prev) => addUnique(prev, data.posts));
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    } catch {
      setMoreError(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, cursor, userId, type, limit]);

  // Change some fields of a post (a like, a comment count...) in every entry that shows it.
  const updatePost = useCallback((postId, patch) => {
    setPosts((prev) => prev.map((post) => (post._id === postId ? { ...post, ...patch } : post)));
  }, []);

  // The post is gone (deleted, or reported by me): remove every entry that shows it.
  const removePost = useCallback((postId) => {
    setPosts((prev) => prev.filter((post) => post._id !== postId));
  }, []);

  // Only one entry is gone (I undid my repost).
  const removeItem = useCallback((itemId) => {
    setPosts((prev) => prev.filter((post) => post.itemId !== itemId));
  }, []);

  // My own new post goes straight to the top.
  const addPost = useCallback((post) => {
    setPosts((prev) => [post, ...prev.filter((item) => item.itemId !== post.itemId)]);
  }, []);

  return {
    posts,
    loading,
    error,
    hasMore,
    loadingMore,
    moreError,
    loadMore,
    reload,
    newCount,
    updatePost,
    removePost,
    removeItem,
    addPost,
  };
};
