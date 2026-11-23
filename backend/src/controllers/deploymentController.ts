import type { Request, Response, NextFunction } from 'express';
import { deploymentRepository } from '../repositories/deploymentRepository';
import { deployProject, stopDeployment } from '../deployment/deploymentService';
import { projectService } from '../services/projectService';
import { ApiError } from '../utils/ApiError';

export const deploymentController = {

  /**
   * POST /api/projects/:id/deploy
   * Creates a deployment record and starts the async deploy process.
   * Returns immediately with the deployment ID — client polls for status.
   */
  async deploy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;

      await projectService.getProject(projectId, userId);

      const version = await deploymentRepository.getNextVersion(projectId);
      const deployment = await deploymentRepository.create({ projectId, userId, version });

      // Start deployment asynchronously — don't await
      deployProject(deployment.id, projectId, userId).catch(() => {});

      res.status(202).json({ success: true, data: { deployment } });
    } catch (err) { next(err); }
  },

  /**
   * GET /api/projects/:id/deployments
   * List all deployments for a project (newest first).
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.id as string;
      await projectService.getProject(projectId, req.user!.id);
      const deployments = await deploymentRepository.findByProject(projectId);
      res.json({ success: true, data: { deployments } });
    } catch (err) { next(err); }
  },

  /**
   * GET /api/deployments/:deploymentId
   * Get a single deployment's current status and URL.
   */
  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deployment = await deploymentRepository.findById(req.params.deploymentId as string);
      if (!deployment || deployment.userId !== req.user!.id) throw ApiError.notFound('Deployment not found');
      res.json({ success: true, data: { deployment } });
    } catch (err) { next(err); }
  },

  /**
   * GET /api/deployments/:deploymentId/logs
   * Stream deployment logs (SSE).
   */
  async getLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deployment = await deploymentRepository.findById(req.params.deploymentId as string);
      if (!deployment || deployment.userId !== req.user!.id) throw ApiError.notFound('Deployment not found');

      const logs = await deploymentRepository.getLogs(deployment.id);

      // If still building, use SSE to stream new logs as they arrive
      if (deployment.status === 'building' || deployment.status === 'pending') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        // Send existing logs first
        for (const log of logs) {
          res.write(`data: ${JSON.stringify({ message: log.message, createdAt: log.createdAt })}\n\n`);
        }

        // Poll for new logs every second
        let lastCount = logs.length;
        const interval = setInterval(async () => {
          try {
            const updated = await deploymentRepository.findById(deployment.id);
            const allLogs = await deploymentRepository.getLogs(deployment.id);

            // Send new log lines
            for (let i = lastCount; i < allLogs.length; i++) {
              res.write(`data: ${JSON.stringify({ message: allLogs[i].message, createdAt: allLogs[i].createdAt })}\n\n`);
            }
            lastCount = allLogs.length;

            // Stop streaming when deployment finishes
            if (updated && ['running', 'failed', 'stopped'].includes(updated.status)) {
              res.write(`data: ${JSON.stringify({ done: true, status: updated.status, url: updated.url })}\n\n`);
              clearInterval(interval);
              res.end();
            }
          } catch { clearInterval(interval); res.end(); }
        }, 1000);

        req.on('close', () => clearInterval(interval));
      } else {
        // Already finished — just return the logs as JSON
        res.json({ success: true, data: { logs, status: deployment.status, url: deployment.url } });
      }
    } catch (err) { next(err); }
  },

  /**
   * POST /api/deployments/:deploymentId/stop
   */
  async stop(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deployment = await deploymentRepository.findById(req.params.deploymentId as string);
      if (!deployment || deployment.userId !== req.user!.id) throw ApiError.notFound('Deployment not found');
      await stopDeployment(deployment.id);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
};
