import api from './api';

export type DeploymentStatus = 'pending' | 'building' | 'running' | 'failed' | 'stopped';

export interface Deployment {
  id: string;
  projectId: string;
  version: number;
  status: DeploymentStatus;
  url: string | null;
  port: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentLog {
  message: string;
  createdAt: string;
}

export const deploymentService = {
  async deploy(projectId: string): Promise<Deployment> {
    const res = await api.post<{ success: boolean; data: { deployment: Deployment } }>(
      `/projects/${projectId}/deploy`, {}
    );
    return res.data.data.deployment;
  },

  async list(projectId: string): Promise<Deployment[]> {
    const res = await api.get<{ success: boolean; data: { deployments: Deployment[] } }>(
      `/projects/${projectId}/deployments`
    );
    return res.data.data.deployments;
  },

  async get(deploymentId: string): Promise<Deployment> {
    const res = await api.get<{ success: boolean; data: { deployment: Deployment } }>(
      `/deployments/${deploymentId}`
    );
    return res.data.data.deployment;
  },

  async getLogs(deploymentId: string): Promise<{ logs: DeploymentLog[]; status: DeploymentStatus; url: string | null }> {
    const res = await api.get<{ success: boolean; data: { logs: DeploymentLog[]; status: DeploymentStatus; url: string | null } }>(
      `/deployments/${deploymentId}/logs`
    );
    return res.data.data;
  },

  async stop(deploymentId: string): Promise<void> {
    await api.post(`/deployments/${deploymentId}/stop`, {});
  },

  /**
   * Stream deployment logs via SSE while building.
   * Calls onLog for each log line, calls onDone when complete.
   */
  streamLogs(
    deploymentId: string,
    onLog: (message: string) => void,
    onDone: (status: DeploymentStatus, url: string | null) => void
  ): () => void {
    const es = new EventSource(`/api/deployments/${deploymentId}/logs`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          message?: string;
          done?: boolean;
          status?: DeploymentStatus;
          url?: string | null;
        };
        if (data.message) onLog(data.message);
        if (data.done) {
          onDone(data.status ?? 'failed', data.url ?? null);
          es.close();
        }
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      onDone('failed', null);
      es.close();
    };

    return () => es.close();
  },
};
