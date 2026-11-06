import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { authService } from '../services/authService';
import { fileService } from '../services/fileService';
import { projectService } from '../services/projectService';
import { executeInDocker } from '../execution/dockerService';
import type { ExecutionHandles } from '../execution/dockerService';
import { getRuntime } from '../execution/runtimes';
import { logger } from '../utils/logger';

/**
 * WebSocket execution server — Phase 5: bidirectional interactive terminal.
 *
 * Extended protocol:
 *
 * Client → Server:
 *   { type: 'run',    projectId: string, token: string,
 *                     cols: number, rows: number }   — start execution
 *   { type: 'stop' }                                 — kill container
 *   { type: 'input',  data: string }                 — stdin keystrokes
 *   { type: 'resize', cols: number, rows: number }   — terminal resized
 *
 * Server → Client:
 *   { type: 'output', data: string }   — stdout/stderr chunk
 *   { type: 'exit',   code: number }   — process exited
 *   { type: 'error',  message: string } — execution or auth error
 *
 * Why send initial cols/rows with 'run'?
 * The PTY must be sized correctly from the start. If we create a PTY
 * with the wrong size, programs that query terminal dimensions (like
 * Python's readline, or any curses app) will have wrong values until
 * the first resize event arrives.
 */

interface RunMessage {
  type: 'run';
  projectId: string;
  token: string;
  cols?: number;
  rows?: number;
}

interface StopMessage {
  type: 'stop';
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

type ClientMessage = RunMessage | StopMessage | InputMessage | ResizeMessage;

function send(ws: WebSocket, payload: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function createExecutionWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/execution',
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    logger.info('WebSocket client connected');

    let abortController: AbortController | null = null;
    let execHandles: ExecutionHandles | null = null;
    let authenticated = false;

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
        execHandles?.writeStdin(msg.data);
        return;
      }

      // ── terminal resize ──────────────────────────────────────────────────
      if (msg.type === 'resize') {
        execHandles?.resize(msg.cols, msg.rows);
        return;
      }

      // ── stop ─────────────────────────────────────────────────────────────
      if (msg.type === 'stop') {
        abortController?.abort();
        abortController = null;
        return;
      }

      // ── run ──────────────────────────────────────────────────────────────
      if (msg.type === 'run') {
        // Already running — reject
        if (abortController) {
          send(ws, { type: 'error', message: 'Already running' });
          return;
        }

        // 1. Authenticate
        let userId: string;
        try {
          const payload = authService.verifyToken(msg.token);
          userId = payload.userId;
          authenticated = true;
        } catch {
          send(ws, { type: 'error', message: 'Unauthorized' });
          ws.close();
          return;
        }

        // 2. Verify project ownership
        let project;
        try {
          project = await projectService.getProject(msg.projectId, userId);
        } catch {
          send(ws, { type: 'error', message: 'Project not found' });
          return;
        }

        // 3. Get runtime
        const runtime = getRuntime(project.language);
        if (!runtime) {
          send(ws, { type: 'error', message: `No runtime for language: ${project.language}` });
          return;
        }

        // 4. Load files
        let files;
        try {
          files = await fileService.getFiles(msg.projectId, userId);
        } catch {
          send(ws, { type: 'error', message: 'Failed to load project files' });
          return;
        }

        logger.info('Starting execution', {
          projectId: msg.projectId,
          language: project.language,
          runtime: runtime.dockerImage,
        });

        abortController = new AbortController();

        // 5. Start container — returns handles immediately (before container is up)
        const { promise, handles } = executeInDocker(
          files,
          runtime,
          (data) => send(ws, { type: 'output', data }),
          abortController.signal
        );

        execHandles = handles;

        // Apply initial terminal size if provided
        if (msg.cols && msg.rows) {
          // Slight delay — container needs to be started before resize works
          setTimeout(() => handles.resize(msg.cols!, msg.rows!), 500);
        }

        // 6. Await completion
        try {
          const result = await promise;
          send(ws, { type: 'exit', code: result.exitCode });
        } catch (err) {
          const message = (err as Error).message;
          logger.error('Execution failed', { message });
          send(ws, { type: 'error', message: `Execution failed: ${message}` });
        } finally {
          abortController = null;
          execHandles = null;
        }
      }
    });

    ws.on('close', () => {
      logger.info('WebSocket client disconnected');
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error', { message: err.message });
      if (authenticated && abortController) {
        abortController.abort();
      }
    });
  });

  logger.info('WebSocket execution server ready at /ws/execution');
  return wss;
}
