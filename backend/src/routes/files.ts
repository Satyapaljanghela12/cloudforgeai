import { Router } from 'express';
import { fileController } from '../controllers/fileController';
import { authenticate } from '../middleware/authenticate';

/**
 * File routes.
 *
 * Two route families:
 *
 * Project-scoped (create + list):
 *   GET  /api/projects/:projectId/files
 *   POST /api/projects/:projectId/files
 *
 * File-scoped (update + delete):
 *   PUT    /api/files/:fileId
 *   DELETE /api/files/:fileId
 *
 * Why split? List/create naturally belong under the project resource.
 * Update/delete operate on a specific file by its own ID — no need to
 * repeat the projectId in the URL (the service verifies ownership anyway).
 */

// Mounted at /api/projects/:projectId/files
export const projectFileRouter = Router({ mergeParams: true });
projectFileRouter.use(authenticate);
projectFileRouter.get('/', fileController.getFiles);
projectFileRouter.post('/', fileController.createFile);

// Mounted at /api/files
export const fileRouter = Router();
fileRouter.use(authenticate);
fileRouter.put('/:fileId', fileController.updateFile);
fileRouter.delete('/:fileId', fileController.deleteFile);
