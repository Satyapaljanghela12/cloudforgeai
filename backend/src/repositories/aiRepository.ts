import { query, queryOne } from '../db/query';
import type OpenAI from 'openai';

/**
 * AI repository — persistence for conversations and messages.
 *
 * Why persist conversations?
 * Without persistence, every page refresh loses the entire chat history.
 * Storing messages lets the user come back to a project and see what
 * the AI did last time — and lets the AI be given prior context.
 *
 * Schema:
 * - ai_conversations: one per project (we keep it simple — one active
 *   conversation per project rather than multiple named threads)
 * - ai_messages: individual turns — user, assistant, and tool result messages
 *
 * The tool_calls column stores the raw OpenAI tool_calls array as JSONB
 * so we can reconstruct the full message history to send back to the API.
 */

export interface ConversationRow {
  id: string;
  project_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls: OpenAI.Chat.ChatCompletionMessageToolCall[] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  created_at: Date;
}

export const aiRepository = {
  async findOrCreateConversation(projectId: string): Promise<string> {
    const existing = await queryOne<ConversationRow>(
      'SELECT * FROM ai_conversations WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
      [projectId]
    );
    if (existing) return existing.id;

    const created = await queryOne<ConversationRow>(
      'INSERT INTO ai_conversations (project_id) VALUES ($1) RETURNING *',
      [projectId]
    );
    return created!.id;
  },

  async getMessages(conversationId: string): Promise<MessageRow[]> {
    const result = await query<MessageRow>(
      'SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );
    return result.rows;
  },

  async addMessage(
    conversationId: string,
    msg: {
      role: 'user' | 'assistant' | 'tool';
      content: string;
      toolCalls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
      toolCallId?: string;
      toolName?: string;
    }
  ): Promise<void> {
    await query(
      `INSERT INTO ai_messages
         (conversation_id, role, content, tool_calls, tool_call_id, tool_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        conversationId,
        msg.role,
        msg.content,
        msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        msg.toolCallId ?? null,
        msg.toolName ?? null,
      ]
    );
  },

  async clearConversation(projectId: string): Promise<void> {
    await query(
      `DELETE FROM ai_conversations WHERE project_id = $1`,
      [projectId]
    );
  },
};
