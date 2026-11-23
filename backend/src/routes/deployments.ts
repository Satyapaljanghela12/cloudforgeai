import { Router } from 'express';
import { deploymentController } from '../controllers/deploymentController';
import { authenticate } from '../middleware/authenticate';

// Per-project routes — /api/projects/:id/deployments
export const projectDeploymentRouter = Router({ mergeParams: true });
projectDeploymentRouter.use(authenticate);
projectDeploymentRouter.post('/', deploymentController.deploy);
projectDeploymentRouter.get('/', deploymentController.list);

// Per-deployment routes — /api/deployments/:deploymentId
const deploymentRouter = Router();
deploymentRouter.use(authenticate);
deploymentRouter.get('/:deploymentId', deploymentController.get);
deploymentRouter.get('/:deploymentId/logs', deploymentController.getLogs);
deploymentRouter.post('/:deploymentId/stop', deploymentController.stop);

export default deploymentRouter;
