import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);

// Protected — requires valid JWT cookie
router.get('/me', authenticate, authController.me);

export default router;
