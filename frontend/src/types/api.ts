/**
 * Shared API response types.
 *
 * Why: The backend always returns { success, data } or { success, error }.
 * Typing these centrally means every service function has a consistent
 * return shape and TypeScript can catch mismatches at compile time.
 */

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface HealthResponse {
  status: string;
  environment: string;
  timestamp: string;
}
