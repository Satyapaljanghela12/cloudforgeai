import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { config } from '../config/env';

/**
 * Auth controller — handles HTTP for register, login, logout, and me.
 *
 * Controllers are thin. They:
 * 1. Parse and validate the request shape
 * 2. Call the service
 * 3. Set the cookie
 * 4. Return the response
 *
 * Business logic lives in the service, not here.
 */

// Cookie configuration
const COOKIE_NAME = 'token';
const cookieOptions = {
  httpOnly: true,   // Cannot be read by JavaScript — XSS protection
  secure: config.isProduction, // HTTPS only in production
  sameSite: 'lax' as const,   // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

export const authController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, name } = req.body as {
        email?: string;
        password?: string;
        name?: string;
      };

      if (!email || !password || !name) {
        res.status(400).json({ success: false, error: 'email, password, and name are required' });
        return;
      }

      const { user, token } = await authService.register({ email, password, name });

      res.cookie(COOKIE_NAME, token, cookieOptions);
      res.status(201).json({ success: true, data: { user } });
    } catch (err) {
      next(err);
    }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body as {
        email?: string;
        password?: string;
      };

      if (!email || !password) {
        res.status(400).json({ success: false, error: 'email and password are required' });
        return;
      }

      const { user, token } = await authService.login({ email, password });

      res.cookie(COOKIE_NAME, token, cookieOptions);
      res.status(200).json({ success: true, data: { user } });
    } catch (err) {
      next(err);
    }
  },

  async logout(_req: Request, res: Response): Promise<void> {
    // Clear the cookie by setting maxAge to 0
    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
    });
    res.status(200).json({ success: true });
  },

  async me(req: Request, res: Response): Promise<void> {
    // req.user is guaranteed by the authenticate middleware
    res.status(200).json({ success: true, data: { user: req.user } });
  },
};
