import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { projectService } from '../services/projectService';
import { fileService } from '../services/fileService';
import { authService } from '../services/authService';
import { ExecutionClient } from '../services/executionService';
import { ShellClient } from '../services/shellService';
import type { ExecutionStatus } from '../services/executionService';
import type { ShellStatus } from '../services/shellService';
import type { Project, ProjectFile } from '../types';
import FileExplorer from '../features/ide/FileExplorer';
import EditorTabs, { type OpenTab } from '../features/ide/EditorTabs';
import CodeEditor from '../features/ide/CodeEditor';
import Terminal from '../features/ide/Terminal';
import type { TerminalApi } from '../features/ide/Terminal';
import AIPanel from '../features/ide/AIPanel';
import StatusBar from '../features/ide/StatusBar';
import NewFileDialog from '../features/ide/dialogs/NewFileDialog';
import RenameDialog from '../features/ide/dialogs/RenameDialog';
import DeleteConfirmDialog from '../features/ide/dialogs/DeleteConfirmDialog';

type Dialog =
  | { type: 'newFile'; parentPath?: string }
  | { type: 'newFolder'; parentPath?: string }
  | { type: 'rename'; file: ProjectFile }
  | { type: 'delete'; file: ProjectFile }
  | null;

type SidePanel = 'explorer' | null;

export default function IDEPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [actionError, setActionError] = useState('');
  const [sidePanel, setSidePanel] = useState<SidePanel>('explorer');

  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>('idle');
  const [terminalVisible, setTerminalVisible] = useState(true);
  const terminalApiRef = useRef<TerminalApi | null>(null);
  const executionClientRef = useRef<ExecutionClient | null>(null);

  const [shellStatus, setShellStatus] = useState<ShellStatus>('disconnected');
  const shellClientRef = useRef<ShellClient | null>(null);
  const shellConnectedRef = useRef(false);

  const saveRef = useRef<() => void>(() => {});

  const openTab = useCallback((file: ProjectFile) => {
    setOpenTabs((prev) => {
      if (prev.find((t) => t.file.id === file.id)) return prev;
      return [...prev, { file, isDirty: false, editedContent: file.content }];
    });
    setActiveFileId(file.id);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    Promise.all([projectService.getProject(projectId), fileService.getFiles(projectId)])
      .then(([proj, fileList]) => {
        setProject(proj);
        setFiles(fileList);
        const firstFile = fileList.find((f) => !f.isDirectory);
        if (firstFile) openTab(firstFile);
      })
      .catch((err: Error) => {
        if (err.message === 'Project not found') navigate('/dashboard');
        else setLoadError(err.message);
      });
  }, [projectId, openTab, navigate]);

  useEffect(() => {
    return () => {
      executionClientRef.current?.close();
      shellClientRef.current?.disconnect();
    };
  }, []);

  const connectShell = useCallback(async () => {
    if (!projectId || shellConnectedRef.current || shellClientRef.current?.isConnected()) return;
    shellConnectedRef.current = true;
    let token: string;
    try { token = await authService.getToken(); }
    catch { shellConnectedRef.current = false; return; }
    const dims = terminalApiRef.current?.getDimensions() ?? { cols: 120, rows: 30 };
    const client = new ShellClient(
      (data) => terminalApiRef.current?.write(data),
      (status) => {
        setShellStatus(status);
        if (status === 'exited' || status === 'error') {
          shellClientRef.current = null;
          shellConnectedRef.current = false;
        }
      }
    );
    shellClientRef.current = client;
    client.connect(projectId, token, dims.cols, dims.rows);
  }, [projectId]);

  function closeTab(fileId: string) {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.file.id === fileId);
      const next = prev.filter((t) => t.file.id !== fileId);
      if (fileId === activeFileId) setActiveFileId(next[Math.min(idx, next.length - 1)]?.file.id ?? null);
      return next;
    });
  }

  function handleEditorChange(content: string) {
    setOpenTabs((prev) =>
      prev.map((t) => t.file.id === activeFileId
        ? { ...t, editedContent: content, isDirty: content !== t.file.content }
        : t)
    );
  }

  const handleSave = useCallback(async () => {
    const tab = openTabs.find((t) => t.file.id === activeFileId);
    if (!tab || !tab.isDirty) return;
    setSaving(true);
    try {
      const updated = await fileService.updateContent(tab.file.id, tab.editedContent);
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setOpenTabs((prev) => prev.map((t) =>
        t.file.id === updated.id ? { ...t, file: updated, isDirty: false, editedContent: updated.content } : t
      ));
    } catch (err) { console.error('Save failed:', err); }
    finally { setSaving(false); }
  }, [openTabs, activeFileId]);

  useEffect(() => { saveRef.current = handleSave; }, [handleSave]);

  const refreshFiles = useCallback(async () => {
    if (!projectId) return;
    try {
      const fileList = await fileService.getFiles(projectId);
      setFiles(fileList);
      setOpenTabs((prev) => prev.map((tab) => {
        const updated = fileList.find((f) => f.id === tab.file.id);
        if (!updated || updated.content === tab.file.content) return tab;
        if (!tab.isDirty) return { ...tab, file: updated, editedContent: updated.content };
        return { ...tab, file: updated };
      }));
    } catch { /* non-fatal */ }
  }, [projectId]);

  const saveAllDirty = useCallback(async () => {
    for (const tab of openTabs.filter((t) => t.isDirty)) {
      try {
        const updated = await fileService.updateContent(tab.file.id, tab.editedContent);
        setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        setOpenTabs((prev) => prev.map((t) =>
          t.file.id === updated.id ? { ...t, file: updated, isDirty: false, editedContent: updated.content } : t
        ));
      } catch { /* non-fatal */ }
    }
  }, [openTabs]);

  const handleRun = useCallback(async () => {
    if (!projectId || executionStatus === 'running') return;
    await saveAllDirty();
    setTerminalVisible(true);
    const term = terminalApiRef.current;
    term?.clear();
    term?.writeln('\x1b[90m$ Running...\x1b[0m\r\n');
    term?.focus();
    let token: string;
    try { token = await authService.getToken(); }
    catch { term?.writeln('\x1b[31mAuth failed\x1b[0m'); return; }
    const dims = term?.getDimensions() ?? { cols: 80, rows: 24 };
    const client = new ExecutionClient(
      (msg) => {
        if (msg.type === 'output') terminalApiRef.current?.write(msg.data);
        else if (msg.type === 'error') terminalApiRef.current?.writeln(`\x1b[31m${msg.message}\x1b[0m`);
      },
      (status) => setExecutionStatus(status)
    );
    executionClientRef.current = client;
    client.run(projectId, token, dims.cols, dims.rows);
  }, [projectId, executionStatus, saveAllDirty]);

  const handleStop = useCallback(() => executionClientRef.current?.stop(), []);

  const handleTerminalData = useCallback((data: string) => {
    if (executionStatus === 'running') executionClientRef.current?.sendInput(data);
    else shellClientRef.current?.sendInput(data);
  }, [executionStatus]);

  const handleTerminalResize = useCallback((cols: number, rows: number) => {
    executionClientRef.current?.sendResize(cols, rows);
    shellClientRef.current?.sendResize(cols, rows);
  }, []);

  async function handleCreateFile(fullPath: string, isDirectory = false) {
    if (!projectId) return;
    setDialog(null); setActionError('');
    try {
      const file = await fileService.createFile(projectId, { path: fullPath, isDirectory });
      setFiles((prev) => [...prev, file]);
      if (!isDirectory) openTab(file);
    } catch (err) { setActionError((err as Error).message); }
  }

  async function handleRename(file: ProjectFile, newPath: string) {
    setDialog(null); setActionError('');
    try {
      const updated = await fileService.renameFile(file.id, newPath);
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setOpenTabs((prev) => prev.map((t) => (t.file.id === updated.id ? { ...t, file: updated } : t)));
    } catch (err) { setActionError((err as Error).message); }
  }

  async function handleDelete(file: ProjectFile) {
    setDialog(null); setActionError('');
    try {
      await fileService.deleteFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id && !f.path.startsWith(file.path + '/')));
      setOpenTabs((prev) => {
        const remaining = prev.filter((t) => t.file.id !== file.id && !t.file.path.startsWith(file.path + '/'));
        if (!remaining.find((t) => t.file.id === activeFileId))
          setActiveFileId(remaining[remaining.length - 1]?.file.id ?? null);
        return remaining;
      });
    } catch (err) { setActionError((err as Error).message); }
  }

  const activeTab = openTabs.find((t) => t.file.id === activeFileId) ?? null;
  const isRunning = executionStatus === 'running';

  if (loadError) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#1e1e1e', color: '#f48771' }}>{loadError}</div>;
  }
  if (!project) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: '#1e1e1e' }}>
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#1e1e1e', color: '#cccccc', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>

      {/* ── Title bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-shrink-0 px-4" style={{ height: 30, background: '#323233', borderBottom: '1px solid #252526' }}>
        <div className="flex items-center gap-4">
          {/* Logo */}
          <span className="text-xs font-bold tracking-wider" style={{ color: '#007acc' }}>
            ⬡ CLOUDFORGE AI
          </span>
          {/* Menu items */}
          {['File', 'Edit', 'Selection', 'View', 'Go', 'Run'].map(m => (
            <span key={m} className="text-xs cursor-pointer px-1 rounded" style={{ color: '#cccccc' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#4f4f4f'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
              {m}
            </span>
          ))}
        </div>

        {/* Center — project name */}
        <span className="text-xs" style={{ color: '#cccccc', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          {project.name}
        </span>

        {/* Right — nav */}
        <Link to="/dashboard" className="text-xs px-2 py-0.5 rounded transition-colors"
          style={{ color: '#cccccc' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#4f4f4f'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
          ← Dashboard
        </Link>
      </div>

      {/* ── Main body ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Activity bar */}
        <div className="flex flex-col items-center py-2 gap-1 flex-shrink-0"
          style={{ width: 48, background: '#333333', borderRight: '1px solid #252526' }}>
          <ActivityIcon
            title="Explorer"
            active={sidePanel === 'explorer'}
            onClick={() => setSidePanel(p => p === 'explorer' ? null : 'explorer')}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.5 0H8L6 2H2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4.5L17.5 0zm-.5 1.4L19.1 4H17V1.4zM2 20V4h4l2-2h8v4h4v14H2z"/>
            </svg>
          </ActivityIcon>

          <ActivityIcon
            title="Search"
            active={false}
            onClick={() => {}}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </ActivityIcon>

          <ActivityIcon
            title="Source Control"
            active={false}
            onClick={() => {}}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 5C7 3.343 8.343 2 10 2s3 1.343 3 3-1.343 3-3 3a2.99 2.99 0 0 1-2.134-.887L5.5 8.48A3.494 3.494 0 0 1 6 10a3.494 3.494 0 0 1-.5 1.52l2.366 1.367A2.99 2.99 0 0 1 10 12c1.657 0 3 1.343 3 3s-1.343 3-3 3-3-1.343-3-3c0-.601.177-1.16.482-1.629L5.116 12.01A3.994 3.994 0 0 1 3 10a3.994 3.994 0 0 1 2.116-3.01L7.482 5.63A2.982 2.982 0 0 1 7 5zm3 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm7-7a4 4 0 0 1-4 4v-2a2 2 0 1 0 0-4v-2a4 4 0 0 1 4 4z"/>
            </svg>
          </ActivityIcon>

          <div className="flex-1" />
        </div>

        {sidePanel === 'explorer' && (
          <div className="flex-shrink-0 overflow-hidden" style={{ width: 250, borderRight: '1px solid #252526' }}>
            <FileExplorer
              projectName={project.name}
              files={files}
              activeFileId={activeFileId}
              onFileSelect={openTab}
              onCreateFile={(parentPath) => setDialog({ type: 'newFile', parentPath })}
              onCreateFolder={(parentPath) => setDialog({ type: 'newFolder', parentPath })}
              onDeleteFile={(file) => setDialog({ type: 'delete', file })}
              onRenameFile={(file) => setDialog({ type: 'rename', file })}
            />
          </div>
        )}

        {/* Editor + Terminal column */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: '#1e1e1e' }}>

          {/* Action error banner */}
          {actionError && (
            <div className="flex items-center justify-between px-4 py-1.5 flex-shrink-0 text-xs"
              style={{ background: '#5a1d1d', borderBottom: '1px solid #be1100', color: '#f48771' }}>
              <span>{actionError}</span>
              <button onClick={() => setActionError('')} style={{ color: '#f48771' }}>✕</button>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between flex-shrink-0 px-3"
            style={{ height: 30, background: '#2d2d2d', borderBottom: '1px solid #252526' }}>
            <div className="flex items-center gap-2">
              {/* Save */}
              <ToolbarBtn
                onClick={handleSave}
                disabled={!activeTab?.isDirty || saving}
                title="Save (Ctrl+S)"
              >
                {saving ? (
                  <span className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.5 1H2.5A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11A1.5 1.5 0 0 0 15 13.5v-9L11.5 1zm0 1l2.5 2.5H11V2h.5zM2.5 14A.5.5 0 0 1 2 13.5v-11A.5.5 0 0 1 2.5 2H10v4h4v7.5a.5.5 0 0 1-.5.5H2.5zM5 10h6v1H5v-1zm0-2h6v1H5V8zm0-2h3v1H5V6z"/>
                  </svg>
                )}
              </ToolbarBtn>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Run / Stop */}
              {!isRunning ? (
                <button onClick={handleRun}
                  className="flex items-center gap-1.5 px-3 text-xs font-medium rounded"
                  style={{ height: 22, background: '#0e7a0d', color: '#ffffff' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#1b9e1a'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#0e7a0d'}>
                  <svg width="9" height="10" viewBox="0 0 9 10" fill="currentColor">
                    <polygon points="0,0 9,5 0,10"/>
                  </svg>
                  Run
                </button>
              ) : (
                <button onClick={handleStop}
                  className="flex items-center gap-1.5 px-3 text-xs font-medium rounded"
                  style={{ height: 22, background: '#c72e0f', color: '#ffffff' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#e0350f'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#c72e0f'}>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor">
                    <rect x="0.5" y="0.5" width="8" height="8" rx="1"/>
                  </svg>
                  Stop
                </button>
              )}

              {/* Terminal toggle */}
              <ToolbarBtn
                onClick={() => setTerminalVisible(v => !v)}
                title="Toggle Terminal"
                active={terminalVisible}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                  <rect x="1" y="2" width="14" height="12" rx="1" fill="none"/>
                  <path d="M4 6l3 2.5L4 11m5 0h4"/>
                </svg>
              </ToolbarBtn>
            </div>
          </div>

          {/* Editor tabs + breadcrumb */}
          <EditorTabs
            tabs={openTabs}
            activeFileId={activeFileId}
            onTabSelect={setActiveFileId}
            onTabClose={closeTab}
          />

          {/* Monaco editor */}
          <div className={`overflow-hidden ${terminalVisible ? 'flex-[3]' : 'flex-1'} min-h-0`}>
            <CodeEditor activeTab={activeTab} onChange={handleEditorChange} onSaveRef={saveRef} />
          </div>

          {/* Terminal panel */}
          <div
            className="flex flex-col overflow-hidden flex-shrink-0 transition-all"
            style={{
              height: terminalVisible ? undefined : 0,
              flex: terminalVisible ? '0 0 220px' : undefined,
              minHeight: terminalVisible ? 140 : 0,
              maxHeight: terminalVisible ? '45vh' : 0,
              borderTop: terminalVisible ? '1px solid #252526' : 'none',
            }}
          >
            {/* Terminal header */}
            <div className="flex items-center flex-shrink-0 px-3"
              style={{ height: 30, background: '#252526', borderBottom: '1px solid #1e1e1e' }}>
              {/* Tabs row */}
              <div className="flex items-center gap-0 flex-1">
                <TerminalTab active>TERMINAL</TerminalTab>
                <TerminalTab>OUTPUT</TerminalTab>
                <TerminalTab>DEBUG CONSOLE</TerminalTab>
                <TerminalTab>PROBLEMS</TerminalTab>
              </div>

              {/* Status + actions */}
              <div className="flex items-center gap-2 ml-2">
                {isRunning && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: '#89d185' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
                    Running
                  </span>
                )}
                {!isRunning && shellStatus === 'ready' && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: '#75beff' }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#75beff' }}/>
                    Shell
                  </span>
                )}
                {!isRunning && (shellStatus === 'disconnected' || shellStatus === 'exited' || shellStatus === 'error') && (
                  <button onClick={connectShell} className="text-xs" style={{ color: '#75beff' }}>
                    ↺ Connect
                  </button>
                )}
                <button onClick={() => terminalApiRef.current?.clear()}
                  className="text-xs px-1" style={{ color: '#858585' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#cccccc'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#858585'}>
                  ⊘
                </button>
                <button onClick={() => setTerminalVisible(false)}
                  className="text-xs" style={{ color: '#858585' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#cccccc'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#858585'}>
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden" style={{ background: '#1e1e1e', padding: '2px 4px' }}>
              <Terminal
                onReady={(api) => { terminalApiRef.current = api; void connectShell(); }}
                onData={handleTerminalData}
                onResize={handleTerminalResize}
              />
            </div>
          </div>
        </div>

        {/* ── AI Agent panel — permanent right column ─────────────────────── */}
        <div className="flex-shrink-0 overflow-hidden" style={{ width: 300, borderLeft: '1px solid #252526' }}>
          <AIPanel
            projectId={projectId!}
            activeFile={activeTab?.file ?? null}
            onFilesChanged={refreshFiles}
          />
        </div>
      </div>

      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      <StatusBar
        activeTab={activeTab}
        saving={saving}
        shellStatus={shellStatus}
        executionStatus={executionStatus}
        projectName={project.name}
      />

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      {dialog?.type === 'newFile' && (
        <NewFileDialog parentPath={dialog.parentPath} isFolder={false}
          onConfirm={(p) => handleCreateFile(p, false)} onCancel={() => setDialog(null)} />
      )}
      {dialog?.type === 'newFolder' && (
        <NewFileDialog parentPath={dialog.parentPath} isFolder={true}
          onConfirm={(p) => handleCreateFile(p, true)} onCancel={() => setDialog(null)} />
      )}
      {dialog?.type === 'rename' && (
        <RenameDialog file={dialog.file}
          onConfirm={(newPath) => handleRename(dialog.file, newPath)} onCancel={() => setDialog(null)} />
      )}
      {dialog?.type === 'delete' && (
        <DeleteConfirmDialog file={dialog.file}
          onConfirm={() => handleDelete(dialog.file)} onCancel={() => setDialog(null)} />
      )}
    </div>
  );
}

// ── Small UI components ───────────────────────────────────────────────────────

function ActivityIcon({ title, active, onClick, children }: {
  title: string; active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex items-center justify-center rounded"
      style={{
        width: 48, height: 48,
        color: active ? '#ffffff' : '#858585',
        borderLeft: active ? '2px solid #007acc' : '2px solid transparent',
        background: 'transparent',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = '#cccccc'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = '#858585'; }}
    >
      {children}
    </button>
  );
}

function ToolbarBtn({ onClick, disabled = false, title, active = false, children }: {
  onClick: () => void; disabled?: boolean; title?: string; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center rounded"
      style={{
        width: 24, height: 22,
        color: disabled ? '#555555' : (active ? '#ffffff' : '#cccccc'),
        background: active ? '#4f4f4f' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = '#4f4f4f'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? '#4f4f4f' : 'transparent'; }}
    >
      {children}
    </button>
  );
}

function TerminalTab({ active = false, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span
      className="text-xs px-3 cursor-pointer flex items-center"
      style={{
        height: 30,
        color: active ? '#ffffff' : '#8a8a8a',
        borderBottom: active ? '1px solid #007acc' : '1px solid transparent',
        background: active ? '#1e1e1e' : 'transparent',
        fontSize: 11,
        letterSpacing: '0.5px',
      }}
    >
      {children}
    </span>
  );
}
