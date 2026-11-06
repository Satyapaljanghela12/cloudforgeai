import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getRuntime, RUNTIMES } from '../execution/runtimes';

/**
 * Execution REST routes.
 *
 * GET /api/execution/runtimes — returns available languages
 * The actual execution happens over WebSocket, not REST.
 * This endpoint lets the frontend know what languages are supported
 * before the user tries to run something.
 */
const router = Router();

router.get('/runtimes', authenticate, (_req: Request, res: Response) => {
  const runtimes = Object.values(RUNTIMES).map((r) => ({
    language: r.language,
    entryFile: r.entryFile,
  }));
  res.json({ success: true, data: { runtimes } });
});

export default router;
