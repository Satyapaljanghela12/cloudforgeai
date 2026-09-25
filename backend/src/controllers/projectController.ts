import { Request, Response, NextFunction } from 'express';
import { projectService } from '../services/projectService';

export const projectController = {
  async getProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projects = await projectService.getProjects(req.user!.id);
      res.status(200).json({ success: true, data: { projects } });
    } catch (err) {
      next(err);
    }
  },

  async getProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const project = await projectService.getProject(req.params.id as string, req.user!.id);
      res.status(200).json({ success: true, data: { project } });
    } catch (err) {
      next(err);
    }
  },

  async createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, description, language } = req.body as {
        name?: string;
        description?: string;
        language?: string;
      };

      if (!name || !language) {
        res.status(400).json({ success: false, error: 'name and language are required' });
        return;
      }

      const project = await projectService.createProject(req.user!.id, {
        name,
        description,
        language,
      });

      res.status(201).json({ success: true, data: { project } });
    } catch (err) {
      next(err);
    }
  },

  async deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await projectService.deleteProject(req.params.id as string, req.user!.id);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  },
};
