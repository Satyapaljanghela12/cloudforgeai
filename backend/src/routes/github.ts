import { Router } from 'express';
import { githubController } from '../controllers/githubController';
import { authenticate } from '../middleware/authenticate';

/**
 * GitHub OAuth routes — /api/github/*
 *
 * GET  /api/github/connect         → redirect to GitHub (requires auth)
 * GET  /api/github/callback        → GitHub calls this after approval
 * GET  /api/github/status          → check if user has connected GitHub
 * DELETE /api/github/disconnect    → remove GitHub connection
 *
 * Per-project Git routes — mounted at /api/projects/:id/github
 * POST /api/projects/:id/github/push    → commit + push to GitHub
 * GET  /api/projects/:id/github/status  → git status
 * GET  /api/projects/:id/github/log     → commit history
 */
const router = Router();

// OAuth flow — callback doesn't require auth cookie (GitHub calls it)
router.get('/connect', authenticate, githubController.connect);
router.get('/callback', githubController.callback);
router.get('/status', authenticate, githubController.status);
router.delete('/disconnect', authenticate, githubController.disconnect);

export default router;

// Per-project routes — separate export, merged params from parent router
export const projectGithubRouter = Router({ mergeParams: true });
projectGithubRouter.use(authenticate);
projectGithubRouter.post('/push', githubController.push);
projectGithubRouter.get('/status', githubController.gitStatus);
projectGithubRouter.get('/log', githubController.gitLog);
