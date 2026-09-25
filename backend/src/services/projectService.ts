import { projectRepository, Project } from '../repositories/projectRepository';
import { ApiError } from '../utils/ApiError';

/**
 * Project service — business logic for project management.
 *
 * The service layer sits between controllers (HTTP) and repositories (DB).
 * Controllers handle request/response. Repositories handle SQL.
 * Services handle business rules.
 *
 * Supported languages — defined here so it's easy to extend.
 * When Docker execution is added in Phase 4, these will map to
 * Docker images and run commands.
 */

export const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'html',
] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

function isValidLanguage(lang: string): lang is Language {
  return SUPPORTED_LANGUAGES.includes(lang as Language);
}

export const projectService = {
  async getProjects(userId: string): Promise<Project[]> {
    return projectRepository.findAllByUser(userId);
  },

  async getProject(id: string, userId: string): Promise<Project> {
    const project = await projectRepository.findByIdAndUser(id, userId);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }
    return project;
  },

  async createProject(
    userId: string,
    data: { name: string; description?: string; language: string }
  ): Promise<Project> {
    const name = data.name.trim();
    if (!name) {
      throw ApiError.badRequest('Project name is required');
    }
    if (name.length > 100) {
      throw ApiError.badRequest('Project name must be 100 characters or less');
    }

    if (!isValidLanguage(data.language)) {
      throw ApiError.badRequest(
        `Unsupported language. Choose from: ${SUPPORTED_LANGUAGES.join(', ')}`
      );
    }

    return projectRepository.create({
      userId,
      name,
      description: data.description?.trim(),
      language: data.language,
    });
  },

  async deleteProject(id: string, userId: string): Promise<void> {
    // Verify ownership first — throws 404 if not found or not owned
    await projectService.getProject(id, userId);
    await projectRepository.softDelete(id, userId);
  },
};
