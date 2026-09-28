import api from './api';
import type { ProjectFile } from '../types';

interface FilesResponse {
  success: boolean;
  data: { files: ProjectFile[] };
}

interface FileResponse {
  success: boolean;
  data: { file: ProjectFile };
}

export const fileService = {
  async getFiles(projectId: string): Promise<ProjectFile[]> {
    const res = await api.get<FilesResponse>(`/projects/${projectId}/files`);
    return res.data.data.files;
  },

  async createFile(projectId: string, data: {
    path: string;
    content?: string;
    isDirectory?: boolean;
  }): Promise<ProjectFile> {
    const res = await api.post<FileResponse>(`/projects/${projectId}/files`, data);
    return res.data.data.file;
  },

  async updateContent(fileId: string, content: string): Promise<ProjectFile> {
    const res = await api.put<FileResponse>(`/files/${fileId}`, { content });
    return res.data.data.file;
  },

  async renameFile(fileId: string, path: string): Promise<ProjectFile> {
    const res = await api.put<FileResponse>(`/files/${fileId}`, { path });
    return res.data.data.file;
  },

  async deleteFile(fileId: string): Promise<void> {
    await api.delete(`/files/${fileId}`);
  },
};
