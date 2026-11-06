import { useState, useEffect, useRef, useCallback } from 'react';
import type { FormEvent } from 'react';
import { streamChat, loadHistory, clearHistory, indexProject, getIndexStatus } from '../../services/aiService';
import type { ChatMessage } from '../../types/ai';
import type { ProjectFile } from '../../types';

interface Props {
  projectId: string;
  /** Currently active file — sent as context hint in the UI */
  activeFile: ProjectFile | null;
  /** Called when the AI writes/creates a file — refreshes the file tree */
  onFilesChanged: () => void;
}

/**
 * AIPanel — the right-hand AI coding agent panel.
 *
 * Architecture:
 * - Chat messages are local React state
 * - Sending a message opens an SSE stream from the backend
 * - Tokens arrive via the stream and are appended to the streaming message
 * - Tool calls show inline in the chat as collapsible indicators
 * - When a write_file/create_file/delete_file tool completes, onFilesChanged()
 *   is called so the file explorer and open tabs refresh automatically
 *
 * Message types rendered:
 * - user:      right-aligned, indigo bubble
 * - assistant: left-aligned, streaming text with blinking cursor
 * - tool:      collapsed pill showing what the AI did (expandable)
 */

const FILE_MUTATING_TOOLS = new Set(['write_file', 'delete_file']);

export default function AIPanel({ projectId, activeFile, onFilesChanged }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [indexStatus, setIndexStatus] = useState<{ isIndexed: boolean; chunksIndexed: number } | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<boolean>(false);

  // Load history + index status on mount
  useEffect(() => {
    loadHistory(projectId).then((history) => {
      setMessages(
        history.map((m, i) => ({
          id: `history-${i}`,
          role: m.role,
          content: m.content,
        }))
      );
    });
    getIndexStatus(projectId).then(setIndexStatus).catch(() => {});
  }, [projectId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');
    setError('');
    setIsStreaming(true);
    abortRef.current = false;

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text },
      { id: assistantMsgId, role: 'assistant', content: '', streaming: true, toolCalls: [] },
    ]);

    try {
      for await (const event of streamChat(projectId, text)) {
        if (abortRef.current) break;

        if (event.type === 'token') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + event.content }
                : m
            )
          );
        }

        if (event.type === 'tool_call') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    toolCalls: [
                      ...(m.toolCalls ?? []),
                      { name: event.name, args: event.args },
                    ],
                  }
                : m
            )
          );
        }

        if (event.type === 'tool_result') {
          // Attach result to the last tool call of this name
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantMsgId) return m;
              const calls = [...(m.toolCalls ?? [])];
              // Find the last call with this name that has no result yet
              for (let i = calls.length - 1; i >= 0; i--) {
                if (calls[i].name === event.name && !calls[i].result) {
                  calls[i] = { ...calls[i], result: event.result };
                  break;
                }
              }
              return { ...m, toolCalls: calls };
            })
          );

          // If the AI mutated files, refresh the tree
          if (FILE_MUTATING_TOOLS.has(event.name)) {
            onFilesChanged();
          }
        }

        if (event.type === 'done') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: event.content, streaming: false }
                : m
            )
          );
          break;
        }

        if (event.type === 'error') {
          setError(event.message);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: event.message, streaming: false }
                : m
            )
          );
          break;
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: 'Something went wrong. Please try again.', streaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, projectId, onFilesChanged]);

  async function handleIndex() {
    setIsIndexing(true);
    setError('');
    try {
      const result = await indexProject(projectId);
      setIndexStatus({ isIndexed: result.chunksIndexed > 0, chunksIndexed: result.chunksIndexed });
    } catch (err) {
      setError(`Indexing failed: ${(err as Error).message}`);
    } finally {
      setIsIndexing(false);
    }
  }

  // Submit on Enter (Shift+Enter for newline)
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  async function handleClear() {
    await clearHistory(projectId);
    setMessages([]);
    setError('');
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
            AI Agent
          </span>
          {isStreaming && (
            <span className="flex gap-0.5">
              <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* RAG index button */}
          <button
            onClick={handleIndex}
            disabled={isIndexing || isStreaming}
            title={indexStatus?.isIndexed
              ? `Re-index codebase (${indexStatus.chunksIndexed} chunks indexed)`
              : 'Index codebase for semantic search'}
            className={`text-xs px-2 py-0.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 ${
              indexStatus?.isIndexed
                ? 'text-green-500 hover:text-green-300 bg-green-950 border border-green-900'
                : 'text-gray-500 hover:text-gray-300 bg-gray-800 border border-gray-700'
            }`}
          >
            {isIndexing ? (
              <>
                <span className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />
                Indexing…
              </>
            ) : (
              <>
                <span>{indexStatus?.isIndexed ? '✦' : '⊕'}</span>
                {indexStatus?.isIndexed ? `${indexStatus.chunksIndexed} chunks` : 'Index'}
              </>
            )}
          </button>
          <button
            onClick={handleClear}
            disabled={isStreaming || messages.length === 0}
            className="text-xs text-gray-600 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Clear conversation"
          >
            Clear
          </button>
        </div>
      </div>

      {/* ── Active file context hint ────────────────────────────────────────── */}
      {activeFile && (
        <div className="px-3 py-1.5 bg-gray-950 border-b border-gray-800 flex-shrink-0">
          <span className="text-xs text-gray-600">
            Context: <span className="text-gray-400 font-mono">{activeFile.path}</span>
          </span>
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
            <AISparkleIcon />
            <p className="text-xs text-gray-500">
              Ask me to create code, fix bugs, explain files, or refactor anything in your project.
            </p>
            <div className="space-y-1 w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="w-full text-left text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 px-2 py-1.5 rounded transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {error && (
          <div className="text-xs text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ───────────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-800 p-3 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder={isStreaming ? 'AI is working…' : 'Ask AI anything… (Enter to send)'}
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none transition-colors disabled:opacity-50"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-700">Shift+Enter for newline</span>
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded transition-colors font-medium"
            >
              {isStreaming ? 'Working…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-indigo-700 rounded-lg px-3 py-2 text-xs text-white whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Tool call indicators */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="space-y-1">
          {message.toolCalls.map((tc, i) => (
            <div key={i} className="text-xs">
              <button
                onClick={() => setExpanded((prev) => {
                  const next = new Set(prev);
                  next.has(i) ? next.delete(i) : next.add(i);
                  return next;
                })}
                className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ToolIcon name={tc.name} />
                <span className="font-mono">{tc.name}</span>
                {tc.args.path && (
                  <span className="text-gray-600">{tc.args.path}</span>
                )}
                {tc.result ? (
                  <span className="text-green-600">✓</span>
                ) : (
                  <span className="text-yellow-600 animate-pulse">…</span>
                )}
              </button>
              {expanded.has(i) && tc.result && (
                <div className="mt-1 ml-5 bg-gray-950 border border-gray-800 rounded px-2 py-1.5 font-mono text-gray-400 text-xs max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {tc.result.length > 500 ? tc.result.slice(0, 500) + '…' : tc.result}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assistant text */}
      {(message.content || message.streaming) && (
        <div className="text-xs text-gray-200 whitespace-pre-wrap leading-relaxed">
          {message.content}
          {message.streaming && (
            <span className="inline-block w-1.5 h-3 bg-indigo-400 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'List all files and explain the project structure',
  'Fix any bugs you can find in my code',
  'Add error handling to the main file',
  'Explain what this code does',
];

function ToolIcon({ name }: { name: string }) {
  if (name === 'read_file') return <span>📖</span>;
  if (name === 'write_file') return <span>✏️</span>;
  if (name === 'create_file') return <span>📄</span>;
  if (name === 'delete_file') return <span>🗑️</span>;
  if (name === 'list_files') return <span>📁</span>;
  return <span>⚙️</span>;
}

function AISparkleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-indigo-500">
      <path d="M12 2L9.5 9.5L2 12L9.5 14.5L12 22L14.5 14.5L22 12L14.5 9.5L12 2Z"
        fill="currentColor" opacity="0.8" />
    </svg>
  );
}
