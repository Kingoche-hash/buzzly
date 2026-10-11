import { io } from 'socket.io-client';
import { getToken } from '../services/tokenStorage';

// `auth` is a function, so every reconnect uses the newest token.
export const createSocket = () =>
  io(import.meta.env.VITE_SOCKET_URL, {
    auth: (callback) => callback({ token: getToken() }),
  });
