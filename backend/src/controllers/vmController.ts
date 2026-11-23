import type { Request, Response, NextFunction } from 'express';
import { vmRepository, testVMConnection } from '../deployment/sshService';
import { deploymentRepository } from '../repositories/deploymentRepository';
import { deployToVM, stopVMDeployment } from '../deployment/sshDeployService';
import { projectService } from '../services/projectService';
import { ApiError } from '../utils/ApiError';

export const vmController = {
  /**
   * POST /api/vm/connect
   * Save and test SSH connection to user's AWS VM.
   * Body: { host, port, username, privateKey }
   */
  async connect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { host, port = 22, username = 'ubuntu', privateKey } = req.body as {
        host?: string; port?: number; username?: string; privateKey?: string;
      };
      if (!host || !privateKey) throw ApiError.badRequest('host and privateKey are required');

      await vmRepository.save({ userId: req.user!.id, host, port, username, privateKey });

      // Test connection asynchronously — don't block the response
      testVMConnection(req.user!.id).catch(() => {});

      res.json({ success: true, data: { message: 'VM connection saved. Testing connection...' } });
    } catch (err) { next(err); }
  },

  /**
   * GET /api/vm/status
   * Returns VM connection status (no private key in response).
   */
  async status(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vm = await vmRepository.getPublic(req.user!.id);
      res.json({ success: true, data: { vm } });
    } catch (err) { next(err); }
  },

  /**
   * POST /api/vm/test
   * Re-test the SSH connection.
   */
  async test(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await testVMConnection(req.user!.id);
      const vm = await vmRepository.getPublic(req.user!.id);
      res.json({ success: true, data: { connected: ok, vm } });
    } catch (err) { next(err); }
  },

  /**
   * DELETE /api/vm/disconnect
   */
  async disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await vmRepository.delete(req.user!.id);
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  /**
   * POST /api/projects/:id/deploy
   * Triggers a deployment to the user's VM.
   */
  async deploy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;

      await projectService.getProject(projectId, userId);

      // Verify VM is connected
      const vm = await vmRepository.getPublic(userId);
      if (!vm) throw ApiError.badRequest('Connect your AWS VM first in Settings → VM Connection.');
      if (vm.status === 'failed') throw ApiError.badRequest('VM connection failed. Check your SSH key and VM status.');

      const version = await deploymentRepository.getNextVersion(projectId);
      const deployment = await deploymentRepository.create({ projectId, userId, version });

      // Deploy asynchronously
      deployToVM(deployment.id, projectId, userId).catch(() => {});

      res.status(202).json({ success: true, data: { deployment } });
    } catch (err) { next(err); }
  },

  /**
   * POST /api/deployments/:deploymentId/stop
   */
  async stopDeploy(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deployment = await deploymentRepository.findById(req.params.deploymentId as string);
      if (!deployment || deployment.userId !== req.user!.id) throw ApiError.notFound('Deployment not found');
      await stopVMDeployment(deployment.id, req.user!.id);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
};
