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
const nodeEnv = process.env.NODE_ENV || 'development';
const isTest = nodeEnv === 'test';

export const env = {
  nodeEnv,
  port: Number(process.env.PORT) || 5001,
  mongoUri: process.env.MONGODB_URI,
  redisUrl: process.env.REDIS_URL,
  clientUrl: clientUrls[0],
  clientUrls,
  // How many hosting proxies sit in front of the server (0 on your computer, 1 on most hosts).
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  // Put in front of every Redis key, so development and production can share one free Redis safely.
  redisPrefix: process.env.REDIS_KEY_PREFIX || '',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  // Emails: "brevo" sends them for real, "console" prints them in the server terminal,
  // and "memory" (tests only) keeps them so a test can read the code.
  mail: {
    provider:
      process.env.MAIL_PROVIDER || (isTest ? 'memory' : process.env.BREVO_API_KEY ? 'brevo' : 'console'),
    brevoApiKey: process.env.BREVO_API_KEY || '',
    fromEmail: process.env.MAIL_FROM_EMAIL || '',
    fromName: process.env.MAIL_FROM_NAME || 'Buzzly',
  },
  // Text messages: "twilio" sends them for real (paid), "console" prints them, "memory" is for tests.
  sms: {
    provider:
      process.env.SMS_PROVIDER || (isTest ? 'memory' : process.env.TWILIO_ACCOUNT_SID ? 'twilio' : 'console'),
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    // A Twilio phone number, or a Messaging Service id that starts with MG.
    twilioFrom: process.env.TWILIO_FROM || '',
  },
  // Signing up with a phone number. On by default while developing, OFF in production until PHONE_SIGNUP=on.
  phoneSignup: process.env.PHONE_SIGNUP ? process.env.PHONE_SIGNUP === 'on' : nodeEnv !== 'production',
};
