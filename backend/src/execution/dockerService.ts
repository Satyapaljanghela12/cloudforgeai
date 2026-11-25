import Dockerode from 'dockerode';
import { Writable, PassThrough } from 'stream';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import type { Runtime } from './runtimes';
import { logger } from '../utils/logger';

/**
 * Docker execution service — PTY-enabled interactive execution.
 *
 * Phase 4 vs Phase 5:
 * Phase 4 used Tty:false — stdout/stderr were multiplexed in Docker's
 * custom binary framing format (8-byte header per chunk). The container
 * could not receive stdin and had no concept of terminal size.
 *
 * Phase 5 upgrades to Tty:true — this allocates a pseudo-terminal (PTY)
 * inside the container. Effects:
 *
 * 1. Raw stream — with Tty:true, Docker sends raw bytes with no framing.
 *    demuxStream is NOT used. Output arrives directly.
 *
 * 2. Stdin works — we can write bytes to the container's stdin stream.
 *    Python's input(), Node's readline, any interactive program works.
 *
 * 3. Programs detect a terminal — isatty() returns true inside the
 *    container. Programs that suppress colour output when piped (ls,
 *    pytest, etc.) will now produce coloured output.
 *
 * 4. Terminal size — Docker exposes container.resize(h, w) to set the
 *    PTY dimensions. We call this when the browser terminal resizes so
 *    line wrapping stays correct.
 *
 * 5. ^C works — Ctrl+C in xterm.js sends \x03 (ETX). The PTY translates
 *    this to SIGINT delivered to the foreground process.
 *
 * Why PTY instead of exec with pipes?
 * Plain pipes (stdin/stdout/stderr) don't support terminal control
 * sequences. A PTY is a kernel-level abstraction that emulates a
 * hardware terminal — it's how every real terminal emulator works.
 *
 * Interview point: PTY allocation requires the container process to
 * be the init process (PID 1). With Tty:true + Cmd, Docker sets this
 * up automatically. With docker exec (running a command in a running
 * container), you'd use exec.start({ hijack: true, stdin: true }).
 */

const EXECUTION_TIMEOUT_MS = 30_000;
const EXECUTION_TIMEOUT_WITH_DEPS_MS = 10 * 60_000; // 10 min for npm install + dev server
const MEMORY_LIMIT_BYTES = 128 * 1024 * 1024;
const MEMORY_LIMIT_WITH_DEPS_BYTES = 512 * 1024 * 1024; // 512MB for npm install + React/Node servers

export interface ExecutionResult {
  exitCode: number;
  timedOut: boolean;
  previewPort?: number; // set if the container exposes a port
}

export interface ExecutionHandles {
  writeStdin: (data: string) => void;
  resize: (cols: number, rows: number) => void;
}

// Mutable reference — replaced by checkDocker() with the working client
let docker: Dockerode = process.platform === 'win32'
  ? new Dockerode({ socketPath: '//./pipe/dockerDesktopLinuxEngine' })
  : new Dockerode();

async function writeFilesToTemp(
  files: Array<{ path: string; content: string; isDirectory: boolean }>
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudforge-'));
  for (const file of files) {
    const fullPath = path.join(tmpDir, file.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    if (!file.isDirectory) {
      await fs.writeFile(fullPath, file.content, 'utf8');
    }
  }
  return tmpDir;
}

/**
 * Execute project files in an isolated Docker container with a PTY.
 *
 * Returns both a Promise (resolves when execution finishes) and
 * ExecutionHandles (for stdin writes and resize events).
 */
/**
 * Returns true if the project has a package.json — meaning it needs
 * npm install before it can run. React, Next.js, Express apps all need this.
 */
function hasPackageJson(files: Array<{ path: string; isDirectory: boolean }>): boolean {
  return files.some(f => !f.isDirectory && f.path === 'package.json');
}

/**
 * Build the actual run command for the container.
 * If a package.json is present, prepend `npm install` so dependencies
 * are installed before the entry command runs.
 */
function buildRunCommand(runtime: Runtime, files: Array<{ path: string; isDirectory: boolean }>): string[] {
  if (hasPackageJson(files) && runtime.language !== 'react') {
    // For plain JS/TS with package.json: install deps first, then run
    const entryCmd = runtime.runCommand.join(' ');
    return ['sh', '-c', `npm install --silent 2>&1 && ${entryCmd}`];
  }
  // React runtime already has npm install baked into its runCommand
  return runtime.runCommand;
}

export function executeInDocker(
  files: Array<{ path: string; content: string; isDirectory: boolean }>,
  runtime: Runtime,
  onOutput: (data: string) => void,
  signal: AbortSignal
): { promise: Promise<ExecutionResult>; handles: ExecutionHandles } {
  // We need to return handles synchronously (before the container exists)
  // so we buffer stdin writes until the container is ready.
  const stdinBuffer: string[] = [];
  let stdinStream: Writable | null = null;
  let container: Dockerode.Container | null = null;

  const handles: ExecutionHandles = {
    writeStdin(data: string) {
      if (stdinStream) {
        stdinStream.write(data);
      } else {
        // Buffer until the container attaches
        stdinBuffer.push(data);
      }
    },
    resize(cols: number, rows: number) {
      if (container) {
        // Fire-and-forget — resize errors are non-fatal
        container.resize({ w: cols, h: rows }).catch(() => {});
      }
    },
  };

  const promise = (async (): Promise<ExecutionResult> => {
    let tmpDir: string | null = null;
    let timedOut = false;

    try {
      tmpDir = await writeFilesToTemp(files);
      logger.info('Wrote project files', { tmpDir, fileCount: files.length });

      // ── Determine run command and network requirements ───────────────────
      const needsNetwork = hasPackageJson(files) || runtime.language === 'react';
      const runCmd = buildRunCommand(runtime, files);

      // Pick a host port in preview range (5000–5999) for server projects
      const previewPort = needsNetwork
        ? 5000 + Math.floor(Math.random() * 999)
        : null;

      // ── Create container with PTY ────────────────────────────────────────
      container = await docker.createContainer({
        Image: runtime.dockerImage,
        Cmd: runCmd,
        WorkingDir: '/app',
        // Tty: true allocates a pseudo-terminal inside the container.
        // OpenStdin: true keeps stdin open so we can write to it.
        // StdinOnce: false keeps stdin open for the life of the container.
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        ExposedPorts: needsNetwork ? { '3000/tcp': {} } : undefined,
        HostConfig: {
          // Writable mount (no :ro) so npm install can write node_modules
          Binds: [`${tmpDir}:/app`],
          Memory: needsNetwork ? MEMORY_LIMIT_WITH_DEPS_BYTES : MEMORY_LIMIT_BYTES,
          MemorySwap: needsNetwork ? MEMORY_LIMIT_WITH_DEPS_BYTES : MEMORY_LIMIT_BYTES,
          CpuPeriod: 100000,
          CpuQuota: 50000,
          // Projects with package.json need internet to download npm packages
          NetworkMode: needsNetwork ? 'bridge' : 'none',
          SecurityOpt: ['no-new-privileges'],
          AutoRemove: false,
          PortBindings: previewPort
            ? { '3000/tcp': [{ HostPort: String(previewPort) }] }
            : undefined,
        },
      });

      // ── Attach to stdin+stdout+stderr ────────────────────────────────────
      // With Tty:true, Docker gives us a single raw bidirectional stream.
      // We use hijack:true to get the raw socket-level stream.
      const attachStream = await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
        hijack: true,
      });

      // attachStream is the raw duplex stream to the container
      // Write side → container stdin
      // Read side  → container stdout+stderr (merged by PTY)
      stdinStream = attachStream as unknown as Writable;

      // Flush any buffered stdin that arrived before attach
      for (const buffered of stdinBuffer) {
        stdinStream.write(buffered);
      }
      stdinBuffer.length = 0;

      // Pipe container output to our onOutput callback
      // With Tty:true, it's a single raw stream — no demuxing needed
      const outputPassthrough = new PassThrough();
      let previewUrlShown = false;
      outputPassthrough.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        onOutput(text);
        // Show the preview URL once the dev server signals it's ready.
        // CRA prints "Local:   http://localhost:3000"
        // Vite prints "Local:   http://localhost:3000/"
        // Both print "localhost" once listening — use that as the signal.
        if (previewPort && !previewUrlShown && (
          text.includes('Local:') ||
          text.includes('localhost:3000') ||
          text.includes('ready in') ||         // Vite: "ready in 500ms"
          text.includes('Compiled successfully') // CRA success message
        )) {
          previewUrlShown = true;
          onOutput(`\r\n\x1b[36m[CloudForge] Preview: \x1b[1mhttp://localhost:${previewPort}\x1b[0m\r\n`);
        }
      });

      // The attach stream is a duplex — pipe its readable side to output
      (attachStream as unknown as NodeJS.ReadableStream).pipe(outputPassthrough);

      // ── Timeout ──────────────────────────────────────────────────────────
      const timeoutMs = needsNetwork ? EXECUTION_TIMEOUT_WITH_DEPS_MS : EXECUTION_TIMEOUT_MS;
      const timeoutId = setTimeout(async () => {
        timedOut = true;
        onOutput(`\r\n\x1b[33m[CloudForge] Execution timed out after ${timeoutMs / 1000}s\x1b[0m\r\n`);
        try { await container!.kill(); } catch { /* already gone */ }
      }, timeoutMs);

      // ── Abort (Stop button) ──────────────────────────────────────────────
      signal.addEventListener('abort', async () => {
        clearTimeout(timeoutId);
        onOutput('\r\n\x1b[33m[CloudForge] Execution stopped\x1b[0m\r\n');
        try { await container!.kill(); } catch { /* already gone */ }
      }, { once: true });

      // ── Start ────────────────────────────────────────────────────────────
      await container.start();
      logger.info('Container started', { image: runtime.dockerImage });

      // ── Wait for exit ────────────────────────────────────────────────────
      const { StatusCode: exitCode } = await container.wait();
      clearTimeout(timeoutId);

      onOutput(`\r\n\x1b[90m[CloudForge] Process exited with code ${exitCode}\x1b[0m\r\n`);
      logger.info('Container finished', { exitCode, timedOut });

      return { exitCode, timedOut };

    } finally {
      stdinStream = null;
      if (container) {
        try { await container.remove({ force: true }); }
        catch (err) { logger.warn('Failed to remove container', { error: (err as Error).message }); }
      }
      if (tmpDir) {
        try { await fs.rm(tmpDir, { recursive: true, force: true }); }
        catch (err) { logger.warn('Failed to remove temp dir', { error: (err as Error).message }); }
      }
    }
  })();

  return { promise, handles };
}

export async function checkDocker(): Promise<boolean> {
  const pipes = process.platform === 'win32'
    ? ['//./pipe/dockerDesktopLinuxEngine', '//./pipe/docker_engine', '//./pipe/dockerBackend']
    : [null]; // null = use default (Unix socket)

  for (const socketPath of pipes) {
    try {
      const client = socketPath
        ? new Dockerode({ socketPath })
        : new Dockerode();
      await client.ping();
      docker = client; // Replace with the working client
      logger.info('Docker daemon is reachable', { socketPath: socketPath ?? 'default' });
      void pullImagesInBackground();
      return true;
    } catch {
      logger.debug?.('Docker pipe failed', { socketPath });
    }
  }

  logger.warn('Docker daemon is not reachable — code execution will be unavailable');
  return false;
}

async function pullImagesInBackground(): Promise<void> {
  const images = ['node:22-alpine', 'python:3.12-alpine'];
  for (const image of images) {
    try {
      // Check if image already exists locally
      await docker.getImage(image).inspect();
      logger.info('Docker image already cached', { image });
    } catch {
      // Not cached — pull it
      logger.info('Pulling Docker image in background', { image });
      try {
        await new Promise<void>((resolve, reject) => {
          docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
            if (err) return reject(err);
            docker.modem.followProgress(stream, (err2: Error | null) => {
              if (err2) reject(err2);
              else resolve();
            });
          });
        });
        logger.info('Docker image pulled', { image });
      } catch (err) {
        logger.warn('Failed to pull Docker image', { image, error: (err as Error).message });
      }
    }
  }
}
