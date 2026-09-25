import { query, queryOne } from '../db/query';

/**
 * Project repository — all database operations for the projects table.
 *
 * Security note: Every query that reads or modifies a project includes
 * user_id in the WHERE clause. This enforces ownership at the database
 * level — even if the service layer has a bug, a user cannot accidentally
 * read or modify another user's project.
 *
 * This is defence in depth: the service layer also checks ownership,
 * but the database query is the final guard.
 */

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  language: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  language: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    language: row.language,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const projectRepository = {
  // Only return projects belonging to this user
  async findAllByUser(userId: string): Promise<Project[]> {
    const result = await query<ProjectRow>(
      `SELECT * FROM projects
       WHERE user_id = $1 AND status != 'deleted'
       ORDER BY updated_at DESC`,
      [userId]
    );
    return result.rows.map(rowToProject);
  },

  // Find by id AND user_id — prevents cross-user access
  async findByIdAndUser(id: string, userId: string): Promise<Project | null> {
    const row = await queryOne<ProjectRow>(
      `SELECT * FROM projects
       WHERE id = $1 AND user_id = $2 AND status != 'deleted'`,
      [id, userId]
    );
    return row ? rowToProject(row) : null;
  },

  async create(data: {
    userId: string;
    name: string;
    description?: string;
    language: string;
  }): Promise<Project> {
    const row = await queryOne<ProjectRow>(
      `INSERT INTO projects (user_id, name, description, language)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.userId, data.name, data.description ?? null, data.language]
    );
    if (!row) throw new Error('Failed to create project');
    return rowToProject(row);
  },

  // Soft delete — never remove data permanently at this stage
  async softDelete(id: string, userId: string): Promise<boolean> {
    const result = await query(
      `UPDATE projects
       SET status = 'deleted', updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async update(
    id: string,
    userId: string,
    data: { name?: string; description?: string }
  ): Promise<Project | null> {
    const row = await queryOne<ProjectRow>(
      `UPDATE projects
       SET name = COALESCE($3, name),
           description = COALESCE($4, description),
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status != 'deleted'
       RETURNING *`,
      [id, userId, data.name ?? null, data.description ?? null]
    );
    return row ? rowToProject(row) : null;
  },
};
