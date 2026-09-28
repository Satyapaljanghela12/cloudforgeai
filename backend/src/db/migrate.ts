import { pool } from './pool';
import { logger } from '../utils/logger';

/**
 * Minimal migration system.
 *
 * Why migrations instead of running raw SQL manually?
 * - Schema changes are version-controlled alongside code
 * - Every environment (dev, staging, prod) applies the exact same changes
 * - You can see the full history of how the schema evolved
 * - No "I forgot to run that ALTER TABLE" bugs
 *
 * Why not use an ORM like Prisma or TypeORM?
 * ORMs are convenient but they abstract away SQL in ways that make it
 * hard to understand what queries are actually running. For a platform
 * that needs to understand its own infrastructure, writing SQL directly
 * is more valuable for learning and debugging.
 *
 * This is a simple sequential migration runner:
 * 1. Create a `migrations` table if it doesn't exist
 * 2. Check which migrations have already been applied
 * 3. Run pending ones in order
 * 4. Record each one so it never runs twice
 *
 * Interview point: Production systems use tools like Flyway, Liquibase,
 * or node-pg-migrate. This hand-rolled version demonstrates the concept.
 */

interface Migration {
  id: string;      // e.g. "001_create_users"
  sql: string;
}

// ── Migrations — add new ones at the END only ─────────────────────────────────

const migrations: Migration[] = [
  {
    id: '001_create_users',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email       TEXT NOT NULL UNIQUE,
        password    TEXT NOT NULL,
        name        TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
    `,
  },
  {
    id: '002_create_projects',
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        description TEXT,
        language    TEXT NOT NULL DEFAULT 'javascript',
        status      TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'archived', 'deleted')),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects (user_id);
    `,
  },
  {
    id: '003_create_project_files',
    sql: `
      CREATE TABLE IF NOT EXISTS project_files (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        path        TEXT NOT NULL,
        name        TEXT NOT NULL,
        content     TEXT NOT NULL DEFAULT '',
        is_directory BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        -- A project cannot have two files at the same path
        UNIQUE (project_id, path)
      );

      CREATE INDEX IF NOT EXISTS project_files_project_id_idx ON project_files (project_id);
    `,
  },
];

// ── Migration runner ──────────────────────────────────────────────────────────

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id          TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Fetch already-applied migrations
    const { rows: applied } = await client.query<{ id: string }>(
      'SELECT id FROM migrations ORDER BY applied_at'
    );
    const appliedIds = new Set(applied.map((r) => r.id));

    // Run pending migrations in a transaction each
    for (const migration of migrations) {
      if (appliedIds.has(migration.id)) {
        continue;
      }

      logger.info(`Applying migration: ${migration.id}`);

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO migrations (id) VALUES ($1)', [migration.id]);
        await client.query('COMMIT');
        logger.info(`Migration applied: ${migration.id}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    logger.info('All migrations up to date');
  } finally {
    client.release();
  }
}
