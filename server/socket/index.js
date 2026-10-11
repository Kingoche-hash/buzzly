import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { authenticateSocket } from './auth.js';
import { registerHandlers } from './handlers.js';
import { handlePresenceConnect, handlePresenceDisconnect } from './presence.js';
import { syncDelivered } from './receipts.js';
import { setIO } from './io.js';
import { conversationRoom, userRoom } from './emitters.js';

export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: env.clientUrls, credentials: true },
    maxHttpBufferSize: 1e5,
  });

  setIO(io);
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { user, conversationIds } = socket.data;

    socket.join(userRoom(user._id.toString()));
    conversationIds.forEach((id) => socket.join(conversationRoom(id)));

    registerHandlers(io, socket);
    handlePresenceConnect(io, socket);
    syncDelivered(io, socket);

    console.log(`Socket connected: ${user.username} (${socket.id})`);

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${user.username} (${reason})`);
      handlePresenceDisconnect(io, socket);
    });
  });

  return io;
};
