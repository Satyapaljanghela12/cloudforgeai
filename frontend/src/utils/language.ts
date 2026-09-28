/**
 * Map file extensions to Monaco language identifiers and display info.
 *
 * Monaco uses its own language IDs (not MIME types) for syntax highlighting.
 * Reference: https://github.com/microsoft/monaco-editor/tree/main/src/basic-languages
 */

interface FileLanguage {
  monacoId: string;  // Monaco language identifier
  label: string;     // Human-readable label
  icon: string;      // Emoji icon for the file explorer
}

const EXT_MAP: Record<string, FileLanguage> = {
  // Web
  ts:   { monacoId: 'typescript',   label: 'TypeScript',   icon: '📄' },
  tsx:  { monacoId: 'typescript',   label: 'TypeScript',   icon: '⚛️' },
  js:   { monacoId: 'javascript',   label: 'JavaScript',   icon: '📄' },
  jsx:  { monacoId: 'javascript',   label: 'JavaScript',   icon: '⚛️' },
  html: { monacoId: 'html',         label: 'HTML',         icon: '🌐' },
  css:  { monacoId: 'css',          label: 'CSS',          icon: '🎨' },
  scss: { monacoId: 'scss',         label: 'SCSS',         icon: '🎨' },
  // Data / config
  json: { monacoId: 'json',         label: 'JSON',         icon: '📋' },
  yaml: { monacoId: 'yaml',         label: 'YAML',         icon: '📋' },
  yml:  { monacoId: 'yaml',         label: 'YAML',         icon: '📋' },
  toml: { monacoId: 'ini',          label: 'TOML',         icon: '📋' },
  // Backend
  py:   { monacoId: 'python',       label: 'Python',       icon: '🐍' },
  go:   { monacoId: 'go',           label: 'Go',           icon: '📄' },
  rs:   { monacoId: 'rust',         label: 'Rust',         icon: '📄' },
  java: { monacoId: 'java',         label: 'Java',         icon: '☕' },
  // Docs
  md:   { monacoId: 'markdown',     label: 'Markdown',     icon: '📝' },
  txt:  { monacoId: 'plaintext',    label: 'Text',         icon: '📄' },
  sh:   { monacoId: 'shell',        label: 'Shell',        icon: '💻' },
  // Misc
  env:  { monacoId: 'plaintext',    label: 'Env',          icon: '🔑' },
  lock: { monacoId: 'plaintext',    label: 'Lock',         icon: '🔒' },
};

const DEFAULT_LANGUAGE: FileLanguage = { monacoId: 'plaintext', label: 'Text', icon: '📄' };

export function getFileLanguage(filename: string): FileLanguage {
  const parts = filename.split('.');
  if (parts.length < 2) return DEFAULT_LANGUAGE;
  const ext = parts[parts.length - 1].toLowerCase();
  return EXT_MAP[ext] ?? DEFAULT_LANGUAGE;
}

export function getMonacoLanguage(filename: string): string {
  return getFileLanguage(filename).monacoId;
}

export function getFileIcon(filename: string, isDirectory: boolean): string {
  if (isDirectory) return '📁';
  return getFileLanguage(filename).icon;
}
