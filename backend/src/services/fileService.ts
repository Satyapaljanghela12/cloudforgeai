import path from 'path';
import { fileRepository, ProjectFile } from '../repositories/fileRepository';
import { projectRepository } from '../repositories/projectRepository';
import { ApiError } from '../utils/ApiError';

/**
 * File service — business logic for the project file system.
 *
 * Path traversal prevention:
 * This is the critical security concern for a file system.
 * A malicious user could try paths like:
 *   "../../etc/passwd"
 *   "../other-project/secret.env"
 *
 * We prevent this by:
 * 1. Normalising the path with path.posix.normalize()
 * 2. Rejecting any path that starts with ".." or "/"
 * 3. Rejecting absolute paths
 *
 * This ensures all paths stay within the virtual project root.
 *
 * Default files:
 * When a project is opened for the first time (zero files), we seed
 * it with a starter file appropriate for the project language.
 * This gives users an immediate starting point.
 *
 * File limits:
 * We enforce a max of 200 files per project and 512KB per file
 * at this stage. These can be adjusted as the platform grows.
 */

const MAX_FILES_PER_PROJECT = 200;
const MAX_FILE_SIZE_BYTES = 512 * 1024; // 512 KB

// Default starter files per language
const DEFAULT_FILES: Record<string, Array<{ path: string; content: string }>> = {
  javascript: [
    {
      path: 'index.js',
      content: `// Welcome to CloudForge AI\nconsole.log('Hello, world!');\n`,
    },
  ],
  typescript: [
    {
      path: 'index.ts',
      content: `// Welcome to CloudForge AI\nconst message: string = 'Hello, world!';\nconsole.log(message);\n`,
    },
  ],
  python: [
    {
      path: 'main.py',
      content: `# Welcome to CloudForge AI\nprint('Hello, world!')\n`,
    },
  ],
  html: [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Project</title>
</head>
<body>
  <h1>Hello, world!</h1>
</body>
</html>
`,
    },
  ],
};

/**
 * Validate and normalise a file path.
 * Returns the cleaned path or throws an ApiError.
 */
function sanitizePath(rawPath: string): string {
  // Strip leading/trailing whitespace
  const trimmed = rawPath.trim();

  if (!trimmed) {
    throw ApiError.badRequest('File path cannot be empty');
  }

  // Normalise POSIX separators (handles double slashes, . segments)
  const normalised = path.posix.normalize(trimmed);

  // Block absolute paths and traversal attempts
  if (normalised.startsWith('/') || normalised.startsWith('..')) {
    throw ApiError.badRequest('Invalid file path');
  }

  // Block hidden files at root level (e.g. .env)
  // Allow them in subdirectories — .gitignore, .eslintrc etc are valid
  const topSegment = normalised.split('/')[0];
  if (topSegment === '.env' || topSegment === '.env.local') {
    throw ApiError.badRequest('Environment files cannot be created through the IDE');
  }

  return normalised;
}

function getFileName(filePath: string): string {
  return path.posix.basename(filePath);
}

export const fileService = {
  /**
   * Get all files for a project.
   * Verifies project ownership before returning.
   * Seeds default files if the project has none.
   */
  async getFiles(projectId: string, userId: string): Promise<ProjectFile[]> {
    // Verify ownership
    const project = await projectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw ApiError.notFound('Project not found');

    const files = await fileRepository.findAllByProject(projectId);

    // Seed starter file on first open
    if (files.length === 0) {
      const starters = DEFAULT_FILES[project.language] ?? DEFAULT_FILES.javascript;
      for (const starter of starters) {
        await fileRepository.create({
          projectId,
          path: starter.path,
          name: getFileName(starter.path),
          content: starter.content,
          isDirectory: false,
        });
      }
      return fileRepository.findAllByProject(projectId);
    }

    return files;
  },

  /**
   * Get a single file by ID.
   * Verifies the file belongs to a project owned by the user.
   */
  async getFile(fileId: string, userId: string): Promise<ProjectFile> {
    const file = await fileRepository.findById(fileId);
    if (!file) throw ApiError.notFound('File not found');

    // Verify project ownership
    const project = await projectRepository.findByIdAndUser(file.projectId, userId);
    if (!project) throw ApiError.notFound('File not found');

    return file;
  },

  async createFile(
    projectId: string,
    userId: string,
    data: { path: string; content?: string; isDirectory?: boolean }
  ): Promise<ProjectFile> {
    // Verify ownership
    const project = await projectRepository.findByIdAndUser(projectId, userId);
    if (!project) throw ApiError.notFound('Project not found');

    const cleanPath = sanitizePath(data.path);
    const isDirectory = data.isDirectory ?? false;
    const content = isDirectory ? '' : (data.content ?? '');

    // Enforce file size limit
    if (!isDirectory && Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE_BYTES) {
      throw ApiError.badRequest('File content exceeds maximum size of 512KB');
    }

    // Enforce file count limit
    const count = await fileRepository.countByProject(projectId);
    if (count >= MAX_FILES_PER_PROJECT) {
      throw ApiError.badRequest(`Project has reached the maximum of ${MAX_FILES_PER_PROJECT} files`);
    }

    // Check for duplicates
    const existing = await fileRepository.findByPath(projectId, cleanPath);
    if (existing) {
      throw ApiError.badRequest(`A file already exists at path: ${cleanPath}`);
    }

    return fileRepository.create({
      projectId,
      path: cleanPath,
      name: getFileName(cleanPath),
      content,
      isDirectory,
    });
  },

  async updateFileContent(
    fileId: string,
    userId: string,
    content: string
  ): Promise<ProjectFile> {
    const file = await fileService.getFile(fileId, userId);

    if (file.isDirectory) {
      throw ApiError.badRequest('Cannot set content on a directory');
    }

    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_SIZE_BYTES) {
      throw ApiError.badRequest('File content exceeds maximum size of 512KB');
    }

    const updated = await fileRepository.updateContent(fileId, content);
    if (!updated) throw ApiError.notFound('File not found');
    return updated;
  },

  async renameFile(
    fileId: string,
    userId: string,
    newPath: string
  ): Promise<ProjectFile> {
    const file = await fileService.getFile(fileId, userId);
    const cleanPath = sanitizePath(newPath);

    // Check target path is not already taken
    const existing = await fileRepository.findByPath(file.projectId, cleanPath);
    if (existing && existing.id !== fileId) {
      throw ApiError.badRequest(`A file already exists at path: ${cleanPath}`);
    }

    const updated = await fileRepository.rename(fileId, cleanPath, getFileName(cleanPath));
    if (!updated) throw ApiError.notFound('File not found');
    return updated;
  },

  async deleteFile(fileId: string, userId: string): Promise<void> {
    const file = await fileService.getFile(fileId, userId);

    if (file.isDirectory) {
      // Delete the directory and everything under it
      await fileRepository.deleteByPathPrefix(file.projectId, file.path);
    } else {
      await fileRepository.delete(fileId);
    }
  },
};
