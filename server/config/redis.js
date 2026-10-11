import Redis from 'ioredis';
import { env } from './env.js';

export const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  connectTimeout: 10000,
  maxRetriesPerRequest: 1,
});

redis.on('error', (error) => {
  console.error('Redis error:', error.message);
});

export const connectRedis = async () => {
  await redis.connect();
  console.log('Redis connected');
};