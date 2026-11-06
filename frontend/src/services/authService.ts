import api from './api';
import type { User } from '../types';

// In-memory token cache — avoids hammering /auth/token on every request
let cachedToken: string | null = null;

interface AuthResponse {
  success: boolean;
  data: { user: User };
}

export const authService = {
  async register(data: { name: string; email: string; password: string }): Promise<User> {
    cachedToken = null;
    const res = await api.post<AuthResponse>('/auth/register', data);
    return res.data.data.user;
  },

  async login(data: { email: string; password: string }): Promise<User> {
    cachedToken = null;
    const res = await api.post<AuthResponse>('/auth/login', data);
    return res.data.data.user;
  },

  async logout(): Promise<void> {
    cachedToken = null;
    await api.post('/auth/logout');
  },

  async getMe(): Promise<User> {
    const res = await api.get<AuthResponse>('/auth/me');
    return res.data.data.user;
  },

  async getToken(): Promise<string> {
    if (cachedToken) return cachedToken;
    const res = await api.get<{ success: boolean; data: { token: string } }>('/auth/token');
    cachedToken = res.data.data.token;
    return cachedToken;
  },
};
