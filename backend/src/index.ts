import { createApp } from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { connectDatabase } from './db/pool';
import { runMigrations } from './db/migrate';

/**
 * Server entry point.
 *
 * Startup sequence:
 * 1. Verify database connection
 * 2. Run any pending migrations
 * 3. Start HTTP server
 *
 * Why this order?
 * If the database is unreachable, the app is useless.
 * Failing before binding the port means the process manager
 * (Docker, PM2) sees a failure and can restart or alert.
 */
async function main(): Promise<void> {
  // Verify DB is reachable
  await connectDatabase();

  // Apply any pending schema migrations
  await runMigrations();

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info('CloudForge AI backend started', {
      port: config.port,
      environment: config.nodeEnv,
    });
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────────

  function shutdown(signal: string): void {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    server.close(() => {
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
