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

const EXECUTION_TIMEOUT_MS = 30_000; // 30 seconds hard kill
const MEMORY_LIMIT_BYTES = 128 * 1024 * 1024; // 128 MB

export interface ExecutionResult {
  exitCode: number;
  timedOut: boolean;
}

export interface ExecutionHandles {
  /** Write raw bytes to the container's stdin (keyboard input) */
  writeStdin: (data: string) => void;
  /** Notify the container's PTY of a terminal resize */
  resize: (cols: number, rows: number) => void;
}

const docker = new Dockerode();

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

      // ── Create container with PTY ────────────────────────────────────────
      container = await docker.createContainer({
        Image: runtime.dockerImage,
        Cmd: runtime.runCommand,
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
        HostConfig: {
          Binds: [`${tmpDir}:/app:ro`],
          Memory: MEMORY_LIMIT_BYTES,
          MemorySwap: MEMORY_LIMIT_BYTES,
          CpuPeriod: 100000,
          CpuQuota: 50000,
          NetworkMode: 'none',
          SecurityOpt: ['no-new-privileges'],
          AutoRemove: false,
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
      outputPassthrough.on('data', (chunk: Buffer) => {
        onOutput(chunk.toString('utf8'));
      });

      // The attach stream is a duplex — pipe its readable side to output
      (attachStream as unknown as NodeJS.ReadableStream).pipe(outputPassthrough);

      // ── Timeout ──────────────────────────────────────────────────────────
      const timeoutId = setTimeout(async () => {
        timedOut = true;
        onOutput('\r\n\x1b[33m[CloudForge] Execution timed out after 30 seconds\x1b[0m\r\n');
        try { await container!.kill(); } catch { /* already gone */ }
      }, EXECUTION_TIMEOUT_MS);

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
  try {
    await docker.ping();
    logger.info('Docker daemon is reachable');
    // Pre-pull shell images in the background so first shell open is fast
    void pullImagesInBackground();
    return true;
  } catch {
    logger.warn('Docker daemon is not reachable — code execution will be unavailable');
    return false;
  }
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
