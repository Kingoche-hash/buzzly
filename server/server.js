import http from 'http';
import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { connectRedis, redis } from './config/redis.js';
import { resetPresence } from './services/presence.service.js';
import { cleanupExpiredStories } from './services/story.service.js';
import User from './models/User.js';
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

    // An account can now have a phone number and no email, so the indexes on users must allow that.
    await User.syncIndexes().catch((error) => console.error('Could not update the user indexes:', error.message));

    // Sign-ups that were never confirmed are removed after a day.
    await User.deleteMany({
      verified: false,
      createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }).catch((error) => console.error('Could not clean up old sign-ups:', error.message));
    // Clearing old presence is housekeeping: if Redis is slow or over its free limit, the server should still start.
    await resetPresence().catch((error) => console.error('Could not reset presence:', error.message));

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