import { Router } from 'express';
import { vmController } from '../controllers/vmController';
import { authenticate } from '../middleware/authenticate';
import { deploymentController } from '../controllers/deploymentController';

// VM connection management — /api/vm/*
const vmRouter = Router();
vmRouter.use(authenticate);
vmRouter.post('/connect', vmController.connect);
vmRouter.get('/status', vmController.status);
vmRouter.post('/test', vmController.test);
vmRouter.delete('/disconnect', vmController.disconnect);

export default vmRouter;

// Per-deployment actions — /api/deployments/*
export const deploymentActionsRouter = Router();
deploymentActionsRouter.use(authenticate);
deploymentActionsRouter.get('/:deploymentId', deploymentController.get);
deploymentActionsRouter.get('/:deploymentId/logs', deploymentController.getLogs);
deploymentActionsRouter.post('/:deploymentId/stop', vmController.stopDeploy);

// Per-project deploy trigger — /api/projects/:id/deploy
export const projectDeployRouter = Router({ mergeParams: true });
projectDeployRouter.use(authenticate);
projectDeployRouter.post('/', vmController.deploy);
