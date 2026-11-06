/**
 * Runtime configuration abstraction.
 *
 * Why this exists:
 * Without this, language-specific logic (which Docker image to use,
 * what command to run, which file is the entrypoint) would be scattered
 * across the codebase. Adding a new language would require touching
 * multiple files.
 *
 * With this abstraction, adding Go support means adding one entry here.
 * Everything else — the executor, the API — works without changes.
 *
 * Interview point:
 * This is the Strategy pattern. The execution engine is generic;
 * the runtime config provides the language-specific strategy.
 *
 * Docker images chosen:
 * - node:22-alpine  — small Alpine-based image, fast to pull
 * - python:3.12-alpine — same reasoning
 * These are pulled once and cached by Docker locally.
 */

export interface Runtime {
  language: string;
  dockerImage: string;   // Docker image to run the container from
  runCommand: string[];  // Command to execute inside the container
  fileExtension: string; // Used to find the entry file if not specified
  entryFile: string;     // Default file to run if none specified
}

export const RUNTIMES: Record<string, Runtime> = {
  javascript: {
    language: 'javascript',
    dockerImage: 'node:22-alpine',
    runCommand: ['node', 'index.js'],
    fileExtension: '.js',
    entryFile: 'index.js',
  },
  typescript: {
    language: 'typescript',
    dockerImage: 'node:22-alpine',
    // npx tsx runs TypeScript directly without a separate compile step
    runCommand: ['npx', '--yes', 'tsx', 'index.ts'],
    fileExtension: '.ts',
    entryFile: 'index.ts',
  },
  python: {
    language: 'python',
    dockerImage: 'python:3.12-alpine',
    runCommand: ['python', 'main.py'],
    fileExtension: '.py',
    entryFile: 'main.py',
  },
  html: {
    language: 'html',
    // HTML is served via a minimal static server
    dockerImage: 'node:22-alpine',
    runCommand: ['npx', '--yes', 'serve', '-s', '.', '-l', '3000'],
    fileExtension: '.html',
    entryFile: 'index.html',
  },
};

export function getRuntime(language: string): Runtime | null {
  return RUNTIMES[language] ?? null;
}
