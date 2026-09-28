import type { Request, Response, NextFunction } from 'express';
import { fileService } from '../services/fileService';

export const fileController = {
  // GET /api/projects/:projectId/files
  async getFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = await fileService.getFiles(req.params.projectId as string, req.user!.id);
      res.status(200).json({ success: true, data: { files } });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/projects/:projectId/files
  async createFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { path, content, isDirectory } = req.body as {
        path?: string;
        content?: string;
        isDirectory?: boolean;
      };

      if (!path) {
        res.status(400).json({ success: false, error: 'path is required' });
        return;
      }

      const file = await fileService.createFile(
        req.params.projectId as string,
        req.user!.id,
        { path, content, isDirectory }
      );
      res.status(201).json({ success: true, data: { file } });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/files/:fileId
  async updateFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { content, path } = req.body as { content?: string; path?: string };

      // Either update content or rename (path) — not both at once
      if (content !== undefined) {
        const file = await fileService.updateFileContent(
          req.params.fileId as string,
          req.user!.id,
          content
        );
        res.status(200).json({ success: true, data: { file } });
      } else if (path !== undefined) {
        const file = await fileService.renameFile(
          req.params.fileId as string,
          req.user!.id,
          path
        );
        res.status(200).json({ success: true, data: { file } });
      } else {
        res.status(400).json({ success: false, error: 'content or path is required' });
      }
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/files/:fileId
  async deleteFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await fileService.deleteFile(req.params.fileId as string, req.user!.id);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  },
};
