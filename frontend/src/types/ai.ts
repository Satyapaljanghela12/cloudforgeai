/**
 * AI agent event types — mirror the backend AgentEvent union.
 * These are the SSE events streamed from POST /api/projects/:id/ai/chat.
 */
export type AgentEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; name: string; args: Record<string, string> }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'done'; content: string }
  | { type: 'error'; message: string };

/** A message visible in the chat UI */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Tool calls that happened during this assistant turn */
  toolCalls?: Array<{ name: string; args: Record<string, string>; result?: string }>;
  streaming?: boolean;
}
