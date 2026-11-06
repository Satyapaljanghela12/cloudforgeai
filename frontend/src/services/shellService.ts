/**
 * Shell WebSocket client.
 *
 * Connects to /ws/shell and provides a persistent interactive shell
 * inside the project's Docker container. Unlike the execution client
 * (which runs a single command), this keeps /bin/sh alive so the user
 * can type any CLI command.
 *
 * Protocol:
 *   Client → Server:
 *     { type: 'init',   projectId, token, cols, rows }
 *     { type: 'input',  data: string }
 *     { type: 'resize', cols, rows }
 *
 *   Server → Client:
 *     { type: 'output', data: string }
 *     { type: 'exit' }
 *     { type: 'error', message: string }
 */

export type ShellStatus = 'disconnected' | 'connecting' | 'ready' | 'exited' | 'error';

type OutputHandler = (data: string) => void;
type StatusHandler = (status: ShellStatus) => void;

const SHELL_WS_URL = `ws://${window.location.hostname}:3001/ws/shell`;

export class ShellClient {
  private ws: WebSocket | null = null;
  private onOutput: OutputHandler;
  private onStatus: StatusHandler;

  constructor(onOutput: OutputHandler, onStatus: StatusHandler) {
    this.onOutput = onOutput;
    this.onStatus = onStatus;
  }

  connect(projectId: string, token: string, cols: number, rows: number) {
    if (this.ws) this.disconnect();

    this.onStatus('connecting');
    this.ws = new WebSocket(SHELL_WS_URL);

    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({
        type: 'init',
        projectId,
        token,
        cols,
        rows,
      }));
      this.onStatus('ready');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          data?: string;
          message?: string;
        };

        if (msg.type === 'output' && msg.data) {
          this.onOutput(msg.data);
        } else if (msg.type === 'exit') {
          this.onStatus('exited');
          this.ws = null;
        } else if (msg.type === 'error') {
          this.onOutput(`\r\n\x1b[31m[Shell error] ${msg.message ?? 'Unknown error'}\x1b[0m\r\n`);
          this.onStatus('error');
        }
      } catch { /* ignore */ }
    };

    this.ws.onerror = () => {
      this.onOutput('\r\n\x1b[31m[CloudForge] Shell connection failed. Is Docker running?\x1b[0m\r\n');
      this.onStatus('error');
      this.ws = null;
    };

    this.ws.onclose = () => {
      if (this.ws) {
        this.onStatus('disconnected');
        this.ws = null;
      }
    };
  }

  sendInput(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  sendResize(cols: number, rows: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
