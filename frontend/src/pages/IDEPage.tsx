import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { projectService } from '../services/projectService';
import { fileService } from '../services/fileService';
import type { Project, ProjectFile } from '../types';
import FileExplorer from '../features/ide/FileExplorer';
import EditorTabs, { type OpenTab } from '../features/ide/EditorTabs';
import CodeEditor from '../features/ide/CodeEditor';
import StatusBar from '../features/ide/StatusBar';
import NewFileDialog from '../features/ide/dialogs/NewFileDialog';
import RenameDialog from '../features/ide/dialogs/RenameDialog';
import DeleteConfirmDialog from '../features/ide/dialogs/DeleteConfirmDialog';

/**
 * IDEPage — the Cloud IDE.
 *
 * State model:
 *
 * files[]       — all project files from the database (source of truth)
 * openTabs[]    — files currently open in the editor (subset of files)
 * activeFileId  — which tab is focused
 *
 * Each tab holds editedContent (current editor state) and isDirty
 * (whether editedContent differs from the last saved content).
 *
 * On save: PUT /api/files/:id with editedContent → update files[] → isDirty = false
 *
 * Layout (3-panel):
 * ┌──────────────┬──────────────────────────┬────────────────┐
 * │ File Explorer│ Monaco Editor            │ Right panel    │
 * │  (240px)     │ (flex-1)                 │ (AI — Phase 6) │
 * └──────────────┴──────────────────────────┴────────────────┘
 * │ Status bar                                                │
 * └───────────────────────────────────────────────────────────┘
 */

type Dialog =
  | { type: 'newFile'; parentPath?: string }
  | { type: 'newFolder'; parentPath?: string }
  | { type: 'rename'; file: ProjectFile }
  | { type: 'delete'; file: ProjectFile }
  | null;

export default function IDEPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [actionError, setActionError] = useState('');

  // Ref so Monaco's Ctrl+S keybinding always calls the latest save — avoids
  // stale closure capturing old openTabs/activeFileId state
  const saveRef = useRef<() => void>(() => {});

  // ── Tab management ──────────────────────────────────────────────────────────

  const openTab = useCallback((file: ProjectFile) => {
    setOpenTabs((prev) => {
      const exists = prev.find((t) => t.file.id === file.id);
      if (exists) return prev;
      return [...prev, { file, isDirty: false, editedContent: file.content }];
    });
    setActiveFileId(file.id);
  }, []);

  // ── Load project + files ────────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return;

    Promise.all([
      projectService.getProject(projectId),
      fileService.getFiles(projectId),
    ])
      .then(([proj, fileList]) => {
        setProject(proj);
        setFiles(fileList);
        // Auto-open the first non-directory file
        const firstFile = fileList.find((f) => !f.isDirectory);
        if (firstFile) openTab(firstFile);
      })
      .catch((err: Error) => {
        if (err.message === 'Project not found') navigate('/dashboard');
        else setLoadError(err.message);
      });
  }, [projectId, openTab, navigate]);

  function closeTab(fileId: string) {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.file.id === fileId);
      const next = prev.filter((t) => t.file.id !== fileId);

      if (fileId === activeFileId) {
        // Activate the adjacent tab
        const nextActive = next[Math.min(idx, next.length - 1)];
        setActiveFileId(nextActive?.file.id ?? null);
      }

      return next;
    });
  }

  function handleEditorChange(content: string) {
    setOpenTabs((prev) =>
      prev.map((t) =>
        t.file.id === activeFileId
          ? { ...t, editedContent: content, isDirty: content !== t.file.content }
          : t
      )
    );
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const tab = openTabs.find((t) => t.file.id === activeFileId);
    if (!tab || !tab.isDirty) return;

    setSaving(true);
    try {
      const updated = await fileService.updateContent(tab.file.id, tab.editedContent);

      // Update both files[] and the open tab
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.file.id === updated.id
            ? { ...t, file: updated, isDirty: false, editedContent: updated.content }
            : t
        )
      );
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [openTabs, activeFileId]);

  // Keep the ref in sync so Monaco's keybinding always calls the latest version
  useEffect(() => { saveRef.current = handleSave; }, [handleSave]);

  // ── File operations ─────────────────────────────────────────────────────────

  async function handleCreateFile(fullPath: string, isDirectory = false) {
    if (!projectId) return;
    setDialog(null);
    setActionError('');
    try {
      const file = await fileService.createFile(projectId, { path: fullPath, isDirectory });
      setFiles((prev) => [...prev, file]);
      if (!isDirectory) openTab(file);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  async function handleRename(file: ProjectFile, newPath: string) {
    setDialog(null);
    setActionError('');
    try {
      const updated = await fileService.renameFile(file.id, newPath);
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      // Update the open tab if it's open
      setOpenTabs((prev) =>
        prev.map((t) => (t.file.id === updated.id ? { ...t, file: updated } : t))
      );
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  async function handleDelete(file: ProjectFile) {
    setDialog(null);
    setActionError('');
    try {
      await fileService.deleteFile(file.id);
      // Remove deleted file (and children) from state
      setFiles((prev) =>
        prev.filter((f) => f.id !== file.id && !f.path.startsWith(file.path + '/'))
      );
      // Close any open tabs for deleted files
      setOpenTabs((prev) => {
        const remaining = prev.filter(
          (t) => t.file.id !== file.id && !t.file.path.startsWith(file.path + '/')
        );
        if (!remaining.find((t) => t.file.id === activeFileId)) {
          setActiveFileId(remaining[remaining.length - 1]?.file.id ?? null);
        }
        return remaining;
      });
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const activeTab = openTabs.find((t) => t.file.id === activeFileId) ?? null;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-red-400">{loadError}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white overflow-hidden">
      {/* ── Top toolbar ──────────────────────────────────────────────────────── */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-gray-800 flex-shrink-0 bg-gray-900">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="text-gray-500 hover:text-white text-xs transition-colors"
          >
            ← Dashboard
          </Link>
          <span className="text-gray-700">|</span>
          <span className="text-sm font-medium text-white">{project.name}</span>
          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
            {project.language}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={!activeTab?.isDirty || saving}
            className="text-xs px-3 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {/* Phase 4: Run button goes here */}
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="bg-red-950 border-b border-red-800 text-red-300 text-xs px-4 py-2 flex items-center justify-between flex-shrink-0">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-200 ml-4">✕</button>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Explorer — 240px fixed */}
        <div className="w-60 flex-shrink-0 border-r border-gray-800 overflow-hidden">
          <FileExplorer
            files={files}
            activeFileId={activeFileId}
            onFileSelect={openTab}
            onCreateFile={(parentPath) => setDialog({ type: 'newFile', parentPath })}
            onCreateFolder={(parentPath) => setDialog({ type: 'newFolder', parentPath })}
            onDeleteFile={(file) => setDialog({ type: 'delete', file })}
            onRenameFile={(file) => setDialog({ type: 'rename', file })}
          />
        </div>

        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <EditorTabs
            tabs={openTabs}
            activeFileId={activeFileId}
            onTabSelect={setActiveFileId}
            onTabClose={closeTab}
          />

          {/* Monaco */}
          <div className="flex-1 overflow-hidden">
            <CodeEditor
              activeTab={activeTab}
              onChange={handleEditorChange}
              onSaveRef={saveRef}
            />
          </div>
        </div>

        {/* Right panel — placeholder for AI (Phase 6) */}
        <div className="w-72 flex-shrink-0 border-l border-gray-800 flex flex-col bg-gray-900">
          <div className="px-3 py-2 border-b border-gray-800">
            <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
              AI Agent
            </span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-gray-600 text-center px-4">
              AI coding agent coming in Phase 6
            </p>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar activeTab={activeTab} saving={saving} />

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}
      {dialog?.type === 'newFile' && (
        <NewFileDialog
          parentPath={dialog.parentPath}
          isFolder={false}
          onConfirm={(path) => handleCreateFile(path, false)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'newFolder' && (
        <NewFileDialog
          parentPath={dialog.parentPath}
          isFolder={true}
          onConfirm={(path) => handleCreateFile(path, true)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'rename' && (
        <RenameDialog
          file={dialog.file}
          onConfirm={(newPath) => handleRename(dialog.file, newPath)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteConfirmDialog
          file={dialog.file}
          onConfirm={() => handleDelete(dialog.file)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
