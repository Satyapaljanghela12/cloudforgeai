import { useState, useEffect } from 'react';
import type { ProjectFile } from '../../types';
import { getFileIcon } from '../../utils/language';

interface Props {
  projectName: string;
  files: ProjectFile[];
  activeFileId: string | null;
  onFileSelect: (file: ProjectFile) => void;
  onCreateFile: (parentPath?: string) => void;
  onCreateFolder: (parentPath?: string) => void;
  onDeleteFile: (file: ProjectFile) => void;
  onRenameFile: (file: ProjectFile) => void;
}

export default function FileExplorer({
  projectName,
  files,
  activeFileId,
  onFileSelect,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onRenameFile,
}: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: ProjectFile } | null>(null);
  const [projectExpanded, setProjectExpanded] = useState(true);
  const tree = buildTree(files);

  useEffect(() => {
    if (!contextMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setContextMenu(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  return (
    <div
      className="h-full flex flex-col select-none overflow-hidden"
      style={{ background: '#252526' }}
      onClick={() => setContextMenu(null)}
    >
      {/* Panel title */}
      <div className="px-4 py-2 flex-shrink-0" style={{ background: '#252526' }}>
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#bbbbbe' }}>
          Explorer
        </span>
      </div>

      {/* Project root row */}
      <div
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer flex-shrink-0"
        style={{ background: '#252526' }}
        onClick={() => setProjectExpanded(v => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" className="flex-shrink-0" style={{ color: '#c5c5c5' }} fill="currentColor">
          {projectExpanded
            ? <path d="M7.976 10.072l-4.357-4.357.62-.618L7.976 8.837l3.737-3.74.62.618z"/>
            : <path d="M5.7 13.7L4.3 12.3 9.6 7 4.3 1.7 5.7.3 12.4 7z"/>}
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wider truncate" style={{ color: '#bbbbbe' }}>
          {projectName}
        </span>
        {/* Action icons */}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <ActionButton title="New File" onClick={(e) => { e.stopPropagation(); onCreateFile(); }}>
            <NewFileIcon />
          </ActionButton>
          <ActionButton title="New Folder" onClick={(e) => { e.stopPropagation(); onCreateFolder(); }}>
            <NewFolderIcon />
          </ActionButton>
        </div>
      </div>

      {/* Hover row with icons visible */}
      <div className="px-2 -mt-0.5 flex-shrink-0 flex items-center justify-end gap-0.5 pb-0.5">
        <ActionButton title="New File" onClick={() => onCreateFile()}>
          <NewFileIcon />
        </ActionButton>
        <ActionButton title="New Folder" onClick={() => onCreateFolder()}>
          <NewFolderIcon />
        </ActionButton>
      </div>

      {/* File tree */}
      {projectExpanded && (
        <div className="flex-1 overflow-y-auto" style={{ background: '#252526' }}>
          {tree.length === 0 ? (
            <p className="text-xs px-6 py-3" style={{ color: '#6b6b6b' }}>
              No files yet.
            </p>
          ) : (
            tree.map((node) => (
              <TreeNode
                key={node.file.id}
                node={node}
                depth={0}
                activeFileId={activeFileId}
                onFileSelect={onFileSelect}
                onContextMenu={(e, f) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, file: f });
                }}
              />
            ))
          )}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 py-1 rounded shadow-xl"
          style={{
            top: contextMenu.y, left: contextMenu.x,
            background: '#252526', border: '1px solid #454545',
            minWidth: 160,
          }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.file.isDirectory && (
            <>
              <CtxItem label="New File" onClick={() => { onCreateFile(contextMenu.file.path); setContextMenu(null); }} />
              <CtxItem label="New Folder" onClick={() => { onCreateFolder(contextMenu.file.path); setContextMenu(null); }} />
              <div style={{ borderTop: '1px solid #454545', margin: '2px 0' }} />
            </>
          )}
          <CtxItem label="Rename" onClick={() => { onRenameFile(contextMenu.file); setContextMenu(null); }} />
          <CtxItem label="Delete" danger onClick={() => { onDeleteFile(contextMenu.file); setContextMenu(null); }} />
        </div>
      )}
    </div>
  );
}

// ── Tree Node ─────────────────────────────────────────────────────────────────

interface TreeNodeData { file: ProjectFile; children: TreeNodeData[]; }

function TreeNode({ node, depth, activeFileId, onFileSelect, onContextMenu }: {
  node: TreeNodeData; depth: number; activeFileId: string | null;
  onFileSelect: (f: ProjectFile) => void;
  onContextMenu: (e: React.MouseEvent, f: ProjectFile) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isActive = node.file.id === activeFileId;

  return (
    <div>
      <div
        className="flex items-center cursor-pointer group"
        style={{
          paddingLeft: `${depth * 12 + 8}px`,
          height: 22,
          background: isActive ? '#094771' : undefined,
          color: isActive ? '#ffffff' : '#cccccc',
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#2a2d2e'; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        onClick={() => node.file.isDirectory ? setExpanded(v => !v) : onFileSelect(node.file)}
        onContextMenu={e => onContextMenu(e, node.file)}
      >
        {/* Chevron for directories */}
        <span className="flex-shrink-0 w-4 flex items-center justify-center" style={{ color: '#c5c5c5' }}>
          {node.file.isDirectory ? (
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              {expanded
                ? <path d="M7.976 10.072l-4.357-4.357.62-.618L7.976 8.837l3.737-3.74.62.618z"/>
                : <path d="M5.7 13.7L4.3 12.3 9.6 7 4.3 1.7 5.7.3 12.4 7z"/>}
            </svg>
          ) : null}
        </span>

        {/* File/folder icon */}
        <span className="flex-shrink-0 mr-1.5 text-sm leading-none">
          {getFileIcon(node.file.name, node.file.isDirectory)}
        </span>

        {/* Name */}
        <span className="text-xs truncate flex-1" style={{ fontSize: '13px', letterSpacing: '0.1px' }}>
          {node.file.name}
        </span>
      </div>

      {node.file.isDirectory && expanded && node.children.map(child => (
        <TreeNode key={child.file.id} node={child} depth={depth + 1}
          activeFileId={activeFileId} onFileSelect={onFileSelect} onContextMenu={onContextMenu} />
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function CtxItem({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className="w-full text-left px-3 py-1 text-xs transition-colors"
      style={{ color: danger ? '#f48771' : '#cccccc' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#094771'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ActionButton({ title, onClick, children }: { title: string; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="p-0.5 rounded transition-colors"
      style={{ color: '#c5c5c5' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ffffff'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#c5c5c5'; }}
    >
      {children}
    </button>
  );
}

function buildTree(files: ProjectFile[]): TreeNodeData[] {
  const map = new Map<string, TreeNodeData>();
  const roots: TreeNodeData[] = [];
  for (const file of files) map.set(file.path, { file, children: [] });
  for (const file of files) {
    const node = map.get(file.path)!;
    const idx = file.path.lastIndexOf('/');
    const parentPath = idx >= 0 ? file.path.substring(0, idx) : null;
    if (parentPath && map.has(parentPath)) map.get(parentPath)!.children.push(node);
    else roots.push(node);
  }
  function sort(nodes: TreeNodeData[]) {
    nodes.sort((a, b) => {
      if (a.file.isDirectory !== b.file.isDirectory) return a.file.isDirectory ? -1 : 1;
      return a.file.name.localeCompare(b.file.name);
    });
    nodes.forEach(n => sort(n.children));
  }
  sort(roots);
  return roots;
}

function NewFileIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9 1zm0 1.5L12.5 5H9V2.5zM8.5 9H7v1.5H5.5V9H4V7.5h1.5V6H7v1.5h1.5V9z"/>
  </svg>;
}

function NewFolderIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9zm8.5 4H8V6H6.5v1.5H5V9h1.5v1.5H8V9h1.5V7.5z"/>
  </svg>;
}
