import { Router, Request, Response } from 'express';
import { config } from '../config/env';

/**
 * Health check route.
 *
 * Why: Every production service needs a /health endpoint.
 * Load balancers, container orchestrators (Kubernetes), and monitoring
 * tools use this to determine if the service is alive.
 *
 * Later this can be extended to check database connectivity,
 * Redis availability, and report overall system health.
 */
const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

export default router;
