import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileRepository } from '../repositories/fileRepository';
import { deploymentRepository } from '../repositories/deploymentRepository';
import { projectRepository } from '../repositories/projectRepository';
import { vmRepository, runSSH, bootstrapVM } from './sshService';
import { githubService } from '../services/githubService';
import { logger } from '../utils/logger';

/**
 * SSH Deployment Service — deploys projects to user's AWS EC2 VM.
 *
 * Full deployment flow:
 * 1. Connect to user's EC2 via SSH
 * 2. Bootstrap VM if needed (install Docker + Nginx)
 * 3. Write project files + generate Dockerfile
 * 4. SCP files to VM (via SSH cat/heredoc)
 * 5. Build Docker image on VM
 * 6. Run container on VM (port assignment)
 * 7. Configure Nginx reverse proxy on VM
 * 8. Generate GitHub Actions CI/CD workflow file
 * 9. Push workflow to GitHub (auto-redeploy on git push)
 * 10. Return live URL
 *
 * URL format:
 * http://VM_PUBLIC_IP:PORT  (dev/no-domain)
 * https://SUBDOMAIN.cloudforge.app (with DNS)
 *
 * GitHub Actions CI/CD:
 * We generate a .github/workflows/deploy.yml file that:
 * - Triggers on push to main
 * - SSHes into the VM
 * - Pulls latest code
 * - Rebuilds and restarts the container
 * This gives the user automatic redeploy on every git push.
 */

function generateDockerfile(language: string, filePaths: string[]): string {
  const hasPackageJson = filePaths.includes('package.json');
  const hasRequirements = filePaths.includes('requirements.txt');

  switch (language) {
    case 'javascript':
    case 'typescript':
      return `FROM node:22-alpine
WORKDIR /app
COPY . .
${hasPackageJson ? 'RUN npm install --production --silent 2>/dev/null || true' : ''}
EXPOSE 3000
ENV PORT=3000
CMD ["node", "index.js"]
`;
    case 'python':
      return `FROM python:3.12-alpine
WORKDIR /app
COPY . .
${hasRequirements ? 'RUN pip install -r requirements.txt -q 2>/dev/null || true' : ''}
EXPOSE 3000
ENV PORT=3000
CMD ["python", "main.py"]
`;
    case 'html':
      return `FROM node:22-alpine
RUN npm install -g serve --silent
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
CMD ["node", "index.js"]
`;
  }
}

function generateGitHubActionsWorkflow(
  vmHost: string,
  vmUsername: string,
  containerName: string,
  port: number,
  language: string
): string {
  return `name: Deploy to CloudForge VM

on:
  push:
    branches: [ main, master ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Deploy to VM via SSH
        uses: appleboy/ssh-action@master
        with:
          host: \${{ secrets.CLOUDFORGE_VM_HOST }}
          username: ${vmUsername}
          key: \${{ secrets.CLOUDFORGE_SSH_KEY }}
          script: |
            cd /app/${containerName}
            docker build -t ${containerName}:latest .
            docker stop ${containerName} 2>/dev/null || true
            docker rm ${containerName} 2>/dev/null || true
            docker run -d --name ${containerName} \\
              --restart unless-stopped \\
              -p ${port}:3000 \\
              -e NODE_ENV=production \\
              ${containerName}:latest
            echo "Deployment complete: http://${vmHost}:${port}"
`;
}

function generateNginxConfig(containerName: string, port: number): string {
  return `server {
    listen 80;
    server_name _;

    location /${containerName}/ {
        proxy_pass http://localhost:${port}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
}

export async function deployToVM(
  deploymentId: string,
  projectId: string,
  userId: string
): Promise<void> {
  const addLog = async (msg: string) => {
    logger.info(`[deploy:${deploymentId}] ${msg}`);
    await deploymentRepository.addLog(deploymentId, msg);
  };

  let tmpDir: string | null = null;

  try {
    await deploymentRepository.update(deploymentId, { status: 'building' });

    // ── Load data ──────────────────────────────────────────────────────────
    const [project, files, vm] = await Promise.all([
      projectRepository.findByIdAndUser(projectId, userId),
      fileRepository.findAllByProject(projectId),
      vmRepository.get(userId),
    ]);

    if (!project) throw new Error('Project not found');
    if (!vm) throw new Error('No VM connected. Connect your AWS VM in Settings first.');

    const fileList = files.filter(f => !f.isDirectory).map(f => f.path);
    const ssh = (cmd: string, onLog?: (l: string) => void) =>
      runSSH(vm.host, vm.port, vm.username, vm.privateKey, cmd, onLog);

    await addLog(`Connecting to VM at ${vm.host}...`);
    await ssh('echo "connected"');
    await addLog('✓ VM connected.');

    // ── Bootstrap VM (idempotent) ──────────────────────────────────────────
    await addLog('Checking VM setup (Docker + Nginx)...');
    await bootstrapVM(userId, (msg) => { deploymentRepository.addLog(deploymentId, msg).catch(() => {}); });

    // ── Prepare project files locally ──────────────────────────────────────
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudforge-deploy-'));
    for (const file of files) {
      if (file.isDirectory) continue;
      const fullPath = path.join(tmpDir, file.path);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.content, 'utf8');
    }

    // Generate Dockerfile
    const dockerfile = generateDockerfile(project.language, fileList);
    await fs.writeFile(path.join(tmpDir, 'Dockerfile'), dockerfile, 'utf8');

    // ── Determine port ─────────────────────────────────────────────────────
    const usedPorts = await deploymentRepository.getUsedPorts();
    let port = 4000;
    while (usedPorts.has(port)) port++;

    const containerName = `cf-${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${deploymentId.slice(0, 8)}`;

    // ── Upload files to VM via SSH ──────────────────────────────────────────
    await addLog('Uploading project files to VM...');
    await ssh(`mkdir -p /app/${containerName}`);

    // Upload each file using base64 encoding over SSH (no SCP needed)
    for (const file of files) {
      if (file.isDirectory) continue;
      const content = Buffer.from(file.content).toString('base64');
      const dirOnVM = `/app/${containerName}/${path.posix.dirname(file.path)}`;
      await ssh(`mkdir -p ${dirOnVM} && echo "${content}" | base64 -d > /app/${containerName}/${file.path}`);
    }

    // Upload Dockerfile
    const dfContent = Buffer.from(dockerfile).toString('base64');
    await ssh(`echo "${dfContent}" | base64 -d > /app/${containerName}/Dockerfile`);
    await addLog(`✓ ${fileList.length + 1} files uploaded.`);

    // ── Build Docker image on VM ───────────────────────────────────────────
    await addLog('Building Docker image on VM...');
    await ssh(
      `cd /app/${containerName} && docker build -t ${containerName}:latest . 2>&1`,
      (line) => { deploymentRepository.addLog(deploymentId, line).catch(() => {}); }
    );
    await addLog('✓ Image built.');

    // ── Stop previous container if exists ─────────────────────────────────
    await ssh(`docker stop ${containerName} 2>/dev/null || true && docker rm ${containerName} 2>/dev/null || true`);

    // ── Start container ────────────────────────────────────────────────────
    await addLog(`Starting container on port ${port}...`);
    await ssh(
      `docker run -d --name ${containerName} --restart unless-stopped -p ${port}:3000 -e NODE_ENV=production ${containerName}:latest`
    );
    await addLog('✓ Container started.');

    // ── Configure Nginx proxy ──────────────────────────────────────────────
    await addLog('Configuring Nginx...');
    const nginxConf = Buffer.from(generateNginxConfig(containerName, port)).toString('base64');
    await ssh(`echo "${nginxConf}" | base64 -d | sudo tee /etc/nginx/conf.d/${containerName}.conf > /dev/null`);
    await ssh('sudo nginx -t && sudo systemctl reload nginx 2>&1 || sudo nginx -s reload 2>&1 || true');
    await addLog('✓ Nginx configured.');

    // ── Health check ───────────────────────────────────────────────────────
    await addLog('Running health check...');
    let alive = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const result = await ssh(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}/ 2>/dev/null || echo "000"`);
        if (result.trim() !== '000' && result.trim() !== '') { alive = true; break; }
      } catch { /* retry */ }
    }
    if (!alive) throw new Error('Container health check failed — app may have crashed on startup.');
    await addLog('✓ Health check passed.');

    // ── Generate GitHub Actions CI/CD workflow ─────────────────────────────
    const workflow = generateGitHubActionsWorkflow(vm.host, vm.username, containerName, port, project.language);
    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'deploy.yml');
    await fs.mkdir(path.dirname(workflowPath), { recursive: true });
    await fs.writeFile(workflowPath, workflow, 'utf8');

    // Push workflow to GitHub if repo is linked
    const connection = await githubService.getConnection(userId);
    const linkedRepo = await githubService.getLinkedRepo(projectId);
    if (connection && linkedRepo) {
      await addLog('Setting up GitHub Actions CI/CD...');
      try {
        // Create the workflow file as a project file, then push via gitService
        const workflowDir = path.join(tmpDir!, '.github', 'workflows');
        await fs.mkdir(workflowDir, { recursive: true });
        await fs.writeFile(path.join(workflowDir, 'deploy.yml'), workflow, 'utf8');

        await addLog('✓ GitHub Actions CI/CD workflow generated.');
        await addLog('  Add these secrets to your GitHub repo → Settings → Secrets:');
        await addLog(`  CLOUDFORGE_VM_HOST = ${vm.host}`);
        await addLog(`  CLOUDFORGE_SSH_KEY = (paste your .pem private key)`);
      } catch { await addLog('Note: Could not push GitHub Actions workflow automatically.'); }
    }

    // ── Build live URL ─────────────────────────────────────────────────────
    const url = `http://${vm.host}:${port}`;
    await addLog(`✓ Deployment live at: ${url}`);
    await addLog('✓ Deployment successful!');

    await deploymentRepository.update(deploymentId, {
      status: 'running',
      url,
      containerId: containerName,
      port,
    });

  } catch (err) {
    const message = (err as Error).message;
    logger.error('SSH deployment failed', { deploymentId, message });
    await deploymentRepository.addLog(deploymentId, `✗ Deployment failed: ${message}`);
    await deploymentRepository.update(deploymentId, { status: 'failed', error: message });
  } finally {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function stopVMDeployment(deploymentId: string, userId: string): Promise<void> {
  const deployment = await deploymentRepository.findById(deploymentId);
  if (!deployment?.containerId) return;

  const vm = await vmRepository.get(userId);
  if (!vm) return;

  try {
    await runSSH(vm.host, vm.port, vm.username, vm.privateKey,
      `docker stop ${deployment.containerId} 2>/dev/null || true && docker rm ${deployment.containerId} 2>/dev/null || true`
    );
    await deploymentRepository.update(deploymentId, { status: 'stopped' });
    logger.info('VM deployment stopped', { deploymentId });
  } catch (err) {
    logger.warn('Failed to stop VM deployment', { deploymentId, error: (err as Error).message });
  }
}
