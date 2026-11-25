import Dockerode from 'dockerode';
import { PassThrough, Writable } from 'stream';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

const MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;

const WINDOWS_PIPES = [
  '//./pipe/dockerDesktopLinuxEngine',
  '//./pipe/docker_engine',
  '//./pipe/dockerBackend',
];

function createDockerClient(): Dockerode {
  if (process.platform !== 'win32') return new Dockerode();
  return new Dockerode({ socketPath: WINDOWS_PIPES[0] });
}

let docker = createDockerClient();
let dockerConnected = false;

async function ensureDockerConnected(): Promise<void> {
  if (dockerConnected) return;
  if (process.platform !== 'win32') {
    await docker.ping();
    dockerConnected = true;
    return;
  }
  for (const socketPath of WINDOWS_PIPES) {
    try {
      const client = new Dockerode({ socketPath });
      await client.ping();
      docker = client;
      dockerConnected = true;
      return;
    } catch { /* try next */ }
  }
  throw new Error('Docker daemon not reachable. Is Docker Desktop running?');
}

// Use alpine — small, fast, reliable stream handling
// git is installed via apk inside the shell on first connect (~2s)
const SHELL_IMAGES: Record<string, string> = {
  javascript: 'node:22-alpine',
  typescript: 'node:22-alpine',
  python: 'python:3.12-alpine',
  html: 'node:22-alpine',
};

export interface ShellHandles {
  writeStdin: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => Promise<void>;
}

async function writeFilesToTemp(
  files: Array<{ path: string; content: string; isDirectory: boolean }>
): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudforge-shell-'));
  for (const file of files) {
    if (file.isDirectory) continue;
    const fullPath = path.join(tmpDir, file.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content, 'utf8');
  }
  return tmpDir;
}

export function startShell(
  files: Array<{ path: string; content: string; isDirectory: boolean }>,
  language: string,
  onOutput: (data: string) => void,
  onExit: () => void
): ShellHandles {
  const image = SHELL_IMAGES[language] ?? 'node:22-alpine';

  const stdinBuffer: string[] = [];
  let stdinStream: Writable | null = null;
  let container: Dockerode.Container | null = null;
  let tmpDir: string | null = null;

  const handles: ShellHandles = {
    writeStdin(data: string) {
      if (stdinStream) {
        stdinStream.write(data);
      } else {
        stdinBuffer.push(data);
      }
    },
    resize(cols: number, rows: number) {
      container?.resize({ w: cols, h: rows }).catch(() => {});
    },
    async kill() {
      try { await container?.kill(); } catch { /* already stopped */ }
    },
  };

  (async () => {
    try {
      await ensureDockerConnected();
      tmpDir = await writeFilesToTemp(files);

      container = await docker.createContainer({
        Image: image,
        // Install git+curl via apk, show progress, then start the shell
        Cmd: ['/bin/sh', '-c', 'apk add --no-cache git curl 2>&1 && exec /bin/sh'],
        WorkingDir: '/app',
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Env: [
          'TERM=xterm-256color',
          'PS1=%F{green}cloudforge%f:%F{blue}%~%f$ ',
        ],
        HostConfig: {
          Binds: [`${tmpDir}:/app`],  // writable so npm install can create node_modules
          Memory: MEMORY_LIMIT_BYTES,
          MemorySwap: MEMORY_LIMIT_BYTES,
          CpuPeriod: 100000,
          CpuQuota: 50000,
          NetworkMode: 'bridge',
          SecurityOpt: ['no-new-privileges'],
          AutoRemove: false,
        },
      });

      // ── Attach BEFORE start — required for Tty:true containers ──────────
      // The attach call opens the stream. start() then begins execution.
      // Reversed order causes the JSON options leak we saw previously.
      const attachStream = await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
        hijack: true,
      });

      // With Tty:true the stream is a raw duplex (not multiplexed)
      stdinStream = attachStream as unknown as Writable;

      // Flush any keystrokes that arrived before attach was ready
      for (const buffered of stdinBuffer) {
        stdinStream.write(buffered);
      }
      stdinBuffer.length = 0;

      // Pipe output to xterm
      const output = new PassThrough();
      output.on('data', (chunk: Buffer) => onOutput(chunk.toString('utf8')));
      (attachStream as unknown as NodeJS.ReadableStream).pipe(output);

      // Start the container after attaching
      await container.start();
      logger.info('Shell container started', { image });

      const { StatusCode: exitCode } = await container.wait();
      logger.info('Shell container exited', { exitCode });
      onExit();

    } catch (err) {
      logger.error('Shell error', { message: (err as Error).message });
      onOutput(`\r\n\x1b[31m[CloudForge] Shell error: ${(err as Error).message}\x1b[0m\r\n`);
      onExit();
    } finally {
      stdinStream = null;
      if (container) {
        try { await container.remove({ force: true }); } catch { /* ignore */ }
      }
      if (tmpDir) {
        try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
  })();

  return handles;
}
