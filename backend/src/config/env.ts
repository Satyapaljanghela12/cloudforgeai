import dotenv from 'dotenv';

dotenv.config();

/**
 * Central environment configuration.
 *
 * Why: All env vars are validated and typed in one place.
 * If a required variable is missing, the app fails fast at startup
 * rather than crashing in the middle of a request.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  // ── Server ──────────────────────────────────────────────────────────────
  port: parseInt(optionalEnv('PORT', '3001'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:5173'),
  isDevelopment: optionalEnv('NODE_ENV', 'development') === 'development',
  isProduction: optionalEnv('NODE_ENV', 'development') === 'production',

  // ── Database ─────────────────────────────────────────────────────────────
  //
  // Why not individual host/port/user/password fields?
  // A single DATABASE_URL is the 12-factor app standard. It's portable
  // across local dev, Docker, and cloud platforms (Heroku, Railway, Azure)
  // without changing code — only the env var changes.
  databaseUrl: requireEnv('DATABASE_URL'),

  // ── Auth ─────────────────────────────────────────────────────────────────
  //
  // JWT_SECRET must be a long, random string (32+ chars).
  // In production this should come from a secrets manager, not a .env file.
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: optionalEnv('JWT_EXPIRES_IN', '7d'),

  // ── Bcrypt ───────────────────────────────────────────────────────────────
  bcryptRounds: parseInt(optionalEnv('BCRYPT_ROUNDS', '12'), 10),

  // ── AI ───────────────────────────────────────────────────────────────────
  //
  // OPENAI_API_KEY: Required for the AI coding agent.
  // optionalEnv here so the server still starts without it — AI endpoints
  // will return a clear error if the key is missing rather than crashing
  // the entire backend on startup.
  openaiApiKey: optionalEnv('OPENAI_API_KEY', ''),
  openaiModel: optionalEnv('OPENAI_MODEL', 'deepseek/deepseek-r1-0528:free'),
  openaiBaseUrl: optionalEnv('OPENAI_BASE_URL', 'https://openrouter.ai/api/v1'),
  // Embedding model — must be OpenAI-compatible.
  // OpenRouter proxies OpenAI embeddings: use openai/text-embedding-3-small
  embeddingModel: optionalEnv('EMBEDDING_MODEL', 'openai/text-embedding-3-small'),
  embeddingDimensions: parseInt(optionalEnv('EMBEDDING_DIMENSIONS', '1536'), 10),
} as const;
