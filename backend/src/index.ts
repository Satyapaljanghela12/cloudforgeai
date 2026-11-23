import http from 'http';
import { createApp } from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { connectDatabase } from './db/pool';
import { runMigrations } from './db/migrate';
import { createExecutionWebSocketServer } from './websocket/executionSocket';
import { createShellWebSocketServer } from './websocket/shellSocket';
import { checkDocker } from './execution/dockerService';
import { initDeploymentDocker } from './deployment/deploymentService';

async function main(): Promise<void> {
  await connectDatabase();
  await runMigrations();
  await checkDocker();
  await initDeploymentDocker();

  const app = createApp();
  const httpServer = http.createServer(app);

  // Create WebSocket servers — they register on the httpServer's 'upgrade' event
  const execWss = createExecutionWebSocketServer(httpServer);
  const shellWss = createShellWebSocketServer(httpServer);

  /**
   * Why explicitly handle 'upgrade'?
   * Express 5 intercepts ALL incoming HTTP requests including WebSocket
   * upgrade requests and returns 400 before the ws library can process them.
   *
   * By listening to the raw 'upgrade' event on the Node HTTP server,
   * we route WebSocket upgrades directly to the correct WebSocketServer
   * before Express ever sees them.
   */
  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url ?? '/', `http://localhost:${config.port}`);

    logger.info('WebSocket upgrade request', { path: pathname });

    if (pathname === '/ws/execution') {
      execWss.handleUpgrade(request, socket, head, (ws) => {
        execWss.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/shell') {
      shellWss.handleUpgrade(request, socket, head, (ws) => {
        shellWss.emit('connection', ws, request);
      });
    } else {
      logger.warn('Unknown WebSocket path, destroying socket', { path: pathname });
      socket.destroy();
    }
  });

  httpServer.listen(config.port, () => {
    logger.info('CloudForge AI backend started', {
      port: config.port,
      environment: config.nodeEnv,
    });
  });

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
