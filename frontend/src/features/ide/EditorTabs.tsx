import type { ProjectFile } from '../../types';
import { getFileIcon } from '../../utils/language';

export interface OpenTab {
  file: ProjectFile;
  isDirty: boolean;     // Unsaved changes
  editedContent: string; // Current editor content (may differ from file.content)
}

interface Props {
  tabs: OpenTab[];
  activeFileId: string | null;
  onTabSelect: (fileId: string) => void;
  onTabClose: (fileId: string) => void;
}

/**
 * EditorTabs — the tab bar above the Monaco editor.
 *
 * A tab is "dirty" (•) when the editor content differs from the
 * last saved content. This is the same indicator VS Code uses.
 *
 * Tabs are not the same as open files in the explorer — a file
 * can exist in the project without being open in a tab.
 */
export default function EditorTabs({ tabs, activeFileId, onTabSelect, onTabClose }: Props) {
  if (tabs.length === 0) {
    return (
      <div className="h-9 bg-gray-950 border-b border-gray-800 flex items-center px-4">
        <span className="text-xs text-gray-600">No file open</span>
      </div>
    );
  }

  return (
    <div className="h-9 bg-gray-950 border-b border-gray-800 flex items-center overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.file.id === activeFileId;
        return (
          <div
            key={tab.file.id}
            className={`flex items-center gap-1.5 px-3 h-full border-r border-gray-800 cursor-pointer
              flex-shrink-0 group transition-colors
              ${isActive
                ? 'bg-gray-800 text-white border-t-2 border-t-indigo-500'
                : 'bg-gray-950 text-gray-400 hover:bg-gray-900 border-t-2 border-t-transparent'
              }`}
            onClick={() => onTabSelect(tab.file.id)}
          >
            <span className="text-xs">{getFileIcon(tab.file.name, false)}</span>
            <span className="text-xs max-w-[120px] truncate">{tab.file.name}</span>
            {/* Dirty indicator */}
            {tab.isDirty && (
              <span className="text-indigo-400 text-xs leading-none">●</span>
            )}
            {/* Close button */}
            <button
              className={`ml-0.5 rounded p-0.5 transition-colors
                ${isActive ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-transparent group-hover:text-gray-500 hover:text-white hover:bg-gray-700'}`}
              onClick={(e) => { e.stopPropagation(); onTabClose(tab.file.id); }}
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <path d="M1.5 1.5l7 7m-7 0l7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
