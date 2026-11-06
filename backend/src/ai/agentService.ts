import OpenAI from 'openai';
import { config } from '../config/env';
import { AI_TOOLS, type ToolName } from './tools';
import { executeTool, type ToolContext } from './toolExecutor';
import { aiRepository } from '../repositories/aiRepository';
import { fileRepository } from '../repositories/fileRepository';
import { searchCodebase } from './embeddingService';
import { logger } from '../utils/logger';

/**
 * AI agent service — the core agent loop.
 *
 * What is an agent loop?
 * A single LLM call can produce either:
 *   A) A final text response  → done
 *   B) One or more tool calls → execute them, feed results back, call again
 *
 * The loop repeats until the model produces a final text response
 * or we hit the MAX_TOOL_CALLS safety limit.
 *
 * Why streaming?
 * Without streaming, the user sees nothing until the entire response
 * is ready — which can take 10-30 seconds for complex tasks. Streaming
 * sends each token as it's generated, so the UI feels responsive.
 *
 * SSE (Server-Sent Events) transport:
 * The HTTP response stays open. We write `data: {...}\n\n` lines as
 * events arrive. The frontend reads these via EventSource.
 * SSE is simpler than WebSocket for one-directional streaming.
 *
 * Event types sent to the client:
 *   { type: 'token',     content: string }     — streaming text token
 *   { type: 'tool_call', name: string }         — AI is calling a tool
 *   { type: 'tool_result', name, result }        — tool finished
 *   { type: 'done',      content: string }      — full final response
 *   { type: 'error',     message: string }      — something went wrong
 *
 * System prompt strategy:
 * The system prompt tells the model what it is, what project it's
 * working on, and what tools it has. We inject the file list so
 * the model knows what exists without having to call list_files first.
 *
 * Interview point: Context window management becomes critical at scale.
 * A long conversation will eventually exceed the model's context limit.
 * Strategies: summarisation, sliding window, RAG retrieval.
 * We keep it simple here — full history up to the context limit.
 */

const MAX_TOOL_CALLS = 10; // Per user turn — prevents infinite loops

export type AgentEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call'; name: string; args: Record<string, string> }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'done'; content: string }
  | { type: 'error'; message: string };

export async function* runAgent(
  userMessage: string,
  projectId: string,
  ctx: ToolContext
): AsyncGenerator<AgentEvent> {
  // Guard: no API key
  if (!config.openaiApiKey) {
    yield { type: 'error', message: 'OpenAI API key is not configured. Add OPENAI_API_KEY to backend/.env' };
    return;
  }

  const openai = new OpenAI({
    apiKey: config.openaiApiKey,
    baseURL: config.openaiBaseUrl,
    // OpenRouter requires these headers to identify your app
    defaultHeaders: {
      'HTTP-Referer': 'https://cloudforge.ai',
      'X-Title': 'CloudForge AI',
    },
  });

  // ── Load conversation history ─────────────────────────────────────────────
  const conversationId = await aiRepository.findOrCreateConversation(projectId);
  const history = await aiRepository.getMessages(conversationId);

  // ── Build system prompt ───────────────────────────────────────────────────
  const files = await fileRepository.findAllByProject(projectId);
  const fileList = files
    .filter((f) => !f.isDirectory)
    .map((f) => f.path)
    .sort()
    .join('\n');

  // Semantic search — find relevant code chunks for this user message
  const ragContext = await searchCodebase(projectId, userMessage, 5);

  const systemPrompt = `You are CloudForge AI, an expert coding assistant embedded in a cloud IDE.

You are helping the user work on their project. You can read files, write code, create new files, and delete files using your tools.

Current project files:
${fileList || '(no files yet)'}
${ragContext ? `\nRelevant code from the codebase (retrieved via semantic search):\n\n${ragContext}\n` : ''}
Guidelines:
- Always read a file before modifying it so you understand the existing code
- When writing files, write the complete file content — never partial content
- Explain what you're doing and why, especially architectural decisions
- If you encounter an error in a tool result, diagnose it and try to fix it
- Keep responses focused and practical
- Never expose secrets or environment variables in code you write`;

  // ── Reconstruct message history for OpenAI ────────────────────────────────
  type OAIMessage = OpenAI.Chat.ChatCompletionMessageParam;

  const messages: OAIMessage[] = history.map((m) => {
    if (m.role === 'tool') {
      return {
        role: 'tool' as const,
        content: m.content,
        tool_call_id: m.tool_call_id!,
      };
    }
    if (m.role === 'assistant' && m.tool_calls) {
      return {
        role: 'assistant' as const,
        content: m.content || null,
        tool_calls: m.tool_calls,
      };
    }
    return {
      role: m.role as 'user' | 'assistant',
      content: m.content,
    };
  });

  // Add the new user message
  messages.push({ role: 'user', content: userMessage });
  await aiRepository.addMessage(conversationId, { role: 'user', content: userMessage });

  // ── Agent loop ────────────────────────────────────────────────────────────
  let toolCallCount = 0;
  let finalContent = '';

  while (true) {
    // Call the model with streaming
    const stream = await openai.chat.completions.create({
      model: config.openaiModel,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: AI_TOOLS,
      tool_choice: 'auto',
      stream: true,
      temperature: 0.3, // Lower = more deterministic code output
    });

    // Accumulate the streamed response
    let assistantContent = '';
    const toolCallAccumulator: Map<number, {
      id: string;
      name: string;
      args: string;
    }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Stream text tokens
      if (delta.content) {
        assistantContent += delta.content;
        finalContent += delta.content;
        yield { type: 'token', content: delta.content };
      }

      // Accumulate tool call chunks (OpenAI streams these in pieces)
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallAccumulator.has(idx)) {
            toolCallAccumulator.set(idx, { id: '', name: '', args: '' });
          }
          const acc = toolCallAccumulator.get(idx)!;
          if (tc.id) acc.id += tc.id;
          if (tc.function?.name) acc.name += tc.function.name;
          if (tc.function?.arguments) acc.args += tc.function.arguments;
        }
      }
    }

    // ── Process tool calls ──────────────────────────────────────────────────
    if (toolCallAccumulator.size === 0) {
      // No tool calls → this is the final response
      await aiRepository.addMessage(conversationId, {
        role: 'assistant',
        content: assistantContent,
      });
      yield { type: 'done', content: finalContent };
      return;
    }

    // Build the assistant message with tool calls
    const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = Array.from(
      toolCallAccumulator.values()
    ).map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.name, arguments: tc.args },
    }));

    // Save assistant message with tool calls
    await aiRepository.addMessage(conversationId, {
      role: 'assistant',
      content: assistantContent,
      toolCalls,
    });

    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      tool_calls: toolCalls,
    });

    // Check tool call limit
    toolCallCount += toolCalls.length;
    if (toolCallCount > MAX_TOOL_CALLS) {
      yield { type: 'error', message: 'Tool call limit reached. Please ask a more focused question.' };
      return;
    }

    // ── Execute each tool call ──────────────────────────────────────────────
    for (const tc of toolCalls) {
      if (tc.type !== 'function') continue;
      const toolName = tc.function.name as ToolName;
      let args: Record<string, string> = {};
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, string>;
      } catch {
        args = {};
      }

      yield { type: 'tool_call', name: toolName, args };

      const result = await executeTool(toolName, args, ctx);

      yield { type: 'tool_result', name: toolName, result };

      // Save tool result
      await aiRepository.addMessage(conversationId, {
        role: 'tool',
        content: result,
        toolCallId: tc.id,
        toolName,
      });

      // Add to messages for next loop iteration
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
      });
    }

    // Continue the loop — model will process tool results and respond
    logger.info('Agent continuing after tool calls', { toolCallCount });
  }
}
