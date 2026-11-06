/**
 * Execution WebSocket client — Phase 5: bidirectional interactive terminal.
 *
 * New outbound message types:
 *   { type: 'input',  data: string }          — stdin from xterm.js
 *   { type: 'resize', cols: number, rows: number } — terminal resize
 *
 * The 'run' message now includes initial cols/rows so the PTY
 * is sized correctly from the moment execution starts.
 */

export type ExecutionMessage =
  | { type: 'output'; data: string }
  | { type: 'exit'; code: number }
  | { type: 'error'; message: string };

export type ExecutionStatus = 'idle' | 'running' | 'finished' | 'error';

type MessageHandler = (msg: ExecutionMessage) => void;
type StatusHandler = (status: ExecutionStatus) => void;

// Use relative WebSocket URL so it works on any host/port
const WS_URL = `ws://${window.location.hostname}:3001/ws/execution`;

export class ExecutionClient {
  private ws: WebSocket | null = null;
  private onMessage: MessageHandler;
  private onStatus: StatusHandler;

  constructor(onMessage: MessageHandler, onStatus: StatusHandler) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  run(projectId: string, token: string, cols: number, rows: number) {
    if (this.ws) this.close();

    this.ws = new WebSocket(WS_URL);
    this.onStatus('running');

    this.ws.onopen = () => {
      this.ws!.send(JSON.stringify({
        type: 'run',
        projectId,
        token,
        cols,
        rows,
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ExecutionMessage;
        this.onMessage(msg);
        if (msg.type === 'exit' || msg.type === 'error') {
          this.onStatus(msg.type === 'exit' ? 'finished' : 'error');
          this.ws?.close();
          this.ws = null;
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onerror = () => {
      this.onMessage({ type: 'error', message: 'Connection to execution server failed. Is Docker running?' });
      this.onStatus('error');
      this.ws = null;
    };

    this.ws.onclose = () => {
      // Only reset to idle if we didn't already handle exit/error
      if (this.ws) {
        this.onStatus('idle');
        this.ws = null;
      }
    };
  }

  /**
   * Send stdin data to the running container.
   * Called by xterm.js onData — every keystroke, paste, etc.
   */
  sendInput(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  /**
   * Notify the container PTY of a terminal resize.
   * Called when the xterm.js container resizes.
   */
  sendResize(cols: number, rows: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  stop() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'stop' }));
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
