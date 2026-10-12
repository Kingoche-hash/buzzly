import { env } from './env.js';

// In tests we use an in-memory fake Redis, so the tests never touch your real one.
const { default: Redis } =
  env.nodeEnv === 'test' ? await import('ioredis-mock') : await import('ioredis');

const options =
  env.nodeEnv === 'test'
    ? {}
    : { lazyConnect: true, connectTimeout: 10000, maxRetriesPerRequest: 1 };

export const redis = new Redis(env.redisUrl, options);

redis.on('error', (error) => {
  console.error('Redis error:', error.message);
});

export const connectRedis = async () => {
  await redis.connect();
  console.log('Redis connected');
};
