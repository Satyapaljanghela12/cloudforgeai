import type OpenAI from 'openai';

/**
 * AI tool definitions — what the agent can do.
 *
 * Why tool calling instead of just prompting?
 * A plain chat prompt can only produce text. Tool calling gives the AI
 * a structured way to take real actions: read a file, write code,
 * create a new file. The AI decides WHEN and HOW to use each tool;
 * the backend decides WHETHER to allow it and executes it safely.
 *
 * This is the key security boundary:
 * - The AI requests an action (e.g. write_file)
 * - The backend validates it (path traversal check, ownership check)
 * - Only then does the action execute
 *
 * The AI never touches the filesystem, database, or Docker directly.
 *
 * Tool design principles:
 * - Names are verb_noun (read_file, write_file) — clear intent
 * - Parameters are minimal — only what's needed
 * - Descriptions tell the model WHEN to use each tool, not just WHAT it does
 *
 * Interview point: This is the Function Calling / Tool Use pattern.
 * OpenAI, Anthropic, and Google all support it. The model outputs a
 * structured JSON object with the tool name and arguments; your code
 * executes the function and returns the result. The model then uses
 * the result to continue its reasoning.
 */

export const AI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the content of a file in the project. Use this to understand existing code before modifying it.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path relative to the project root. e.g. "src/index.ts"',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Write content to a file. Creates the file if it does not exist, overwrites if it does. Use this to create or update code.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path relative to the project root.',
          },
          content: {
            type: 'string',
            description: 'The complete file content to write.',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        'List all files in the project. Use this to understand the project structure before reading or writing files.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file from the project. Use with caution — this cannot be undone.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The file path relative to the project root.',
          },
        },
        required: ['path'],
      },
    },
  },
];

// Type-safe tool name union
export type ToolName = 'read_file' | 'write_file' | 'list_files' | 'delete_file';
