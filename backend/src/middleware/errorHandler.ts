import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { config } from '../config/env';

/**
 * Global error handling middleware.
 *
 * Why: Without this, unhandled errors either crash the process or return
 * inconsistent response shapes. Centralising error handling means:
 * - Every error response has the same JSON shape
 * - Operational errors (ApiError) get their correct HTTP status
 * - Unexpected errors get logged with full stack traces
 * - Stack traces are never leaked to clients in production
 *
 * Must be registered LAST in Express — after all routes.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    // Operational error — expected, safe to surface to client
    logger.warn('Operational error', {
      statusCode: err.statusCode,
      message: err.message,
      path: req.path,
      method: req.method,
    });

    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // Unexpected error — log full details, hide internals from client
  logger.error('Unexpected error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: config.isDevelopment ? err.message : 'Internal server error',
    ...(config.isDevelopment && { stack: err.stack }),
  });
}
