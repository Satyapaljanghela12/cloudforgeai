import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { userRepository, User } from '../repositories/userRepository';
import { ApiError } from '../utils/ApiError';

/**
 * Auth service — registration, login, token generation.
 *
 * Why bcrypt?
 * bcrypt is a password-hashing function designed to be slow.
 * Unlike MD5/SHA which are designed for speed, bcrypt's cost factor
 * means brute-forcing a stolen password database takes years instead
 * of hours. Never store plain-text passwords or use fast hash functions.
 *
 * Why JWT?
 * JWTs are stateless — the server doesn't need to store sessions.
 * The token contains the user's identity, signed with JWT_SECRET.
 * Any tampering invalidates the signature.
 *
 * Why httpOnly cookies instead of localStorage?
 * localStorage is accessible to JavaScript, making it vulnerable to XSS.
 * An httpOnly cookie cannot be read by JavaScript at all — only the
 * browser sends it automatically on each request.
 * This is the recommended approach for auth tokens in web apps.
 *
 * Tradeoff: httpOnly cookies require CORS to be configured with
 * credentials:true, which we already set up in Phase 1.
 */

export interface TokenPayload {
  userId: string;
  email: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

export const authService = {
  async register(data: {
    email: string;
    password: string;
    name: string;
  }): Promise<AuthResult> {
    // Normalize email
    const email = data.email.toLowerCase().trim();

    // Check for duplicate email
    const exists = await userRepository.emailExists(email);
    if (exists) {
      throw ApiError.badRequest('An account with this email already exists');
    }

    // Validate password strength
    if (data.password.length < 8) {
      throw ApiError.badRequest('Password must be at least 8 characters');
    }

    // Hash password — bcryptjs handles salt generation internally
    const hashedPassword = await bcrypt.hash(data.password, config.bcryptRounds);

    // Create user
    const user = await userRepository.create({
      email,
      password: hashedPassword,
      name: data.name.trim(),
    });

    const token = generateToken({ userId: user.id, email: user.email });
    return { user, token };
  },

  async login(data: { email: string; password: string }): Promise<AuthResult> {
    const email = data.email.toLowerCase().trim();

    // Fetch the full row (including password hash)
    const userRow = await userRepository.findByEmailWithPassword(email);

    // Use the same error message for "not found" and "wrong password"
    // to prevent user enumeration attacks (an attacker discovering
    // which emails are registered by observing different error messages)
    const invalidCredentials = ApiError.unauthorized('Invalid email or password');

    if (!userRow) {
      throw invalidCredentials;
    }

    const passwordMatch = await bcrypt.compare(data.password, userRow.password);
    if (!passwordMatch) {
      throw invalidCredentials;
    }

    const user = await userRepository.findById(userRow.id);
    if (!user) throw invalidCredentials;

    const token = generateToken({ userId: user.id, email: user.email });
    return { user, token };
  },

  verifyToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, config.jwtSecret) as TokenPayload;
    } catch {
      throw ApiError.unauthorized('Invalid or expired token');
    }
  },
};

function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}
