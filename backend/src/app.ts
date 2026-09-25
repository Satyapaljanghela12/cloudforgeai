import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import projectsRouter from './routes/projects';

export function createApp(): Application {
  const app = express();

  // ── Core middleware ────────────────────────────────────────────────────────

  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true, // Required for cookies
    })
  );

  app.use(express.json());

  /**
   * cookie-parser — parses Cookie header into req.cookies.
   * Required to read the httpOnly JWT token from incoming requests.
   */
  app.use(cookieParser());

  app.use(requestLogger);

  // ── Routes ─────────────────────────────────────────────────────────────────

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);

  // ── Error handler — must be last ───────────────────────────────────────────

  app.use(errorHandler);

  return app;
}
