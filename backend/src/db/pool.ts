import { Pool } from 'pg';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * PostgreSQL connection pool.
 *
 * Why a pool instead of a single connection?
 * A pool maintains multiple open connections and hands them out to
 * concurrent requests. Without pooling, each request would open and close
 * a connection (~50ms overhead) and you'd hit PostgreSQL's connection limit
 * under any real load.
 *
 * Why a singleton?
 * The pool is expensive to create and should live for the lifetime of the
 * process. Importing this module multiple times returns the same instance
 * (Node.js module caching).
 *
 * Interview point: PostgreSQL has a max_connections setting (default 100).
 * In production with multiple Node.js processes, you'd use PgBouncer as a
 * connection pooler in front of PostgreSQL to prevent connection exhaustion.
 */
export const pool = new Pool({
  connectionString: config.databaseUrl,
  // Max simultaneous connections this pool will open.
  // Keep this conservative — each connection consumes PostgreSQL resources.
  max: 10,
  // How long to wait for a connection from the pool before throwing (ms)
  connectionTimeoutMillis: 5000,
  // How long a connection can sit idle before being closed (ms)
  idleTimeoutMillis: 30000,
});

// Log pool errors so they're never silently swallowed
pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { message: err.message });
});

/**
 * Verify the database connection on startup.
 * Call this from index.ts before starting the HTTP server.
 */
export async function connectDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('Database connection established');
  } finally {
    client.release();
  }
}
