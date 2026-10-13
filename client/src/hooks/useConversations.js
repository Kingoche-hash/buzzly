import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchConversations,
  setWallpaperPhotoRequest,
  updateConversationStateRequest,
} from '../services/chat.service';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useAuth } from './useAuth';
import { useSocket } from './useSocket';

const sortByRecent = (list) =>
  [...list].sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

const addIfMissing = (list, conversation) =>
  list.some((c) => c._id === conversation._id) ? list : sortByRecent([conversation, ...list]);

// activeId: the chat that is open, so its new messages do not count as unread while you look at it.
export const useConversations = (activeId = null) => {
  const { socket } = useSocket();
  const { user } = useAuth();
  const myId = user?._id;

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const activeIdRef = useRef(activeId);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Load the list (again, when the person clicks "Try again").
  useEffect(() => {
    let cancelled = false;

    fetchConversations()
      .then((list) => {
        if (cancelled) return;
        setConversations(list);
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
  }, [reloadKey]);

  const reload = useCallback(() => {
    setLoading(true);
    setError('');
    setReloadKey((key) => key + 1);
  }, []);

  // Keep it live.
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (message) => {
      const fromMe = message.sender._id === myId;

      const looking =
        activeIdRef.current === message.conversation &&
        document.visibilityState === 'visible' &&
        document.hasFocus();

      setConversations((prev) => {
        if (!prev.some((c) => c._id === message.conversation)) return prev;

        return sortByRecent(
          prev.map((c) => {
            if (c._id !== message.conversation) return c;

            const unread = c.unreadCount ?? 0;

            // A new message brings a deleted chat back into the list.
            const state = c.state?.deletedAt ? { ...c.state, deletedAt: null } : c.state;

            return {
              ...c,
              state,
              lastMessage: message,
              lastMessageAt: message.createdAt,
              unreadCount: fromMe || looking ? unread : unread + 1,
            };
          })
        );
      });
    };

    const handleCreated = (conversation) => {
      setConversations((prev) => addIfMissing(prev, conversation));
    };

    // When I read a chat (in any of my windows), its unread counter goes back to zero.
    const handleRead = ({ conversationId, userId }) => {
      if (userId !== myId) return;

      setConversations((prev) =>
        prev.map((c) =>
          c._id === conversationId && c.unreadCount ? { ...c, unreadCount: 0 } : c
        )
      );
    };

    // My private settings for a chat changed (maybe in another of my windows).
    const handleState = ({ conversationId, state }) => {
      setConversations((prev) => prev.map((c) => (c._id === conversationId ? { ...c, state } : c)));
    };

    // Someone changed their name or photo: update them in every chat they are part of.
    const handleProfile = ({ userId, username, displayName, avatar }) => {
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          members: c.members.map((member) =>
            member._id === userId ? { ...member, username, displayName, avatar } : member
          ),
        }))
      );
    };

    // A block was added or removed (by me or by someone else): fetch the list again, quietly.
    const handleBlocks = () => {
      fetchConversations()
        .then((list) => setConversations(list))
        .catch(() => {});
    };

    // A message changed (edited, deleted for everyone...): keep the preview under the chat's name right.
    const handleUpdated = (message) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.lastMessage?._id === message._id ? { ...c, lastMessage: { ...c.lastMessage, ...message } } : c
        )
      );
    };

    socket.on('receive_message', handleMessage);
    socket.on('message_updated', handleUpdated);
    socket.on('message_removed', handleBlocks);
    socket.on('conversation_created', handleCreated);
    socket.on('messages_read', handleRead);
    socket.on('conversation_state', handleState);
    socket.on('profile_updated', handleProfile);
    socket.on('blocks_changed', handleBlocks);

    return () => {
      socket.off('receive_message', handleMessage);
      socket.off('message_updated', handleUpdated);
      socket.off('message_removed', handleBlocks);
      socket.off('conversation_created', handleCreated);
      socket.off('messages_read', handleRead);
      socket.off('conversation_state', handleState);
      socket.off('profile_updated', handleProfile);
      socket.off('blocks_changed', handleBlocks);
    };
  }, [socket, myId]);

  const addConversation = useCallback((conversation) => {
    setConversations((prev) => addIfMissing(prev, conversation));
  }, []);

  // patch: { pinned, muted, spam, deleted, wallpaper } (any of them).
  const updateState = useCallback(async (conversationId, patch) => {
    // A photo wallpaper travels as a file, everything else as a small change.
    const state = patch.wallpaperFile
      ? await setWallpaperPhotoRequest(conversationId, patch.wallpaperFile)
      : await updateConversationStateRequest(conversationId, patch);

    setConversations((prev) => prev.map((c) => (c._id === conversationId ? { ...c, state } : c)));
  }, []);

  return { conversations, loading, error, addConversation, reload, updateState };
};