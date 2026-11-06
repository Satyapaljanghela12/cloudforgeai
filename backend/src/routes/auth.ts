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

// Returns the raw token so the WebSocket client can use it
// (Browser WS API can't send custom headers, so token goes in first message)
router.get('/token', authenticate, authController.getToken);

export default router;
