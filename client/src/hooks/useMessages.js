import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteMessageRequest,
  editMessageRequest,
  fetchMessages,
  removeReactionRequest,
  sendFilesRequest,
  setReactionRequest,
} from '../services/chat.service';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useSocket } from './useSocket';

const union = (a = [], b = []) => [...new Set([...a, ...b])];

// Joins lists together without duplicates, oldest first.
// If a message appears twice, the receipts from both copies are combined.
const mergeMessages = (...lists) => {
  const byId = new Map();

  lists.flat().forEach((message) => {
    const existing = byId.get(message._id);

    byId.set(
      message._id,
      existing
        ? {
            ...message,
            deliveredTo: union(existing.deliveredTo, message.deliveredTo),
            readBy: union(existing.readBy, message.readBy),
          }
        : message
    );
  });

  return [...byId.values()].sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
};

const withReceipt = (message, field, userId) =>
  message[field]?.includes(userId)
    ? message
    : { ...message, [field]: [...(message[field] || []), userId] };

// aroundId: open the conversation around this message (used when jumping to a search result).
export const useMessages = (conversationId, aroundId = null) => {
  const { socket } = useSocket();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // "hasNewer" means we are looking at the past and newer messages exist below.
  const [hasNewer, setHasNewer] = useState(Boolean(aroundId));
  const [newerCursor, setNewerCursor] = useState(null);
  const [loadingNewer, setLoadingNewer] = useState(false);

  const hasNewerRef = useRef(Boolean(aroundId));

  useEffect(() => {
    hasNewerRef.current = hasNewer;
  }, [hasNewer]);

  const addMessage = useCallback((message) => {
    setMessages((prev) => mergeMessages(prev, [message]));
  }, []);

  // Load the first page: the newest messages, or a window around one message.
  useEffect(() => {
    let cancelled = false;

    fetchMessages(conversationId, aroundId ? { around: aroundId } : {})
      .then((data) => {
        if (cancelled) return;
        setMessages((prev) => mergeMessages(data.messages, prev));
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
        setHasNewer(Boolean(data.hasNewer));
        setNewerCursor(data.newerCursor ?? null);
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
  }, [conversationId, aroundId]);

  // Listen for live messages in this conversation.
  useEffect(() => {
    if (!socket) return;

    socket.emit('join_conversation', { conversationId });

    const handleMessage = (message) => {
      if (message.conversation !== conversationId) return;

      // While reading the past, new messages wait until "Jump to latest".
      if (hasNewerRef.current) return;

      addMessage(message);
    };

    socket.on('receive_message', handleMessage);

    return () => {
      socket.off('receive_message', handleMessage);
    };
  }, [socket, conversationId, addMessage]);

  // A message in this chat changed (edited, deleted for everyone, reacted to) or was removed for me.
  useEffect(() => {
    if (!socket) return;

    const handleUpdated = (message) => {
      if (message.conversation !== conversationId) return;

      setMessages((prev) =>
        prev.some((item) => item._id === message._id) ? mergeMessages(prev, [message]) : prev
      );
    };

    const handleRemoved = ({ conversationId: id, messageId }) => {
      if (id !== conversationId) return;

      setMessages((prev) => prev.filter((item) => item._id !== messageId));
    };

    socket.on('message_updated', handleUpdated);
    socket.on('message_removed', handleRemoved);

    return () => {
      socket.off('message_updated', handleUpdated);
      socket.off('message_removed', handleRemoved);
    };
  }, [socket, conversationId]);

  // Listen for receipts: "this person got / read everything up to this message".
  useEffect(() => {
    if (!socket) return;

    const handleDelivered = ({ conversationId: id, userId, upToId }) => {
      if (id !== conversationId) return;

      setMessages((prev) =>
        prev.map((message) =>
          message._id <= upToId && message.sender._id !== userId
            ? withReceipt(message, 'deliveredTo', userId)
            : message
        )
      );
    };

    const handleRead = ({ conversationId: id, userId, upToId }) => {
      if (id !== conversationId) return;

      setMessages((prev) =>
        prev.map((message) =>
          message._id <= upToId && message.sender._id !== userId
            ? withReceipt(withReceipt(message, 'deliveredTo', userId), 'readBy', userId)
            : message
        )
      );
    };

    socket.on('messages_delivered', handleDelivered);
    socket.on('messages_read', handleRead);

    return () => {
      socket.off('messages_delivered', handleDelivered);
      socket.off('messages_read', handleRead);
    };
  }, [socket, conversationId]);

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder) return;

    setLoadingOlder(true);

    try {
      const data = await fetchMessages(conversationId, { before: nextCursor });
      setMessages((prev) => mergeMessages(data.messages, prev));
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder, nextCursor]);

  const loadNewer = useCallback(async () => {
    if (!hasNewer || loadingNewer) return;

    setLoadingNewer(true);

    try {
      const data = await fetchMessages(conversationId, { after: newerCursor });
      setMessages((prev) => mergeMessages(prev, data.messages));
      setHasNewer(Boolean(data.hasNewer));
      setNewerCursor(data.newerCursor ?? null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingNewer(false);
    }
  }, [conversationId, hasNewer, loadingNewer, newerCursor]);

  // Back to the newest messages.
  const jumpToLatest = useCallback(async () => {
    try {
      const data = await fetchMessages(conversationId);
      setMessages(data.messages);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      setHasNewer(false);
      setNewerCursor(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [conversationId]);

  // Sends text through the live line and waits for the server's "got it".
  // replyTo: the id of the message this one answers (optional).
  const send = useCallback(
    (content, replyTo) =>
      new Promise((resolve, reject) => {
        if (!socket || !socket.connected) {
          reject(new Error('Not connected to the server yet'));
          return;
        }

        socket
          .timeout(8000)
          .emit('send_message', { conversationId, content, replyTo }, (err, response) => {
            if (err) return reject(new Error('The server did not answer. Please try again.'));
            if (!response.ok) return reject(new Error(response.error));

            // If we were reading the past, go to the latest so the new message is visible.
            if (hasNewerRef.current) jumpToLatest();
            else addMessage(response.message);

            resolve();
          });
      }),
    [socket, conversationId, addMessage, jumpToLatest]
  );

  // Sends files (with an optional caption) to the server, which stores them in Cloudinary.
  const sendFiles = useCallback(
    async (files, content, onProgress, replyTo) => {
      try {
        const message = await sendFilesRequest(conversationId, files, content, onProgress, replyTo);

        if (hasNewerRef.current) await jumpToLatest();
        else addMessage(message);
      } catch (err) {
        throw new Error(getErrorMessage(err));
      }
    },
    [conversationId, addMessage, jumpToLatest]
  );

  // Changes the text of my own message.
  const editMessage = useCallback(
    async (messageId, content) => {
      try {
        addMessage(await editMessageRequest(conversationId, messageId, content));
      } catch (err) {
        throw new Error(getErrorMessage(err));
      }
    },
    [conversationId, addMessage]
  );

  // scope: 'me' removes it from my chat, 'everyone' turns it into "This message was deleted".
  const deleteMessage = useCallback(
    async (messageId, scope) => {
      try {
        const updated = await deleteMessageRequest(conversationId, messageId, scope);

        if (scope === 'me') setMessages((prev) => prev.filter((item) => item._id !== messageId));
        else if (updated) addMessage(updated);
      } catch (err) {
        throw new Error(getErrorMessage(err));
      }
    },
    [conversationId, addMessage]
  );

  // emoji: one of the reactions, or null to take my reaction away.
  const reactToMessage = useCallback(
    async (messageId, emoji) => {
      try {
        addMessage(
          emoji
            ? await setReactionRequest(conversationId, messageId, emoji)
            : await removeReactionRequest(conversationId, messageId)
        );
      } catch (err) {
        throw new Error(getErrorMessage(err));
      }
    },
    [conversationId, addMessage]
  );

  return {
    messages,
    loading,
    error,
    hasMore,
    loadingOlder,
    loadOlder,
    hasNewer,
    loadingNewer,
    loadNewer,
    jumpToLatest,
    send,
    sendFiles,
    editMessage,
    deleteMessage,
    reactToMessage,
  };
};
