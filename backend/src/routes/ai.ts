import { Router } from 'express';
import { aiController } from '../controllers/aiController';
import { authenticate } from '../middleware/authenticate';

/**
 * AI routes — all protected by authentication.
 *
 * POST   /api/projects/:id/ai/chat    — send message, get SSE stream
 * GET    /api/projects/:id/ai/chat    — load conversation history
 * DELETE /api/projects/:id/ai/chat    — clear conversation
 */
const router = Router({ mergeParams: true });

router.use(authenticate);

router.post('/chat', aiController.chat);
router.get('/chat', aiController.getHistory);
router.delete('/chat', aiController.clearHistory);

// RAG indexing
router.post('/index', aiController.indexProject);
router.get('/index', aiController.getIndexStatus);

export default router;
