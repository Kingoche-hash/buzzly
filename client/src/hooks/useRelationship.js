import { useCallback, useEffect, useState } from 'react';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  fetchRelationshipRequest,
  sendFriendRequest,
  unfriendRequest,
} from '../services/friend.service';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useSocket } from './useSocket';
import { useToast } from './useToast';

// My friendship with one person: 'none', 'outgoing', 'incoming' or 'friends' (null while loading).
// Pass enabled=false to wait (the chat menu only asks when it is opened).
export const useRelationship = (userId, enabled = true) => {
  const { socket } = useSocket();
  const { showToast } = useToast();

  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled || !userId) return;

    let cancelled = false;

    fetchRelationshipRequest(userId)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, enabled, reloadKey]);

  // Keep it live when the other person answers, or when someone is blocked.
  useEffect(() => {
    if (!socket || !enabled) return;

    const refresh = () => setReloadKey((key) => key + 1);

    socket.on('friends_changed', refresh);
    socket.on('blocks_changed', refresh);

    return () => {
      socket.off('friends_changed', refresh);
      socket.off('blocks_changed', refresh);
    };
  }, [socket, enabled]);

  const act = useCallback(
    async (request, describe) => {
      setBusy(true);

      try {
        const next = await request(userId);
        setStatus(next);
        showToast(describe(next));
        return true;
      } catch (err) {
        showToast({ title: 'Something went wrong', text: getErrorMessage(err) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [userId, showToast]
  );

  return {
    status,
    busy,
    send: () =>
      act(sendFriendRequest, (next) =>
        next === 'friends'
          ? { title: 'You are now friends', text: 'They had already asked you.' }
          : { title: 'Request sent', text: 'They will see it in their Friends window.' }
      ),
    accept: () => act(acceptFriendRequest, () => ({ title: 'You are now friends', text: 'Say hello!' })),
    decline: () => act(declineFriendRequest, () => ({ title: 'Request declined', text: 'It was removed.' })),
    cancel: () => act(cancelFriendRequest, () => ({ title: 'Request cancelled', text: 'It was removed.' })),
    unfriend: () => act(unfriendRequest, () => ({ title: 'Unfriended', text: 'You are no longer friends.' })),
  };
};
