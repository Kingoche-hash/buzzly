import { useCallback, useEffect, useMemo, useState } from 'react';
import { PresenceContext } from './presenceContext';
import { useSocket } from '../hooks/useSocket';

export default function PresenceProvider({ children }) {
  const { socket } = useSocket();

  const [onlineIds, setOnlineIds] = useState(() => new Set());
  const [lastSeenById, setLastSeenById] = useState({});

  useEffect(() => {
    if (!socket) return;

    // Ask the server who is online right now.
    const sync = () => {
      socket.emit('get_presence', {}, (response) => {
        if (response?.ok) setOnlineIds(new Set(response.onlineUserIds));
      });
    };

    const handleOnline = ({ userId }) => {
      setOnlineIds((prev) => new Set(prev).add(userId));
    };

    const handleOffline = ({ userId, lastSeen }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      setLastSeenById((prev) => ({ ...prev, [userId]: lastSeen }));
    };

    socket.on('connect', sync); // also runs again after every reconnect
    socket.on('conversation_created', sync); // new contacts to learn about
    socket.on('blocks_changed', sync); // someone was blocked or unblocked
    socket.on('conversation_updated', sync); // a group gained or lost members
    socket.on('user_online', handleOnline);
    socket.on('user_offline', handleOffline);

    if (socket.connected) sync();

    return () => {
      socket.off('connect', sync);
      socket.off('conversation_created', sync);
      socket.off('blocks_changed', sync);
      socket.off('conversation_updated', sync);
      socket.off('user_online', handleOnline);
      socket.off('user_offline', handleOffline);
      setOnlineIds(new Set());
      setLastSeenById({});
    };
  }, [socket]);

  const isOnline = useCallback((userId) => onlineIds.has(userId), [onlineIds]);

  // A live value (even "hidden", which is null) wins over the value saved in the database.
  const getLastSeen = useCallback(
    (member) => (member._id in lastSeenById ? lastSeenById[member._id] : member.lastSeen),
    [lastSeenById]
  );

  const value = useMemo(() => ({ isOnline, getLastSeen }), [isOnline, getLastSeen]);

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}