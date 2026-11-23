import axios from 'axios';
import { config } from '../config/env';
import { query, queryOne } from '../db/query';
import { logger } from '../utils/logger';

/**
 * GitHub OAuth service.
 *
 * OAuth flow:
 * 1. Frontend sends user to GET /api/github/connect
 * 2. Backend redirects to GitHub with client_id + scope
 * 3. User approves on GitHub
 * 4. GitHub redirects to /api/github/callback?code=xxx
 * 5. Backend exchanges code for access_token (server-side, never browser)
 * 6. Backend fetches user profile, stores token in DB
 * 7. Backend redirects frontend back to the IDE
 *
 * Why server-side OAuth?
 * The access_token grants full GitHub access. If it were handled
 * client-side (implicit flow), it would be visible in the browser
 * history and localStorage. Server-side authorization code flow
 * keeps the token entirely on the backend.
 *
 * Scope: repo — allows creating repos and pushing code.
 */

export interface GitHubUser {
  id: string;
  login: string;
  avatarUrl: string | null;
  accessToken: string;
}

export const githubService = {
  /**
   * Step 1 — Build the GitHub authorization URL.
   * The state param prevents CSRF — we encode the userId so we know
   * whose account to link when the callback arrives.
   */
  getAuthorizationUrl(userId: string): string {
    const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString('base64url');
    const params = new URLSearchParams({
      client_id: config.githubClientId,
      redirect_uri: config.githubCallbackUrl,
      scope: 'repo user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  },

  /**
   * Step 2 — Exchange code for access token.
   */
  async exchangeCode(code: string): Promise<string> {
    const res = await axios.post<{ access_token?: string; error?: string }>(
      'https://github.com/login/oauth/access_token',
      {
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code,
        redirect_uri: config.githubCallbackUrl,
      },
      { headers: { Accept: 'application/json' } }
    );

    if (res.data.error || !res.data.access_token) {
      throw new Error(`GitHub OAuth error: ${res.data.error ?? 'no token returned'}`);
    }

    return res.data.access_token;
  },

  /**
   * Step 3 — Fetch the GitHub user profile.
   */
  async getGitHubUser(accessToken: string): Promise<{ id: string; login: string; avatarUrl: string }> {
    const res = await axios.get<{ id: number; login: string; avatar_url: string }>(
      'https://api.github.com/user',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return {
      id: String(res.data.id),
      login: res.data.login,
      avatarUrl: res.data.avatar_url,
    };
  },

  /**
   * Save or update the GitHub connection for a user.
   */
  async saveConnection(userId: string, accessToken: string, githubId: string, githubLogin: string, avatarUrl: string): Promise<void> {
    await query(
      `INSERT INTO github_connections (user_id, github_id, github_login, access_token, avatar_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         github_id    = EXCLUDED.github_id,
         github_login = EXCLUDED.github_login,
         access_token = EXCLUDED.access_token,
         avatar_url   = EXCLUDED.avatar_url,
         updated_at   = NOW()`,
      [userId, githubId, githubLogin, accessToken, avatarUrl]
    );
    logger.info('GitHub connection saved', { userId, githubLogin });
  },

  async getConnection(userId: string): Promise<GitHubUser | null> {
    const row = await queryOne<{
      github_id: string; github_login: string; access_token: string; avatar_url: string | null;
    }>(
      'SELECT github_id, github_login, access_token, avatar_url FROM github_connections WHERE user_id = $1',
      [userId]
    );
    if (!row) return null;
    return {
      id: row.github_id,
      login: row.github_login,
      accessToken: row.access_token,
      avatarUrl: row.avatar_url,
    };
  },

  async disconnect(userId: string): Promise<void> {
    await query('DELETE FROM github_connections WHERE user_id = $1', [userId]);
  },

  /**
   * Create a new GitHub repository for the user.
   */
  async createRepo(accessToken: string, name: string, description: string, isPrivate: boolean): Promise<{ fullName: string; cloneUrl: string; defaultBranch: string }> {
    const res = await axios.post<{
      full_name: string; clone_url: string; default_branch: string;
    }>(
      'https://api.github.com/user/repos',
      { name, description, private: isPrivate, auto_init: false },
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' } }
    );
    return {
      fullName: res.data.full_name,
      cloneUrl: res.data.clone_url,
      defaultBranch: res.data.default_branch ?? 'main',
    };
  },

  /**
   * Save a project→repo link.
   */
  async linkRepo(projectId: string, githubRepo: string, defaultBranch: string): Promise<void> {
    await query(
      `INSERT INTO git_repositories (project_id, github_repo, default_branch)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id) DO UPDATE SET
         github_repo    = EXCLUDED.github_repo,
         default_branch = EXCLUDED.default_branch,
         updated_at     = NOW()`,
      [projectId, githubRepo, defaultBranch]
    );
  },

  async getLinkedRepo(projectId: string): Promise<{ githubRepo: string; defaultBranch: string } | null> {
    const row = await queryOne<{ github_repo: string; default_branch: string }>(
      'SELECT github_repo, default_branch FROM git_repositories WHERE project_id = $1',
      [projectId]
    );
    if (!row) return null;
    return { githubRepo: row.github_repo, defaultBranch: row.default_branch };
  },
};
