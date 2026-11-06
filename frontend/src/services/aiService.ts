import type { AgentEvent } from '../types/ai';

/**
 * AI service — SSE client for the agent stream.
 *
 * Why fetch() instead of EventSource?
 * EventSource is the native SSE browser API, but it only supports GET
 * requests. Our chat endpoint is POST (to send the message in the body).
 * fetch() with a streaming body reader gives us the same SSE behaviour
 * over POST.
 *
 * Why not WebSocket for AI?
 * The AI chat is one-directional: user sends a message, server streams
 * the response. There's no need for the bidirectional channel that
 * WebSocket provides. SSE is simpler and has better backpressure handling.
 */

export async function* streamChat(
  projectId: string,
  message: string
): AsyncGenerator<AgentEvent> {
  const response = await fetch(`/api/projects/${projectId}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    credentials: 'include',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    yield { type: 'error', message: (err as { error: string }).error };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', message: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE lines are separated by \n\n
    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const dataLine = line.trim();
      if (!dataLine.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(dataLine.slice(6)) as AgentEvent;
        yield event;
        if (event.type === 'done' || event.type === 'error') return;
      } catch {
        // skip malformed lines
      }
    }
  }
}

export async function loadHistory(projectId: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/projects/${projectId}/ai/chat`, {
    credentials: 'include',
  });
  if (!res.ok) return [];
  const data = await res.json() as { success: boolean; data: { messages: ChatMessage[] } };
  return data.data.messages;
}

export async function clearHistory(projectId: string): Promise<void> {
  await fetch(`/api/projects/${projectId}/ai/chat`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

export async function indexProject(projectId: string): Promise<{
  filesIndexed: number;
  chunksIndexed: number;
}> {
  const res = await fetch(`/api/projects/${projectId}/ai/index`, {
    method: 'POST',
    credentials: 'include',
  });
  const data = await res.json() as { success: boolean; data: { filesIndexed: number; chunksIndexed: number } };
  return data.data;
}

export async function getIndexStatus(projectId: string): Promise<{
  isIndexed: boolean;
  chunksIndexed: number;
}> {
  const res = await fetch(`/api/projects/${projectId}/ai/index`, {
    credentials: 'include',
  });
  const data = await res.json() as { success: boolean; data: { isIndexed: boolean; chunksIndexed: number } };
  return data.data;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}
