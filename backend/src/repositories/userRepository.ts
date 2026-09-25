import { query, queryOne } from '../db/query';

/**
 * User repository — all database operations for the users table.
 *
 * Why a repository pattern?
 * Repositories separate SQL from business logic. The service layer
 * describes WHAT should happen; the repository describes HOW data
 * is stored and retrieved.
 *
 * Benefits:
 * - SQL is in one place per entity — easy to audit and optimise
 * - Services don't know or care whether data comes from PostgreSQL,
 *   a cache, or a different database
 * - Easy to mock in tests
 *
 * Convention: row types (UserRow) are the raw DB shape.
 * Domain types (User) are what the rest of the app uses.
 * The password hash is stripped before leaving this layer.
 */

// Raw shape returned by PostgreSQL (snake_case columns)
export interface UserRow {
  id: string;
  email: string;
  password: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

// Public domain type — no password
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const userRepository = {
  async findById(id: string): Promise<User | null> {
    const row = await queryOne<UserRow>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return row ? rowToUser(row) : null;
  },

  async findByEmail(email: string): Promise<User | null> {
    const row = await queryOne<UserRow>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return row ? rowToUser(row) : null;
  },

  // Used by auth service — needs the password hash for comparison
  async findByEmailWithPassword(email: string): Promise<UserRow | null> {
    return queryOne<UserRow>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
  },

  async create(data: { email: string; password: string; name: string }): Promise<User> {
    const row = await queryOne<UserRow>(
      `INSERT INTO users (email, password, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.email, data.password, data.name]
    );
    if (!row) throw new Error('Failed to create user');
    return rowToUser(row);
  },

  async emailExists(email: string): Promise<boolean> {
    const row = await queryOne<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) AS exists',
      [email]
    );
    return row?.exists ?? false;
  },
};
