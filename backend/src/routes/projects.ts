import { Router } from 'express';
import { projectController } from '../controllers/projectController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All project routes require authentication
router.use(authenticate);

router.get('/', projectController.getProjects);
router.post('/', projectController.createProject);
router.get('/:id', projectController.getProject);
router.delete('/:id', projectController.deleteProject);

export default router;
