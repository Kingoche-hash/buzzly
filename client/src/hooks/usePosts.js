import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFeedRequest } from '../services/post.service';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useAuth } from './useAuth';
import { useSocket } from './useSocket';

const addUnique = (list, extra) => {
  const seen = new Set(list.map((post) => post._id));
  return [...list, ...extra.filter((post) => !seen.has(post._id))];
};

// The feed (everyone's posts), or one person's posts when userId is given.
// live: also count new posts that other people publish while this is open.
export const usePosts = ({ userId = null, live = false } = {}) => {
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

    fetchFeedRequest({ userId })
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
  }, [userId, reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError('');
    setMoreError(false);
    setNewCount(0);
    setReloadKey((key) => key + 1);
  }, []);

  // Someone else published a post.
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
      const data = await fetchFeedRequest({ userId, before: cursor });
      setPosts((prev) => addUnique(prev, data.posts));
      setHasMore(data.hasMore);
      setCursor(data.nextCursor);
    } catch {
      setMoreError(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, cursor, userId]);

  // Change some fields of one post (a like, a comment count...).
  const updatePost = useCallback((postId, patch) => {
    setPosts((prev) => prev.map((post) => (post._id === postId ? { ...post, ...patch } : post)));
  }, []);

  const removePost = useCallback((postId) => {
    setPosts((prev) => prev.filter((post) => post._id !== postId));
  }, []);

  // My own new post goes straight to the top.
  const addPost = useCallback((post) => {
    setPosts((prev) => [post, ...prev.filter((item) => item._id !== post._id)]);
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
    addPost,
  };
};
