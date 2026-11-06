import Dockerode from 'dockerode';
import { PassThrough, Writable } from 'stream';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

/**
 * Shell service — runs a persistent interactive shell inside Docker.
 *
 * Unlike executeInDocker (which runs a single command and exits),
 * this starts /bin/sh and keeps it alive so the user can type any
 * command: ls, npm install, git status, python main.py, etc.
 *
 * Key differences from the run executor:
 * - No timeout (shells are long-lived)
 * - Network enabled (npm install, pip install need internet)
 * - Writable filesystem (package installs need to write to node_modules)
 * - Files mounted read-write so changes persist during the session
 * - Starts /bin/sh not a language-specific command
 *
 * Security:
 * - Memory and CPU limits still apply
 * - Container is still isolated from the host
 * - Container is destroyed when the WebSocket closes
 * - Each user gets their own container (no sharing)
 *
 * Image selection:
 * We pick the image based on project language so the right runtime
 * is available in the shell (node, python, etc.)
 */

const MEMORY_LIMIT_BYTES = 256 * 1024 * 1024; // 256MB — more than run, for installs

const docker = new Dockerode();

// Map project language to Docker image for the shell
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
    const fullPath = path.join(tmpDir, file.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    if (!file.isDirectory) {
      await fs.writeFile(fullPath, file.content, 'utf8');
    }
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

  // Start the shell asynchronously
  (async () => {
    try {
      tmpDir = await writeFilesToTemp(files);

      container = await docker.createContainer({
        Image: image,
        // /bin/sh -i = interactive shell; Alpine uses ash which is sh-compatible
        Cmd: ['/bin/sh'],
        WorkingDir: '/app',
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Env: [
          'TERM=xterm-256color',
          // Raw ANSI escapes — works in ash, bash, sh
          'PS1=\x1b[1;32mcloudforge\x1b[0m:\x1b[1;34m\\w\x1b[0m$ ',
        ],
        HostConfig: {
          // Read-write mount — npm install etc. need to write files
          Binds: [`${tmpDir}:/app`],
          Memory: MEMORY_LIMIT_BYTES,
          MemorySwap: MEMORY_LIMIT_BYTES,
          CpuPeriod: 100000,
          CpuQuota: 50000,
          // Network enabled for package managers
          NetworkMode: 'bridge',
          SecurityOpt: ['no-new-privileges'],
          AutoRemove: false,
        },
      });

      const attachStream = await container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
        hijack: true,
      });

      stdinStream = attachStream as unknown as Writable;

      // Flush buffered keystrokes that arrived before attach
      for (const buffered of stdinBuffer) {
        stdinStream.write(buffered);
      }
      stdinBuffer.length = 0;

      const outputStream = new PassThrough();
      outputStream.on('data', (chunk: Buffer) => {
        onOutput(chunk.toString('utf8'));
      });
      (attachStream as unknown as NodeJS.ReadableStream).pipe(outputStream);

      await container.start();
      logger.info('Shell container started', { image, tmpDir });

      const { StatusCode: exitCode } = await container.wait();
      logger.info('Shell container exited', { exitCode });
      onExit();

    } catch (err) {
      logger.error('Shell container error', { message: (err as Error).message });
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
