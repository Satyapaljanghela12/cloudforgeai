import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { authService } from '../services/authService';
import { fileService } from '../services/fileService';
import { projectService } from '../services/projectService';
import { startShell } from '../execution/shellService';
import type { ShellHandles } from '../execution/shellService';
import { logger } from '../utils/logger';

/**
 * Shell WebSocket server — /ws/shell
 *
 * Provides a persistent interactive shell inside a Docker container.
 * The user can type any CLI command and see real-time output.
 *
 * Protocol:
 *
 * Client → Server:
 *   { type: 'init',   projectId, token, cols, rows }  — open shell
 *   { type: 'input',  data: string }                   — keystrokes
 *   { type: 'resize', cols: number, rows: number }     — terminal resize
 *
 * Server → Client:
 *   { type: 'output', data: string }    — terminal output
 *   { type: 'exit' }                    — shell closed
 *   { type: 'error', message: string }  — error
 *
 * One shell per WebSocket connection. When the client disconnects,
 * the container is killed and removed.
 */

interface InitMessage {
  type: 'init';
  projectId: string;
  token: string;
  cols?: number;
  rows?: number;
}

interface InputMessage {
  type: 'input';
  data: string;
}

interface ResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

type ClientMessage = InitMessage | InputMessage | ResizeMessage;

function send(ws: WebSocket, payload: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function createShellWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/shell',
  });

  wss.on('connection', (ws: WebSocket) => {
    logger.info('Shell WebSocket client connected');

    let shellHandles: ShellHandles | null = null;

    ws.on('message', async (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        send(ws, { type: 'error', message: 'Invalid message format' });
        return;
      }

      // ── stdin input ──────────────────────────────────────────────────────
      if (msg.type === 'input') {
        shellHandles?.writeStdin(msg.data);
        return;
      }

      // ── resize ───────────────────────────────────────────────────────────
      if (msg.type === 'resize') {
        shellHandles?.resize(msg.cols, msg.rows);
        return;
      }

      // ── init — start the shell ───────────────────────────────────────────
      if (msg.type === 'init') {
        if (shellHandles) {
          send(ws, { type: 'error', message: 'Shell already running' });
          return;
        }

        // Authenticate
        let userId: string;
        try {
          const payload = authService.verifyToken(msg.token);
          userId = payload.userId;
        } catch {
          send(ws, { type: 'error', message: 'Unauthorized' });
          ws.close();
          return;
        }

        // Verify project ownership
        let project;
        try {
          project = await projectService.getProject(msg.projectId, userId);
        } catch {
          send(ws, { type: 'error', message: 'Project not found' });
          return;
        }

        // Load project files
        let files;
        try {
          files = await fileService.getFiles(msg.projectId, userId);
        } catch {
          send(ws, { type: 'error', message: 'Failed to load project files' });
          return;
        }

        logger.info('Starting shell', { projectId: msg.projectId, language: project.language });

        shellHandles = startShell(
          files,
          project.language,
          (data) => send(ws, { type: 'output', data }),
          () => {
            send(ws, { type: 'exit' });
            shellHandles = null;
          }
        );

        // Apply initial terminal size after a short delay
        if (msg.cols && msg.rows) {
          setTimeout(() => shellHandles?.resize(msg.cols!, msg.rows!), 600);
        }
      }
    });

    ws.on('close', () => {
      logger.info('Shell WebSocket client disconnected');
      shellHandles?.kill();
      shellHandles = null;
    });

    ws.on('error', (err) => {
      logger.error('Shell WebSocket error', { message: err.message });
      shellHandles?.kill();
      shellHandles = null;
    });
  });

  logger.info('Shell WebSocket server ready at /ws/shell');
  return wss;
}
