import type { Request, Response, NextFunction } from 'express';
import { githubService } from '../services/githubService';
import { gitService } from '../services/gitService';
import { projectService } from '../services/projectService';
import { config } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';

export const githubController = {
  /**
   * GET /api/github/connect
   * Redirects the user to GitHub's OAuth authorization page.
   */
  async connect(req: Request, res: Response): Promise<void> {
    if (!config.githubClientId) {
      res.status(503).json({ success: false, error: 'GitHub OAuth not configured. Add GITHUB_CLIENT_ID to .env' });
      return;
    }
    const url = githubService.getAuthorizationUrl(req.user!.id);
    res.redirect(url);
  },

  /**
   * GET /api/github/callback?code=xxx&state=xxx
   * GitHub redirects here after user approves.
   * Exchanges code for token, saves connection, redirects to frontend.
   */
  async callback(req: Request, res: Response): Promise<void> {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      res.redirect(`${config.frontendUrl}/dashboard?github_error=${encodeURIComponent(error)}`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${config.frontendUrl}/dashboard?github_error=invalid_callback`);
      return;
    }

    try {
      // Decode state to get userId (set during connect)
      const { userId } = JSON.parse(Buffer.from(state, 'base64url').toString());

      // Exchange code for access token
      const accessToken = await githubService.exchangeCode(code);

      // Get GitHub user profile
      const githubUser = await githubService.getGitHubUser(accessToken);

      // Save connection
      await githubService.saveConnection(userId, accessToken, githubUser.id, githubUser.login, githubUser.avatarUrl);

      logger.info('GitHub connected', { userId, login: githubUser.login });

      // Redirect to dashboard with success indicator
      res.redirect(`${config.frontendUrl}/dashboard?github_connected=1`);
    } catch (err) {
      logger.error('GitHub callback failed', { message: (err as Error).message });
      res.redirect(`${config.frontendUrl}/dashboard?github_error=callback_failed`);
    }
  },

  /**
   * GET /api/github/status
   * Returns whether the current user has connected GitHub.
   */
  async status(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const connection = await githubService.getConnection(req.user!.id);
      res.json({
        success: true,
        data: {
          connected: !!connection,
          login: connection?.login ?? null,
          avatarUrl: connection?.avatarUrl ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/github/disconnect
   */
  async disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await githubService.disconnect(req.user!.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/projects/:id/github/push
   * Publishes the project to GitHub (creates repo if needed, then pushes).
   *
   * Body: { message: string, repoName?: string, private?: boolean }
   */
  async push(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;
      const { message = 'Initial commit from CloudForge AI', repoName, isPrivate = false } = req.body as {
        message?: string; repoName?: string; isPrivate?: boolean;
      };

      // Verify project ownership
      const project = await projectService.getProject(projectId, userId);

      // Verify GitHub is connected
      const connection = await githubService.getConnection(userId);
      if (!connection) {
        throw ApiError.badRequest('Connect your GitHub account first');
      }

      // Check if repo already linked
      let linkedRepo = await githubService.getLinkedRepo(projectId);

      if (!linkedRepo) {
        // Create a new GitHub repo
        const name = repoName ?? project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const repo = await githubService.createRepo(
          connection.accessToken,
          name,
          project.description ?? `Created with CloudForge AI`,
          isPrivate
        );
        await githubService.linkRepo(projectId, repo.fullName, repo.defaultBranch);
        linkedRepo = { githubRepo: repo.fullName, defaultBranch: repo.defaultBranch };
        logger.info('Created GitHub repo', { projectId, repo: repo.fullName });
      }

      // Commit and push
      const { commitHash } = await gitService.commitAndPush(
        projectId,
        message,
        linkedRepo.githubRepo,
        connection.accessToken,
        linkedRepo.defaultBranch
      );

      res.json({
        success: true,
        data: {
          commitHash,
          repoUrl: `https://github.com/${linkedRepo.githubRepo}`,
          branch: linkedRepo.defaultBranch,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/projects/:id/github/status
   * Returns git status for the project.
   */
  async gitStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;

      await projectService.getProject(projectId, userId);

      const connection = await githubService.getConnection(userId);
      const linkedRepo = await githubService.getLinkedRepo(projectId);

      const status = await gitService.getStatus(
        projectId,
        linkedRepo?.githubRepo,
        connection?.accessToken
      );

      res.json({ success: true, data: { status, linkedRepo } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/projects/:id/github/log
   * Returns recent commits.
   */
  async gitLog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;

      await projectService.getProject(projectId, userId);

      const commits = await gitService.getLog(projectId, 20);
      res.json({ success: true, data: { commits } });
    } catch (err) {
      next(err);
    }
  },
};
