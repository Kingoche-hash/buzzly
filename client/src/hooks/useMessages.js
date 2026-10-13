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
import { removeArrived, removePending, updatePending } from '../utils/pending';
import { useAuth } from './useAuth';
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
  const { user } = useAuth();
  const myId = user._id;

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

  // Messages I am sending right now, or that could not be sent.
  const [pending, setPending] = useState([]);
  const pendingRef = useRef([]);
  const tempCounter = useRef(0);

  const hasNewerRef = useRef(Boolean(aroundId));

  useEffect(() => {
    hasNewerRef.current = hasNewer;
  }, [hasNewer]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

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

      // My own message came back through the live line: it is no longer "sending".
      if (message.sender._id === myId) {
        setPending((prev) => removeArrived(prev, message.content));
      }

      // While reading the past, new messages wait until "Jump to latest".
      if (hasNewerRef.current) return;

      addMessage(message);
    };

    socket.on('receive_message', handleMessage);

    return () => {
      socket.off('receive_message', handleMessage);
    };
  }, [socket, conversationId, addMessage, myId]);

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

  // Tries to send one waiting message through the live line.
  const attempt = useCallback(
    (item) => {
      const change = (patch) => setPending((prev) => updatePending(prev, item.tempId, patch));
      const fail = (reason) => change({ status: 'failed', error: reason });

      change({ status: 'sending', error: '' });

      if (!socket || !socket.connected) {
        fail('Not connected to the server yet.');
        return;
      }

      socket
        .timeout(8000)
        .emit(
          'send_message',
          { conversationId, content: item.content, replyTo: item.replyTo },
          (err, response) => {
            if (err) return fail('The server did not answer.');
            if (!response.ok) return fail(response.error);

            setPending((prev) => removePending(prev, item.tempId));

            // If we were reading the past, go to the latest so the new message is visible.
            if (hasNewerRef.current) jumpToLatest();
            else addMessage(response.message);
          }
        );
    },
    [socket, conversationId, addMessage, jumpToLatest]
  );

  // Sends text. The message shows up at once as "sending" and turns into a real message when saved,
  // or into a "not sent" message with Retry if it fails.
  // replyTo: the id of the message this one answers (optional). replyPreview: what to show of it meanwhile.
  const send = useCallback(
    async (content, replyTo, replyPreview) => {
      tempCounter.current += 1;

      const item = {
        tempId: `pending-${tempCounter.current}`,
        content,
        replyTo,
        replyPreview,
        status: 'sending',
        error: '',
      };

      setPending((prev) => [...prev, item]);
      attempt(item);
    },
    [attempt]
  );

  const retryPending = useCallback(
    (tempId) => {
      const item = pendingRef.current.find((entry) => entry.tempId === tempId);
      if (item) attempt(item);
    },
    [attempt]
  );

  const discardPending = useCallback((tempId) => {
    setPending((prev) => removePending(prev, tempId));
  }, []);

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
    pending,
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
    retryPending,
    discardPending,
    sendFiles,
    editMessage,
    deleteMessage,
    reactToMessage,
  };
};
