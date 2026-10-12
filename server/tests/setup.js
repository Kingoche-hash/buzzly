// Runs before every test file. Points the server at a TEST database and fake services.
import dotenv from 'dotenv';

dotenv.config();

const testUri = process.env.MONGODB_TEST_URI;

if (!testUri) {
  console.error('MONGODB_TEST_URI is missing in server/.env (see the 10B guide, step 2).');
  process.exit(1);
}

const url = new URL(testUri);
const baseName = url.pathname.replace('/', '');

// Safety lock: the tests wipe their database, so refuse anything that is not a "_test" database.
if (!baseName.endsWith('_test')) {
  console.error(`Refusing to run: the test database is "${baseName}", but its name must end in "_test".`);
  process.exit(1);
}

// Every test process gets its OWN private database, so test files can never wipe each other's data.
url.pathname = `/${baseName.replace(/_test$/, '')}_${process.pid}_test`;

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = url.toString();
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.CLOUDINARY_CLOUD_NAME = 'test';
process.env.CLOUDINARY_API_KEY = 'test';
process.env.CLOUDINARY_API_SECRET = 'test';
process.env.CLIENT_URL = 'http://localhost:5173';
