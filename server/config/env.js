import dotenv from 'dotenv';

dotenv.config();

const required = [
  'MONGODB_URI',
  'JWT_SECRET',
  'REDIS_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}

// "https://a.com, https://b.com" becomes ['https://a.com', 'https://b.com'].
const parseList = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const clientUrls = parseList(process.env.CLIENT_URL || 'http://localhost:5173');

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5001,
  mongoUri: process.env.MONGODB_URI,
  redisUrl: process.env.REDIS_URL,
  clientUrl: clientUrls[0],
  clientUrls,
  // How many hosting proxies sit in front of the server (0 on your computer, 1 on most hosts).
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
};
