import { query, queryOne } from '../db/query';

/**
 * File repository — all database operations for project_files.
 *
 * Path model:
 * Paths are stored as POSIX-style strings relative to the project root.
 * Examples:
 *   "src/index.ts"
 *   "src/components/Button.tsx"
 *   "package.json"
 *   "src"  (a directory, is_directory = true)
 *
 * Why store content in PostgreSQL instead of the filesystem?
 * At this stage it keeps the architecture simple — no filesystem
 * management, no volume mounts, everything in one place.
 * Later (Phase 4) the Docker executor will write these files into
 * a temp directory before running. In a production system you'd
 * move to object storage (S3/Azure Blob) for large files.
 */

export interface FileRow {
  id: string;
  project_id: string;
  path: string;
  name: string;
  content: string;
  is_directory: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  name: string;
  content: string;
  isDirectory: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function rowToFile(row: FileRow): ProjectFile {
  return {
    id: row.id,
    projectId: row.project_id,
    path: row.path,
    name: row.name,
    content: row.content,
    isDirectory: row.is_directory,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const fileRepository = {
  async findAllByProject(projectId: string): Promise<ProjectFile[]> {
    const result = await query<FileRow>(
      `SELECT * FROM project_files
       WHERE project_id = $1
       ORDER BY is_directory DESC, path ASC`,
      [projectId]
    );
    return result.rows.map(rowToFile);
  },

  async findById(id: string): Promise<ProjectFile | null> {
    const row = await queryOne<FileRow>(
      'SELECT * FROM project_files WHERE id = $1',
      [id]
    );
    return row ? rowToFile(row) : null;
  },

  async findByPath(projectId: string, path: string): Promise<ProjectFile | null> {
    const row = await queryOne<FileRow>(
      'SELECT * FROM project_files WHERE project_id = $1 AND path = $2',
      [projectId, path]
    );
    return row ? rowToFile(row) : null;
  },

  async create(data: {
    projectId: string;
    path: string;
    name: string;
    content: string;
    isDirectory: boolean;
  }): Promise<ProjectFile> {
    const row = await queryOne<FileRow>(
      `INSERT INTO project_files (project_id, path, name, content, is_directory)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.projectId, data.path, data.name, data.content, data.isDirectory]
    );
    if (!row) throw new Error('Failed to create file');
    return rowToFile(row);
  },

  async updateContent(id: string, content: string): Promise<ProjectFile | null> {
    const row = await queryOne<FileRow>(
      `UPDATE project_files
       SET content = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, content]
    );
    return row ? rowToFile(row) : null;
  },

  async rename(id: string, newPath: string, newName: string): Promise<ProjectFile | null> {
    const row = await queryOne<FileRow>(
      `UPDATE project_files
       SET path = $2, name = $3, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, newPath, newName]
    );
    return row ? rowToFile(row) : null;
  },

  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM project_files WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  // Delete a directory and all files under it
  async deleteByPathPrefix(projectId: string, pathPrefix: string): Promise<number> {
    const result = await query(
      `DELETE FROM project_files
       WHERE project_id = $1 AND (path = $2 OR path LIKE $3)`,
      [projectId, pathPrefix, `${pathPrefix}/%`]
    );
    return result.rowCount ?? 0;
  },

  async countByProject(projectId: string): Promise<number> {
    const row = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM project_files WHERE project_id = $1',
      [projectId]
    );
    return parseInt(row?.count ?? '0', 10);
  },
};
