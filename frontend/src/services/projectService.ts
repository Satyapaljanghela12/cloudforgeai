import api from './api';
import type { Project } from '../types';

interface ProjectsResponse {
  success: boolean;
  data: { projects: Project[] };
}

interface ProjectResponse {
  success: boolean;
  data: { project: Project };
}

export const projectService = {
  async getProjects(): Promise<Project[]> {
    const res = await api.get<ProjectsResponse>('/projects');
    return res.data.data.projects;
  },

  async getProject(id: string): Promise<Project> {
    const res = await api.get<ProjectResponse>(`/projects/${id}`);
    return res.data.data.project;
  },

  async createProject(data: {
    name: string;
    description?: string;
    language: string;
  }): Promise<Project> {
    const res = await api.post<ProjectResponse>('/projects', data);
    return res.data.data.project;
  },

  async deleteProject(id: string): Promise<void> {
    await api.delete(`/projects/${id}`);
  },
};
