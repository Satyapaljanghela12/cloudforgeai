import api from './api';

export interface GitHubStatus {
  connected: boolean;
  login: string | null;
  avatarUrl: string | null;
}

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

export interface LinkedRepo {
  githubRepo: string;
  defaultBranch: string;
}

export const githubService = {
  async getStatus(): Promise<GitHubStatus> {
    const res = await api.get<{ success: boolean; data: GitHubStatus }>('/github/status');
    return res.data.data;
  },

  async disconnect(): Promise<void> {
    await api.delete('/github/disconnect');
  },

  /** Opens GitHub OAuth in the same tab */
  startOAuth(): void {
    window.location.href = '/api/github/connect';
  },

  async getGitStatus(projectId: string): Promise<{ status: GitStatus; linkedRepo: LinkedRepo | null }> {
    const res = await api.get<{ success: boolean; data: { status: GitStatus; linkedRepo: LinkedRepo | null } }>(
      `/projects/${projectId}/github/status`
    );
    return res.data.data;
  },

  async getLog(projectId: string): Promise<GitCommit[]> {
    const res = await api.get<{ success: boolean; data: { commits: GitCommit[] } }>(
      `/projects/${projectId}/github/log`
    );
    return res.data.data.commits;
  },

  async push(projectId: string, data: {
    message: string;
    repoName?: string;
    isPrivate?: boolean;
  }): Promise<{ commitHash: string; repoUrl: string; branch: string }> {
    const res = await api.post<{ success: boolean; data: { commitHash: string; repoUrl: string; branch: string } }>(
      `/projects/${projectId}/github/push`,
      data
    );
    return res.data.data;
  },
};
