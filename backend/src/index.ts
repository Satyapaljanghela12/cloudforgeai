import http from 'http';
import { createApp } from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { connectDatabase } from './db/pool';
import { runMigrations } from './db/migrate';
import { createExecutionWebSocketServer } from './websocket/executionSocket';
import { createShellWebSocketServer } from './websocket/shellSocket';
import { checkDocker } from './execution/dockerService';

/**
 * Server entry point.
 *
 * Startup sequence:
 * 1. Verify database connection
 * 2. Run migrations
 * 3. Check Docker availability (non-fatal — app runs without it)
 * 4. Create HTTP server from Express app
 * 5. Attach WebSocket server to the same HTTP server
 * 6. Start listening
 *
 * Why attach WebSocket to the same server?
 * Both HTTP and WebSocket can share port 3001. The WebSocket upgrade
 * request arrives as a normal HTTP request with an "Upgrade" header.
 * Express ignores it (it's not a route match), and the ws library
 * intercepts it. No extra port needed.
 */
async function main(): Promise<void> {
  await connectDatabase();
  await runMigrations();

  // Docker check is non-fatal — the IDE still works without execution
  await checkDocker();

  const app = createApp();

  // Create a plain Node HTTP server wrapping Express.
  // This lets us attach the WebSocket server to the same port.
  const httpServer = http.createServer(app);

  // Attach WebSocket servers — both share port 3001
  createExecutionWebSocketServer(httpServer);
  createShellWebSocketServer(httpServer);

  httpServer.listen(config.port, () => {
    logger.info('CloudForge AI backend started', {
      port: config.port,
      environment: config.nodeEnv,
    });
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────────

  function shutdown(signal: string): void {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    httpServer.close(() => {
      logger.info('HTTP server closed. Process exiting.');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
    if (config.isProduction) process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
