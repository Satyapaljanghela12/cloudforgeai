import type { Request, Response, NextFunction } from 'express';
import { runAgent } from '../ai/agentService';
import { indexProject } from '../ai/embeddingService';
import { embeddingRepository } from '../repositories/embeddingRepository';
import { projectService } from '../services/projectService';
import { aiRepository } from '../repositories/aiRepository';
import { ApiError } from '../utils/ApiError';

/**
 * AI controller — HTTP layer for the AI agent.
 *
 * POST /api/projects/:id/ai/chat
 * Uses Server-Sent Events (SSE) to stream the agent's response.
 *
 * Why SSE instead of a regular JSON response?
 * The agent can take 10-30 seconds to respond, especially when it
 * calls multiple tools. SSE keeps the connection open and pushes
 * events as they happen — the user sees tokens appearing in real time
 * instead of waiting for a loading spinner to finish.
 *
 * SSE format:
 *   data: {"type":"token","content":"Hello"}\n\n
 *   data: {"type":"tool_call","name":"read_file"}\n\n
 *   data: {"type":"done","content":"..."}\n\n
 *
 * The connection closes after the 'done' or 'error' event.
 *
 * DELETE /api/projects/:id/ai/chat
 * Clears the conversation history for a fresh start.
 */
export const aiController = {
  async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;
      const { message } = req.body as { message?: string };

      if (!message?.trim()) {
        throw ApiError.badRequest('message is required');
      }

      // Verify project ownership
      await projectService.getProject(projectId, userId);

      // ── Set up SSE ─────────────────────────────────────────────────────────
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
      res.flushHeaders();

      function sendEvent(data: object) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }

      // ── Run the agent ──────────────────────────────────────────────────────
      const ctx = { projectId, userId };

      try {
        for await (const event of runAgent(message.trim(), projectId, ctx)) {
          sendEvent(event);
          if (event.type === 'done' || event.type === 'error') break;
        }
      } catch (err) {
        sendEvent({ type: 'error', message: (err as Error).message });
      }

      res.end();
    } catch (err) {
      next(err);
    }
  },

  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;

      await projectService.getProject(projectId, userId);

      const conversationId = await aiRepository.findOrCreateConversation(projectId);
      const messages = await aiRepository.getMessages(conversationId);

      // Return only user and assistant messages (not internal tool messages)
      const visible = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
        }));

      res.json({ success: true, data: { messages: visible } });
    } catch (err) {
      next(err);
    }
  },

  async clearHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;

      await projectService.getProject(projectId, userId);
      await aiRepository.clearConversation(projectId);

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/projects/:id/ai/index
   * Chunks all project files and stores vector embeddings in pgvector.
   * Takes a few seconds for small projects, longer for large ones.
   */
  async indexProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;

      await projectService.getProject(projectId, userId);

      const result = await indexProject(projectId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/projects/:id/ai/index
   * Returns how many chunks are currently indexed for this project.
   */
  async getIndexStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const projectId = req.params.id as string;
      const userId = req.user!.id;

      await projectService.getProject(projectId, userId);

      const count = await embeddingRepository.countByProject(projectId);
      res.json({ success: true, data: { chunksIndexed: count, isIndexed: count > 0 } });
    } catch (err) {
      next(err);
    }
  },
};
