import { useCallback, useEffect, useState } from 'react';
import { fetchFriendsRequest } from '../services/friend.service';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useAuth } from './useAuth';
import { useSocket } from './useSocket';
import { useToast } from './useToast';

const EMPTY = { friends: [], incoming: [], outgoing: [], settings: { whoCanMessage: 'everyone' } };

// My friends, the requests waiting for me, and the requests I sent.
// notify: also show a pop-up when someone sends a request or accepts mine (use it once, in the Sidebar).
export const useFriends = ({ notify = false } = {}) => {
  const { socket } = useSocket();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchFriendsRequest()
      .then((result) => {
        if (cancelled) return;
        setData(result);
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

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!socket) return;

    const handleChanged = ({ kind, by } = {}) => {
      reload();

      if (!notify || !by || by._id === user._id) return;

      if (kind === 'request') {
        showToast({ title: 'New friend request', text: `${by.name} wants to be your friend.` });
      }

      if (kind === 'accepted') {
        showToast({ title: 'Friend request accepted', text: `You and ${by.name} are now friends.` });
      }
    };

    socket.on('friends_changed', handleChanged);
    socket.on('blocks_changed', reload);

    return () => {
      socket.off('friends_changed', handleChanged);
      socket.off('blocks_changed', reload);
    };
  }, [socket, notify, user._id, showToast, reload]);

  return { data, loading, error, reload, incomingCount: data.incoming.length };
};
