import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface Props {
  onReady: (api: TerminalApi) => void;
  /** Called with every keystroke/paste from xterm.js → forward to container stdin */
  onData?: (data: string) => void;
  /** Called when the terminal dimensions change after a resize */
  onResize?: (cols: number, rows: number) => void;
}

export interface TerminalApi {
  write: (data: string) => void;
  writeln: (data: string) => void;
  clear: () => void;
  focus: () => void;
  /** Returns current { cols, rows } — used to size the PTY on run */
  getDimensions: () => { cols: number; rows: number };
}

/**
 * Terminal component — interactive xterm.js terminal.
 *
 * Phase 5 additions over Phase 4:
 *
 * 1. onData prop — xterm.js fires onData for every keystroke, paste,
 *    and control character (^C = \x03, ^D = \x04). We forward these
 *    raw bytes to the WebSocket → container stdin. This is exactly how
 *    SSH clients work: the terminal emulator captures input and sends
 *    it over the transport unchanged.
 *
 * 2. onResize prop — when the terminal container changes size, FitAddon
 *    recalculates cols/rows and we notify both xterm and the container
 *    PTY. Without this, programs that query terminal size (Python REPL,
 *    any ncurses app) get stale dimensions.
 *
 * 3. getDimensions() — the parent calls this before sending 'run' so
 *    the initial PTY size matches the actual rendered terminal.
 *
 * 4. Persistent mount — Terminal stays mounted (hidden via CSS) when
 *    terminalVisible is false. If we unmounted it, xterm would be
 *    destroyed and all history lost. The parent controls visibility
 *    by toggling a CSS class, not conditional rendering.
 *
 * Why imperative API instead of React state?
 * xterm.js manages its own canvas-based rendering. Feeding output
 * through React state would cause thousands of re-renders per second
 * during heavy output. The ref-based API bypasses React entirely for
 * the hot path (write calls) while keeping React in control of mounting.
 */
export default function Terminal({ onReady, onData, onResize }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  // Keep latest callbacks in refs so xterm listeners don't capture stale closures
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  // onReady should only fire once — store it in a ref and never re-run initTerminal
  const onReadyRef = useRef(onReady);

  useEffect(() => { onDataRef.current = onData; }, [onData]);
  useEffect(() => { onResizeRef.current = onResize; }, [onResize]);
  // intentionally NOT updating onReadyRef after mount — onReady fires once only

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initTerminal = useCallback(() => {
    if (!containerRef.current || termRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#0a0a0f',
        foreground: '#e5e7eb',
        cursor: '#818cf8',
        selectionBackground: '#3730a3',
        black: '#1f2937',
        brightBlack: '#374151',
        red: '#f87171',
        brightRed: '#fca5a5',
        green: '#4ade80',
        brightGreen: '#86efac',
        yellow: '#facc15',
        brightYellow: '#fde047',
        blue: '#60a5fa',
        brightBlue: '#93c5fd',
        magenta: '#c084fc',
        brightMagenta: '#d8b4fe',
        cyan: '#22d3ee',
        brightCyan: '#67e8f9',
        white: '#e5e7eb',
        brightWhite: '#f9fafb',
      },
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      convertEol: true,
      // Allow the terminal to receive all key events including Ctrl combos
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // ── Forward stdin to container ─────────────────────────────────────────
    // onData fires for every keystroke, paste, and terminal control sequence.
    // We pass it straight to the WebSocket → container PTY.
    // The terminal does NOT echo locally — the container's PTY handles echo.
    term.onData((data) => {
      onDataRef.current?.(data);
    });

    // ── Handle resize ──────────────────────────────────────────────────────
    term.onResize(({ cols, rows }) => {
      onResizeRef.current?.(cols, rows);
    });

    // Welcome message
    term.writeln('\x1b[90m╔═══════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[90m║  CloudForge AI — Terminal         ║\x1b[0m');
    term.writeln('\x1b[90m║  Type any command to get started  ║\x1b[0m');
    term.writeln('\x1b[90m╚═══════════════════════════════════╝\x1b[0m');
    term.writeln('');

    // Expose API to parent — called exactly once on mount
    onReadyRef.current({
      write: (data) => term.write(data),
      writeln: (data) => term.writeln(data),
      clear: () => {
        term.clear();
        term.writeln('\x1b[90m CloudForge AI — Terminal\x1b[0m');
        term.writeln('');
      },
      focus: () => term.focus(),
      getDimensions: () => ({
        cols: term.cols,
        rows: term.rows,
      }),
    });
  }, []); // Empty deps — never re-runs after mount

  useEffect(() => {
    initTerminal();

    // Resize observer — refit when container dimensions change
    const observer = new ResizeObserver(() => {
      if (fitAddonRef.current && termRef.current) {
        fitAddonRef.current.fit();
        // onResize fires automatically via term.onResize above
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [initTerminal]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: '#0a0a0f' }}
    />
  );
}
