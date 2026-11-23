import Dockerode from 'dockerode';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileRepository } from '../repositories/fileRepository';
import { deploymentRepository } from '../repositories/deploymentRepository';
import { projectRepository } from '../repositories/projectRepository';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Deployment service — builds and runs production containers.
 *
 * How it differs from the execution service (Phase 4):
 *
 * Execution service:              Deployment service:
 * - Short-lived (30s timeout)     - Long-running (stays alive)
 * - No port binding               - Binds to host port (accessible via URL)
 * - Run button                    - Deploy button
 * - Shows output in terminal      - Streams logs to DB + UI
 * - Container killed after run    - Container stays until stopped/redeployed
 *
 * URL generation:
 * Dev:  http://localhost:PORT      (e.g. http://localhost:4001)
 * Prod: https://slug.cloudforge.app (Nginx proxies to PORT)
 *
 * Port allocation:
 * We maintain a range (4000–4999). Each deployment gets the lowest
 * available port not already used by a running container.
 *
 * Dockerfile generation:
 * We generate a Dockerfile appropriate for the project language.
 * This is simpler than requiring users to write their own Dockerfile.
 *
 * Interview point: In production you'd use a proper image registry
 * (ECR, Docker Hub) and an orchestrator (ECS, Kubernetes). For our
 * single-VM architecture, running containers directly on the host
 * is simpler and appropriate for the scale.
 */

// Use the same Docker client detection as shellService
const WINDOWS_PIPES = [
  '//./pipe/dockerDesktopLinuxEngine',
  '//./pipe/docker_engine',
];

function getDocker(): Dockerode {
  if (process.platform !== 'win32') return new Dockerode();
  return new Dockerode({ socketPath: WINDOWS_PIPES[0] });
}

let docker = getDocker();

export async function initDeploymentDocker(): Promise<void> {
  if (process.platform !== 'win32') return;
  for (const socketPath of WINDOWS_PIPES) {
    try {
      const client = new Dockerode({ socketPath });
      await client.ping();
      docker = client;
      return;
    } catch { /* try next */ }
  }
}

// Dockerfile templates per language
function generateDockerfile(language: string, files: string[]): string {
  const hasPackageJson = files.includes('package.json');
  const hasRequirements = files.includes('requirements.txt');

  switch (language) {
    case 'javascript':
    case 'typescript':
      return `FROM node:22-alpine
WORKDIR /app
COPY . .
${hasPackageJson ? 'RUN npm install --production 2>/dev/null || true' : ''}
EXPOSE 3000
ENV PORT=3000
CMD ["node", "index.js"]
`;

    case 'python':
      return `FROM python:3.12-alpine
WORKDIR /app
COPY . .
${hasRequirements ? 'RUN pip install -r requirements.txt --quiet 2>/dev/null || true' : ''}
EXPOSE 3000
ENV PORT=3000
CMD ["python", "main.py"]
`;

    case 'html':
      return `FROM node:22-alpine
RUN npm install -g serve --quiet 2>/dev/null
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["serve", "-s", ".", "-l", "3000"]
`;

    default:
      return `FROM node:22-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
ENV PORT=3000
CMD ["node", "index.js"]
`;
  }
}

/**
 * Find the next available port in the deployment range.
 */
async function allocatePort(): Promise<number> {
  const usedPorts = await deploymentRepository.getUsedPorts();
  for (let p = config.deployPortMin; p <= config.deployPortMax; p++) {
    if (!usedPorts.has(p)) return p;
  }
  throw new Error('No available deployment ports. Too many running deployments.');
}

/**
 * Build URL for a deployment.
 */
function buildDeploymentUrl(slug: string, port: number): string {
  if (config.deployHost === 'localhost') {
    return `http://localhost:${port}`;
  }
  return `https://${slug}.${config.deployHost}`;
}

/**
 * Stop and remove a running deployment container.
 */
export async function stopDeployment(deploymentId: string): Promise<void> {
  const deployment = await deploymentRepository.findById(deploymentId);
  if (!deployment?.containerId) return;

  try {
    const container = docker.getContainer(deployment.containerId);
    await container.stop({ t: 5 }).catch(() => {});
    await container.remove({ force: true }).catch(() => {});
    logger.info('Deployment container stopped', { deploymentId });
  } catch (err) {
    logger.warn('Failed to stop deployment container', { deploymentId, error: (err as Error).message });
  }

  await deploymentRepository.update(deploymentId, { status: 'stopped' });
}

/**
 * Deploy a project — the main entry point.
 * Runs asynchronously, streams logs to the database.
 */
export async function deployProject(
  deploymentId: string,
  projectId: string,
  userId: string
): Promise<void> {
  const log = async (message: string) => {
    logger.info(`[deploy:${deploymentId}] ${message}`);
    await deploymentRepository.addLog(deploymentId, message);
  };

  let tmpDir: string | null = null;

  try {
    await deploymentRepository.update(deploymentId, { status: 'building' });

    // ── Load project data ─────────────────────────────────────────────────
    const project = await projectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw new Error('Project not found');

    const files = await fileRepository.findAllByProject(projectId);
    const fileList = files.filter(f => !f.isDirectory).map(f => f.path);

    await log(`Starting deployment of "${project.name}"...`);
    await log(`Language: ${project.language}`);
    await log(`Files: ${fileList.length} file(s)`);

    // ── Stop any existing running deployment for this project ─────────────
    const existing = await deploymentRepository.findRunning(projectId);
    if (existing) {
      await log(`Stopping previous deployment v${existing.version}...`);
      await stopDeployment(existing.id);
    }

    // ── Write files to temp directory ─────────────────────────────────────
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudforge-deploy-'));

    for (const file of files) {
      if (file.isDirectory) continue;
      const fullPath = path.join(tmpDir, file.path);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.content, 'utf8');
    }

    // ── Generate Dockerfile ───────────────────────────────────────────────
    const dockerfile = generateDockerfile(project.language, fileList);
    await fs.writeFile(path.join(tmpDir, 'Dockerfile'), dockerfile, 'utf8');
    await log('Dockerfile generated.');

    // ── Build Docker image ────────────────────────────────────────────────
    const imageTag = `cloudforge-${projectId.slice(0, 8)}:${deploymentId.slice(0, 8)}`;
    await log(`Building image ${imageTag}...`);

    await new Promise<void>((resolve, reject) => {
      docker.buildImage(
        { context: tmpDir!, src: ['Dockerfile', ...fileList] },
        { t: imageTag },
        (err, stream) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error('No build stream'));

          docker.modem.followProgress(
            stream,
            (err2: Error | null, _output: unknown) => {
              if (err2) reject(err2);
              else resolve();
            },
            (event: { stream?: string; error?: string }) => {
              if (event.stream) {
                const line = event.stream.trim();
                if (line) deploymentRepository.addLog(deploymentId, line).catch(() => {});
              }
            }
          );
        }
      );
    });

    await log('Image built successfully.');

    // ── Allocate port ─────────────────────────────────────────────────────
    const port = await allocatePort();
    await log(`Allocated port ${port}.`);

    // ── Run the container ─────────────────────────────────────────────────
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const containerName = `cf-${slug}-${deploymentId.slice(0, 8)}`;

    const container = await docker.createContainer({
      Image: imageTag,
      name: containerName,
      ExposedPorts: { '3000/tcp': {} },
      Env: [`PORT=3000`, `NODE_ENV=production`],
      HostConfig: {
        PortBindings: { '3000/tcp': [{ HostPort: String(port) }] },
        Memory: 256 * 1024 * 1024,       // 256MB
        MemorySwap: 256 * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 50000,                  // 0.5 CPU
        NetworkMode: 'bridge',
        RestartPolicy: { Name: 'unless-stopped' },
        AutoRemove: false,
      },
    });

    await container.start();
    await log(`Container started (${container.id.slice(0, 12)}).`);

    // ── Health check ──────────────────────────────────────────────────────
    await log('Waiting for health check...');
    let healthy = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const info = await container.inspect();
        if (info.State.Running) { healthy = true; break; }
      } catch { break; }
    }

    if (!healthy) {
      await container.remove({ force: true });
      throw new Error('Container failed health check — it exited on startup');
    }

    // ── Build URL ─────────────────────────────────────────────────────────
    const url = buildDeploymentUrl(slug, port);
    await log(`Deployment live at: ${url}`);

    await deploymentRepository.update(deploymentId, {
      status: 'running',
      url,
      containerId: container.id,
      port,
    });

    await log('✓ Deployment successful!');

  } catch (err) {
    const message = (err as Error).message;
    logger.error('Deployment failed', { deploymentId, message });
    await deploymentRepository.addLog(deploymentId, `✗ Deployment failed: ${message}`);
    await deploymentRepository.update(deploymentId, { status: 'failed', error: message });
  } finally {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
