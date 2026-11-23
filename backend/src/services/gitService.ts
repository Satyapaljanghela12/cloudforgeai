import { simpleGit, SimpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileRepository } from '../repositories/fileRepository';
import { logger } from '../utils/logger';

/**
 * Git service — runs git operations on project files.
 *
 * Why work directory pattern?
 * Project files are stored in PostgreSQL, not on disk. To run git commands
 * we need to materialise the files to a temp directory, perform the git
 * operation, then sync changes back to the database.
 *
 * This is the same pattern used by the Docker execution service.
 *
 * Why simple-git over child_process.exec('git ...')?
 * simple-git provides a typed, promise-based API and handles cross-platform
 * path quoting. It also avoids shell injection vulnerabilities.
 *
 * Interview point: In production, project files would live on a persistent
 * volume (not PostgreSQL) and git would operate directly on them without
 * the materialise/sync round-trip. This design keeps things simple for now.
 */

export interface GitStatus {
  branch: string;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  hasRemote: boolean;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

/**
 * Write project files to a temp directory and initialise git.
 * Returns the temp dir path and a configured SimpleGit instance.
 */
async function prepareWorkDir(
  projectId: string,
  githubRepo?: string,
  accessToken?: string
): Promise<{ workDir: string; git: SimpleGit }> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cloudforge-git-'));

  const files = await fileRepository.findAllByProject(projectId);
  for (const file of files) {
    if (file.isDirectory) continue;
    const fullPath = path.join(workDir, file.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content, 'utf8');
  }

  const git = simpleGit(workDir);

  // Check if repo already has git history
  const isRepo = await git.checkIsRepo().catch(() => false);
  if (!isRepo) {
    await git.init();
    await git.addConfig('user.email', 'cloudforge@cloudforge.ai');
    await git.addConfig('user.name', 'CloudForge AI');
  }

  // Set remote if provided
  if (githubRepo && accessToken) {
    const remoteUrl = `https://x-access-token:${accessToken}@github.com/${githubRepo}.git`;
    const remotes = await git.getRemotes();
    if (remotes.find((r: { name: string }) => r.name === 'origin')) {
      await git.remote(['set-url', 'origin', remoteUrl]);
    } else {
      await git.addRemote('origin', remoteUrl);
    }
  }

  return { workDir, git };
}

async function cleanup(workDir: string): Promise<void> {
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

export const gitService = {
  async getStatus(projectId: string, githubRepo?: string, accessToken?: string): Promise<GitStatus> {
    const { workDir, git } = await prepareWorkDir(projectId, githubRepo, accessToken);
    try {
      // Stage all to get accurate status
      await git.add('.');
      const status = await git.status();
      let branch = status.current ?? 'main';
      let ahead = status.ahead ?? 0;
      let behind = status.behind ?? 0;

      return {
        branch,
        modified: status.modified,
        added: [...status.created, ...status.staged],
        deleted: status.deleted,
        untracked: status.not_added,
        ahead,
        behind,
        hasRemote: !!githubRepo,
      };
    } finally {
      await cleanup(workDir);
    }
  },

  async getDiff(projectId: string): Promise<string> {
    const { workDir, git } = await prepareWorkDir(projectId);
    try {
      await git.add('.');
      const diff = await git.diff(['HEAD']).catch(() => git.diff());
      return diff;
    } finally {
      await cleanup(workDir);
    }
  },

  async getLog(projectId: string, limit = 20): Promise<GitCommit[]> {
    const { workDir, git } = await prepareWorkDir(projectId);
    try {
      const isRepo = await git.checkIsRepo();
      if (!isRepo) return [];

      const log = await git.log({ maxCount: limit }).catch(() => ({ all: [] }));
      return (log.all as Array<{ hash: string; message: string; author_name: string; date: string }>).map(c => ({
        hash: c.hash.slice(0, 7),
        message: c.message,
        author: c.author_name,
        date: c.date,
      }));
    } finally {
      await cleanup(workDir);
    }
  },

  /**
   * Commit all changes and push to GitHub.
   * This is the main "Publish to GitHub" operation from the IDE.
   */
  async commitAndPush(
    projectId: string,
    message: string,
    githubRepo: string,
    accessToken: string,
    branch = 'main'
  ): Promise<{ commitHash: string }> {
    const { workDir, git } = await prepareWorkDir(projectId, githubRepo, accessToken);
    try {
      await git.add('.');
      const commit = await git.commit(message);
      const commitHash = commit.commit || '';

      logger.info('Committed changes', { projectId, message, commitHash });

      // Push — force on first push since GitHub creates empty repo
      try {
        await git.push('origin', branch, { '--set-upstream': null });
      } catch {
        // Try force push (repo may be empty on GitHub)
        await git.push(['origin', branch, '--force']);
      }

      logger.info('Pushed to GitHub', { projectId, githubRepo, branch });
      return { commitHash };
    } finally {
      await cleanup(workDir);
    }
  },
};
