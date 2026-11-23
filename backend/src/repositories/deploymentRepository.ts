import { query, queryOne } from '../db/query';

export type DeploymentStatus = 'pending' | 'building' | 'running' | 'failed' | 'stopped';

export interface Deployment {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  status: DeploymentStatus;
  url: string | null;
  containerId: string | null;
  port: number | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DeploymentRow {
  id: string;
  project_id: string;
  user_id: string;
  version: number;
  status: DeploymentStatus;
  url: string | null;
  container_id: string | null;
  port: number | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToDeployment(r: DeploymentRow): Deployment {
  return {
    id: r.id, projectId: r.project_id, userId: r.user_id,
    version: r.version, status: r.status, url: r.url,
    containerId: r.container_id, port: r.port, error: r.error,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export const deploymentRepository = {
  async create(data: { projectId: string; userId: string; version: number }): Promise<Deployment> {
    const row = await queryOne<DeploymentRow>(
      `INSERT INTO deployments (project_id, user_id, version)
       VALUES ($1, $2, $3) RETURNING *`,
      [data.projectId, data.userId, data.version]
    );
    if (!row) throw new Error('Failed to create deployment');
    return rowToDeployment(row);
  },

  async update(id: string, data: Partial<{
    status: DeploymentStatus; url: string; containerId: string;
    port: number; error: string;
  }>): Promise<Deployment | null> {
    const row = await queryOne<DeploymentRow>(
      `UPDATE deployments SET
         status       = COALESCE($2, status),
         url          = COALESCE($3, url),
         container_id = COALESCE($4, container_id),
         port         = COALESCE($5, port),
         error        = COALESCE($6, error),
         updated_at   = NOW()
       WHERE id = $1 RETURNING *`,
      [id, data.status ?? null, data.url ?? null, data.containerId ?? null,
       data.port ?? null, data.error ?? null]
    );
    return row ? rowToDeployment(row) : null;
  },

  async findByProject(projectId: string): Promise<Deployment[]> {
    const result = await query<DeploymentRow>(
      'SELECT * FROM deployments WHERE project_id = $1 ORDER BY version DESC',
      [projectId]
    );
    return result.rows.map(rowToDeployment);
  },

  async findById(id: string): Promise<Deployment | null> {
    const row = await queryOne<DeploymentRow>(
      'SELECT * FROM deployments WHERE id = $1', [id]
    );
    return row ? rowToDeployment(row) : null;
  },

  async findRunning(projectId: string): Promise<Deployment | null> {
    const row = await queryOne<DeploymentRow>(
      `SELECT * FROM deployments WHERE project_id = $1 AND status = 'running'
       ORDER BY version DESC LIMIT 1`,
      [projectId]
    );
    return row ? rowToDeployment(row) : null;
  },

  async getNextVersion(projectId: string): Promise<number> {
    const row = await queryOne<{ max: number | null }>(
      'SELECT MAX(version) as max FROM deployments WHERE project_id = $1', [projectId]
    );
    return (row?.max ?? 0) + 1;
  },

  async addLog(deploymentId: string, message: string): Promise<void> {
    await query(
      'INSERT INTO deployment_logs (deployment_id, message) VALUES ($1, $2)',
      [deploymentId, message]
    );
  },

  async getLogs(deploymentId: string): Promise<Array<{ message: string; createdAt: Date }>> {
    const result = await query<{ message: string; created_at: Date }>(
      'SELECT message, created_at FROM deployment_logs WHERE deployment_id = $1 ORDER BY created_at ASC',
      [deploymentId]
    );
    return result.rows.map(r => ({ message: r.message, createdAt: r.created_at }));
  },

  // Find all ports currently in use by running deployments
  async getUsedPorts(): Promise<Set<number>> {
    const result = await query<{ port: number }>(
      `SELECT port FROM deployments WHERE status = 'running' AND port IS NOT NULL`
    );
    return new Set(result.rows.map(r => r.port));
  },
};
