import http from 'http';
import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { connectRedis, redis } from './config/redis.js';
import { resetPresence } from './services/presence.service.js';
import { cleanupExpiredStories } from './services/story.service.js';
import { initSocket } from './socket/index.js';

const server = http.createServer(app);
const io = initSocket(server);

const runStoryCleanup = () => {
  cleanupExpiredStories().catch((error) => console.error('Story cleanup error:', error.message));
};

const start = async () => {
  try {
    await connectDB();
    await connectRedis();
    await resetPresence();

    server.listen(env.port, () => {
      console.log(`Server running on port ${env.port} (${env.nodeEnv})`);

      // Remove expired stories now, and then every hour.
      runStoryCleanup();
      setInterval(runStoryCleanup, 60 * 60 * 1000);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  console.log(`${signal} received, shutting down...`);
  // io.close() also closes the HTTP server.
  io.close(async () => {
    await mongoose.connection.close();
    redis.disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();