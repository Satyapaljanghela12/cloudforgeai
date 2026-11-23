import api from './api';

export interface VMConnection {
  id: string;
  host: string;
  port: number;
  username: string;
  status: 'pending' | 'connected' | 'failed';
  lastChecked: string | null;
}

export const vmService = {
  async connect(data: {
    host: string;
    port: number;
    username: string;
    privateKey: string;
  }): Promise<void> {
    await api.post('/vm/connect', data);
  },

  async getStatus(): Promise<VMConnection | null> {
    const res = await api.get<{ success: boolean; data: { vm: VMConnection | null } }>('/vm/status');
    return res.data.data.vm;
  },

  async test(): Promise<{ connected: boolean; vm: VMConnection | null }> {
    const res = await api.post<{ success: boolean; data: { connected: boolean; vm: VMConnection | null } }>('/vm/test', {});
    return res.data.data;
  },

  async disconnect(): Promise<void> {
    await api.delete('/vm/disconnect');
  },
};
