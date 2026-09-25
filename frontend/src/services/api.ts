import axios from 'axios';

/**
 * Axios instance — base API client.
 *
 * Why axios over fetch?
 * - Interceptors: attach auth headers or handle 401s globally
 * - Automatic JSON parsing
 * - Better error objects (response body accessible on error)
 *
 * withCredentials: true — sends cookies with every request.
 * Required for the httpOnly JWT cookie to be included.
 * Must match the backend CORS credentials:true setting.
 */
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor — unwrap the data field
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Normalise error message from backend's { success: false, error: '...' }
    const message =
      error.response?.data?.error ??
      error.message ??
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

export default api;
