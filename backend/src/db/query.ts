import { QueryResult, QueryResultRow } from 'pg';
import { pool } from './pool';
import { logger } from '../utils/logger';

/**
 * Typed query helper.
 *
 * Why: Using pool.query() directly everywhere means:
 * - No consistent error logging
 * - No easy place to add query timing/tracing later
 * - Repetitive try/catch in every repository
 *
 * This wrapper gives us a single choke point for all database queries.
 * It logs slow queries, and in future can emit metrics or traces.
 *
 * Why parameterised queries ($1, $2, ...)?
 * They completely prevent SQL injection. The pg driver sends the query
 * and parameters separately to PostgreSQL — user input is NEVER
 * interpolated into the SQL string.
 *
 * NEVER use string interpolation to build SQL queries.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();

  try {
    const result = await pool.query<T>(sql, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      logger.warn('Slow query detected', { sql, duration: `${duration}ms` });
    }

    return result;
  } catch (err) {
    const error = err as Error;
    logger.error('Database query failed', {
      sql,
      message: error.message,
    });
    throw err;
  }
}

/**
 * Convenience: return the first row or null.
 * Most lookups (find by id, find by email) return 0 or 1 rows.
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(sql, params);
  return result.rows[0] ?? null;
}
