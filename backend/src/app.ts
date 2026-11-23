import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import projectsRouter from './routes/projects';
import { projectFileRouter, fileRouter } from './routes/files';
import executionRouter from './routes/execution';
import aiRouter from './routes/ai';
import githubRouter, { projectGithubRouter } from './routes/github';
import deploymentRouter, { projectDeploymentRouter } from './routes/deployments';
import vmRouter, { deploymentActionsRouter, projectDeployRouter } from './routes/vm';

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
  app.use('/api/projects/:projectId/files', projectFileRouter);
  app.use('/api/files', fileRouter);
  app.use('/api/execution', executionRouter);
  app.use('/api/projects/:id/ai', aiRouter);
  app.use('/api/github', githubRouter);
  app.use('/api/projects/:id/github', projectGithubRouter);
  app.use('/api/projects/:id/deployments', projectDeploymentRouter);
  app.use('/api/projects/:id/deploy', projectDeployRouter);
  app.use('/api/deployments', deploymentRouter);
  app.use('/api/deployments', deploymentActionsRouter);
  app.use('/api/vm', vmRouter);

  // ── Error handler — must be last ───────────────────────────────────────────

  app.use(errorHandler);

  return app;
}
