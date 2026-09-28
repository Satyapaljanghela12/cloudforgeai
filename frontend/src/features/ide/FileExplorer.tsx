import { useState, useEffect } from 'react';
import type { ProjectFile } from '../../types';
import { getFileIcon } from '../../utils/language';

interface Props {
  files: ProjectFile[];
  activeFileId: string | null;
  onFileSelect: (file: ProjectFile) => void;
  onCreateFile: (parentPath?: string) => void;
  onCreateFolder: (parentPath?: string) => void;
  onDeleteFile: (file: ProjectFile) => void;
  onRenameFile: (file: ProjectFile) => void;
}

/**
 * FileExplorer — left panel of the IDE.
 *
 * Renders a flat list from the database as a tree.
 * Files are sorted: directories first, then alphabetically by path.
 *
 * Why flat storage with path strings instead of a tree structure in DB?
 * Simpler queries, simpler API. The tree is reconstructed in the UI.
 * This is the same approach used by many storage systems (S3, GitHub).
 */
export default function FileExplorer({
  files,
  activeFileId,
  onFileSelect,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onRenameFile,
}: Props) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    file: ProjectFile;
  } | null>(null);

  // Build a tree from flat path list
  const tree = buildTree(files);

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeContextMenu(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contextMenu]);

  function handleContextMenu(e: React.MouseEvent, file: ProjectFile) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  return (
    <div
      className="h-full flex flex-col bg-gray-900 select-none"
      onClick={closeContextMenu}
    >
      {/* Explorer header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
          Explorer
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCreateFile()}
            title="New file"
            className="p-1 text-gray-500 hover:text-white rounded transition-colors"
          >
            <NewFileIcon />
          </button>
          <button
            onClick={() => onCreateFolder()}
            title="New folder"
            className="p-1 text-gray-500 hover:text-white rounded transition-colors"
          >
            <NewFolderIcon />
          </button>
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <p className="text-xs text-gray-600 text-center mt-8 px-4">
            No files yet. Create one to get started.
          </p>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.file.id}
              node={node}
              depth={0}
              activeFileId={activeFileId}
              onFileSelect={onFileSelect}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.file.isDirectory && (
            <>
              <ContextMenuItem
                label="New file here"
                onClick={() => { onCreateFile(contextMenu.file.path); closeContextMenu(); }}
              />
              <ContextMenuItem
                label="New folder here"
                onClick={() => { onCreateFolder(contextMenu.file.path); closeContextMenu(); }}
              />
              <div className="border-t border-gray-700 my-1" />
            </>
          )}
          <ContextMenuItem
            label="Rename"
            onClick={() => { onRenameFile(contextMenu.file); closeContextMenu(); }}
          />
          <ContextMenuItem
            label="Delete"
            danger
            onClick={() => { onDeleteFile(contextMenu.file); closeContextMenu(); }}
          />
        </div>
      )}
    </div>
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────

interface TreeNodeData {
  file: ProjectFile;
  children: TreeNodeData[];
}

interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  activeFileId: string | null;
  onFileSelect: (file: ProjectFile) => void;
  onContextMenu: (e: React.MouseEvent, file: ProjectFile) => void;
}

function TreeNode({ node, depth, activeFileId, onFileSelect, onContextMenu }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const isActive = node.file.id === activeFileId;

  function handleClick() {
    if (node.file.isDirectory) {
      setExpanded((prev) => !prev);
    } else {
      onFileSelect(node.file);
    }
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-0.5 cursor-pointer text-sm group
          ${isActive ? 'bg-indigo-600/30 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
        style={{ paddingLeft: `${(depth * 12) + 8}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, node.file)}
      >
        {node.file.isDirectory && (
          <span className="text-gray-500 text-xs w-3">{expanded ? '▾' : '▸'}</span>
        )}
        {!node.file.isDirectory && <span className="w-3" />}
        <span className="text-sm">{getFileIcon(node.file.name, node.file.isDirectory)}</span>
        <span className="truncate">{node.file.name}</span>
      </div>

      {node.file.isDirectory && expanded && node.children.map((child) => (
        <TreeNode
          key={child.file.id}
          node={child}
          depth={depth + 1}
          activeFileId={activeFileId}
          onFileSelect={onFileSelect}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}

// ── Context menu item ─────────────────────────────────────────────────────────

function ContextMenuItem({
  label,
  onClick,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 transition-colors
        ${danger ? 'text-red-400 hover:text-red-300' : 'text-gray-300'}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ── Tree builder ──────────────────────────────────────────────────────────────

function buildTree(files: ProjectFile[]): TreeNodeData[] {
  const map = new Map<string, TreeNodeData>();
  const roots: TreeNodeData[] = [];

  // Create all nodes
  for (const file of files) {
    map.set(file.path, { file, children: [] });
  }

  // Wire parent-child relationships
  for (const file of files) {
    const node = map.get(file.path)!;
    const parentPath = getParentPath(file.path);

    if (parentPath && map.has(parentPath)) {
      map.get(parentPath)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort: directories first, then alpha
  function sortNodes(nodes: TreeNodeData[]) {
    nodes.sort((a, b) => {
      if (a.file.isDirectory !== b.file.isDirectory) {
        return a.file.isDirectory ? -1 : 1;
      }
      return a.file.name.localeCompare(b.file.name);
    });
    nodes.forEach((n) => sortNodes(n.children));
  }

  sortNodes(roots);
  return roots;
}

function getParentPath(filePath: string): string | null {
  const idx = filePath.lastIndexOf('/');
  return idx >= 0 ? filePath.substring(0, idx) : null;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function NewFileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9 1zm0 1.5L12.5 5H9V2.5zM8.5 9H7v1.5H5.5V9H4V7.5h1.5V6H7v1.5h1.5V9z"/>
    </svg>
  );
}

function NewFolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9zm8.5 4H8V6H6.5v1.5H5V9h1.5v1.5H8V9h1.5V7.5z"/>
    </svg>
  );
}
