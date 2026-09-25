import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * HTTP request logger middleware.
 *
 * Why: Every incoming request should be traceable.
 * Logging method, path, status, and duration gives you an audit trail
 * and helps diagnose performance issues.
 *
 * Later this can include a unique requestId per request, which propagates
 * through all downstream service calls for distributed tracing.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    logger.info('HTTP request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
}
