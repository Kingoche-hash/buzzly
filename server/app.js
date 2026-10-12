import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import profileRoutes from './routes/profile.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import searchRoutes from './routes/search.routes.js';
import storyRoutes from './routes/story.routes.js';
import postRoutes from './routes/post.routes.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

// Behind a hosting company's proxy, the real visitor address is in a header.
app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');

app.use(helmet());
app.use(compression());
app.use(cors({ origin: env.clientUrls, credentials: true }));
app.use(express.json({ limit: '10kb' }));

// The health check stays outside the limiter, so monitoring never gets blocked.
app.use('/api/health', healthRoutes);

app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/posts', postRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
