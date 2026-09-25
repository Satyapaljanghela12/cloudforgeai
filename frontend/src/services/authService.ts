import api from './api';
import type { User } from '../types';

interface AuthResponse {
  success: boolean;
  data: { user: User };
}

export const authService = {
  async register(data: { name: string; email: string; password: string }): Promise<User> {
    const res = await api.post<AuthResponse>('/auth/register', data);
    return res.data.data.user;
  },

  async login(data: { email: string; password: string }): Promise<User> {
    const res = await api.post<AuthResponse>('/auth/login', data);
    return res.data.data.user;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },

  async getMe(): Promise<User> {
    const res = await api.get<AuthResponse>('/auth/me');
    return res.data.data.user;
  },
};
