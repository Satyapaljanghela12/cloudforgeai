import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useRef } from 'react';
import { getMonacoLanguage } from '../../utils/language';
import type { OpenTab } from './EditorTabs';

interface Props {
  activeTab: OpenTab | null;
  onChange: (content: string) => void;
  onSaveRef: React.MutableRefObject<() => void>;
}

/**
 * CodeEditor — Monaco editor panel.
 *
 * Why @monaco-editor/react over raw monaco-editor?
 * The raw package requires manual Webpack/Vite worker config for full
 * language support. The React wrapper handles worker setup automatically
 * and provides a clean component API.
 *
 * Editor options are matched to VS Code dark theme defaults.
 *
 * Save shortcut:
 * We intercept Ctrl+S / Cmd+S inside the editor and call onSaveRef.current().
 * Using a ref instead of a callback prop means Monaco's keybinding never
 * captures a stale closure — it always calls the latest save function.
 *
 * Why not use Monaco's built-in save?
 * Monaco is just an editor component — it has no concept of "saving".
 * Our save function makes the API call to persist the content.
 */
export default function CodeEditor({ activeTab, onChange, onSaveRef }: Props) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  function handleEditorMount(ed: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) {
    editorRef.current = ed;

    // Ctrl+S / Cmd+S → always calls the current save via ref
    ed.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => { onSaveRef.current(); }
    );
  }

  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950">
        <div className="text-center space-y-2">
          <p className="text-gray-600 text-sm">No file open</p>
          <p className="text-gray-700 text-xs">
            Select a file from the explorer or create a new one
          </p>
        </div>
      </div>
    );
  }

  const language = getMonacoLanguage(activeTab.file.name);

  return (
    <div className="flex-1 overflow-hidden">
      <Editor
        key={activeTab.file.id} // Remount when switching files to avoid stale state
        height="100%"
        language={language}
        value={activeTab.editedContent}
        theme="vs-dark"
        onChange={(value) => onChange(value ?? '')}
        onMount={handleEditorMount}
        options={{
          fontSize: 14,
          fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
          fontLigatures: true,
          lineNumbers: 'on',
          minimap: { enabled: true, scale: 1 },
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          tabSize: 2,
          insertSpaces: true,
          automaticLayout: true, // Reflows when panel is resized
          padding: { top: 8 },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          renderLineHighlight: 'all',
          bracketPairColorization: { enabled: true },
          formatOnPaste: false,
          formatOnType: false,
        }}
      />
    </div>
  );
}
