import { Pool } from 'pg';
import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * PostgreSQL connection pool.
 *
 * Supabase SSL:
 * We parse the DATABASE_URL manually and pass ssl as a separate option.
 * This prevents pg-connection-string from overriding rejectUnauthorized
 * when it parses the URL — which was causing SELF_SIGNED_CERT_IN_CHAIN.
 *
 * Interview point: PostgreSQL has a max_connections setting (default 100).
 * Supabase free tier allows ~60 connections. We keep the pool small (5)
 * so multiple dev processes don't exhaust the limit.
 */

// Parse the DATABASE_URL manually so we can inject ssl separately
function buildPoolConfig() {
  const url = new URL(config.databaseUrl);

  return {
    host: url.hostname,
    port: parseInt(url.port || '5432', 10),
    database: url.pathname.replace(/^\//, ''),
    user: url.username,
    password: url.password,
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    // Explicitly set ssl here — not via the URL — so pg respects rejectUnauthorized
    ssl: {
      rejectUnauthorized: false,
    },
  };
}

export const pool = new Pool(buildPoolConfig());

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
