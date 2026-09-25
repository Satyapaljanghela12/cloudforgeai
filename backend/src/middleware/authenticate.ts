import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { userRepository } from '../repositories/userRepository';
import { ApiError } from '../utils/ApiError';

/**
 * Authentication middleware.
 *
 * Reads the JWT from the httpOnly cookie named 'token'.
 * If valid, attaches the user to req.user and calls next().
 * If invalid or missing, throws 401.
 *
 * Why attach to req.user and not just the userId?
 * The controller often needs user data (name, email) for responses.
 * Attaching the full user object avoids a redundant DB lookup in each
 * controller that happens to need it.
 *
 * Why extend Express Request?
 * TypeScript won't know about req.user without an interface augmentation.
 * We extend the Request type globally so every controller gets type safety.
 */

// Extend Express Request type so req.user is typed everywhere
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
      };
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from httpOnly cookie
    const token = req.cookies?.token as string | undefined;

    if (!token) {
      throw ApiError.unauthorized();
    }

    // Verify signature and expiry — throws if invalid
    const payload = authService.verifyToken(token);

    // Fetch user to confirm they still exist (not deleted)
    const user = await userRepository.findById(payload.userId);
    if (!user) {
      throw ApiError.unauthorized();
    }

    // Attach to request for downstream use
    req.user = { id: user.id, email: user.email, name: user.name };
    next();
  } catch (err) {
    next(err);
  }
}
