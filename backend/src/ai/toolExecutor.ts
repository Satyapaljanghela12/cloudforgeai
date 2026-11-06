import { fileRepository } from '../repositories/fileRepository';
import { fileService } from '../services/fileService';
import { indexSingleFile } from './embeddingService';
import type { ToolName } from './tools';
import { logger } from '../utils/logger';
import path from 'path';

/**
 * Tool executor — runs AI tool calls safely within project boundaries.
 *
 * Every tool call goes through this layer. It enforces:
 * 1. Project ownership — tools can only touch files in the agent's project
 * 2. Path validation — reuses the same sanitize logic as the file API
 * 3. Bounded results — file content is truncated to avoid blowing the context window
 *
 * Why not let the AI call the HTTP API directly?
 * The AI service runs server-side. Calling HTTP would add unnecessary
 * network round-trips and complicate auth. Direct service/repository
 * calls are simpler and faster.
 *
 * Return values are always strings — the AI receives text, not objects.
 * Errors are returned as descriptive strings (not thrown) so the AI
 * can read the error and decide how to handle it.
 */

const MAX_READ_BYTES = 32_000; // ~32KB — enough for most files, fits in context

export interface ToolContext {
  projectId: string;
  userId: string;
}

type ToolArgs = Record<string, string>;

export async function executeTool(
  toolName: ToolName,
  args: ToolArgs,
  ctx: ToolContext
): Promise<string> {
  logger.info('AI tool call', { tool: toolName, projectId: ctx.projectId });

  try {
    switch (toolName) {
      case 'list_files': {
        const files = await fileRepository.findAllByProject(ctx.projectId);
        if (files.length === 0) return 'No files in project.';
        const lines = files
          .filter((f) => !f.isDirectory)
          .map((f) => f.path)
          .sort();
        return lines.join('\n');
      }

      case 'read_file': {
        const filePath = args.path;
        if (!filePath) return 'Error: path is required';

        const files = await fileRepository.findAllByProject(ctx.projectId);
        const file = files.find((f) => f.path === filePath && !f.isDirectory);

        if (!file) return `Error: File not found: ${filePath}`;

        const content = file.content;
        if (Buffer.byteLength(content, 'utf8') > MAX_READ_BYTES) {
          return content.slice(0, MAX_READ_BYTES) + '\n\n[... file truncated — too large to read fully]';
        }
        return content || '(empty file)';
      }

      case 'write_file': {
        const { path: filePath, content } = args;
        if (!filePath) return 'Error: path is required';
        if (content === undefined) return 'Error: content is required';

        const files = await fileRepository.findAllByProject(ctx.projectId);
        const existing = files.find((f) => f.path === filePath);

        if (existing) {
          await fileService.updateFileContent(existing.id, ctx.userId, content);
          // Re-index the updated file in the background
          void indexSingleFile(ctx.projectId, existing.id, filePath, content);
          return `Updated file: ${filePath}`;
        } else {
          const parts = filePath.split('/');
          for (let i = 1; i < parts.length; i++) {
            const dirPath = parts.slice(0, i).join('/');
            const dirExists = files.find((f) => f.path === dirPath && f.isDirectory);
            if (!dirExists) {
              await fileService.createFile(ctx.projectId, ctx.userId, {
                path: dirPath,
                isDirectory: true,
              });
            }
          }
          const newFile = await fileService.createFile(ctx.projectId, ctx.userId, {
            path: filePath,
            content,
            isDirectory: false,
          });
          // Index the new file in the background
          void indexSingleFile(ctx.projectId, newFile.id, filePath, content);
          return `Created file: ${filePath}`;
        }
      }

      case 'delete_file': {
        const filePath = args.path;
        if (!filePath) return 'Error: path is required';

        const files = await fileRepository.findAllByProject(ctx.projectId);
        const file = files.find((f) => f.path === filePath);

        if (!file) return `Error: File not found: ${filePath}`;

        await fileService.deleteFile(file.id, ctx.userId);
        return `Deleted file: ${filePath}`;
      }

      default:
        return `Error: Unknown tool: ${toolName}`;
    }
  } catch (err) {
    const message = (err as Error).message;
    logger.warn('Tool execution error', { tool: toolName, message });
    return `Error: ${message}`;
  }
}
