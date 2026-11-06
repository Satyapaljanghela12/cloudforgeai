import type { ProjectFile } from '../../types';
import { getMonacoLanguage } from '../../utils/language';

export interface OpenTab {
  file: ProjectFile;
  isDirty: boolean;
  editedContent: string;
}

interface Props {
  tabs: OpenTab[];
  activeFileId: string | null;
  onTabSelect: (fileId: string) => void;
  onTabClose: (fileId: string) => void;
  /** Breadcrumb path segments for the active file */
  breadcrumb?: string[];
}

/** Returns a VS Code-style language color dot */
function getLangDotColor(filename: string): string {
  const lang = getMonacoLanguage(filename);
  const colors: Record<string, string> = {
    typescript: '#3178c6',
    javascript: '#f7df1e',
    python: '#3572a5',
    html: '#e44d26',
    css: '#563d7c',
    json: '#292929',
    markdown: '#083fa1',
  };
  return colors[lang] ?? '#858585';
}

export default function EditorTabs({ tabs, activeFileId, onTabSelect, onTabClose, breadcrumb }: Props) {
  const activeTab = tabs.find(t => t.file.id === activeFileId) ?? null;

  return (
    <div className="flex flex-col flex-shrink-0" style={{ background: '#252526' }}>
      {/* Tab strip */}
      <div className="flex items-end overflow-x-auto" style={{ background: '#2d2d2d', minHeight: 35 }}>
        {tabs.length === 0 ? (
          <div className="flex items-center px-4 h-[35px]">
            <span className="text-xs" style={{ color: '#6b6b6b' }}>No file open</span>
          </div>
        ) : (
          tabs.map((tab) => {
            const isActive = tab.file.id === activeFileId;
            return (
              <div
                key={tab.file.id}
                className="flex items-center gap-1.5 cursor-pointer flex-shrink-0 group relative"
                style={{
                  height: 35,
                  padding: '0 12px',
                  background: isActive ? '#1e1e1e' : 'transparent',
                  color: isActive ? '#ffffff' : '#969696',
                  borderTop: isActive ? '1px solid #007acc' : '1px solid transparent',
                  borderRight: '1px solid #252526',
                  minWidth: 80,
                  maxWidth: 160,
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#2a2d2e'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onClick={() => onTabSelect(tab.file.id)}
              >
                {/* Language color dot */}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: getLangDotColor(tab.file.name), opacity: isActive ? 1 : 0.5 }}
                />
                <span className="text-xs truncate flex-1" style={{ fontSize: '13px' }}>
                  {tab.file.name}
                </span>
                {/* Close / dirty indicator */}
                <button
                  className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded"
                  style={{
                    color: tab.isDirty ? '#e2c08d' : (isActive ? '#858585' : 'transparent'),
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = '#4f4f4f';
                    (e.currentTarget as HTMLElement).style.color = '#ffffff';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = tab.isDirty ? '#e2c08d' : (isActive ? '#858585' : 'transparent');
                  }}
                  onClick={e => { e.stopPropagation(); onTabClose(tab.file.id); }}
                  title={tab.isDirty ? 'Unsaved changes' : 'Close'}
                >
                  {tab.isDirty ? (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                      <circle cx="4" cy="4" r="4"/>
                    </svg>
                  ) : (
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                      <path d="M1.5 1.5l6 6m-6 0l6-6"/>
                    </svg>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Breadcrumb bar */}
      {activeTab && (
        <div
          className="flex items-center gap-1 px-3 flex-shrink-0 overflow-hidden"
          style={{ height: 22, background: '#1e1e1e', borderBottom: '1px solid #252526' }}
        >
          {(breadcrumb ?? activeTab.file.path.split('/')).map((segment, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span style={{ color: '#858585', fontSize: 11 }}>›</span>}
              <span
                className="text-xs truncate"
                style={{
                  color: i === arr.length - 1 ? '#cccccc' : '#858585',
                  fontSize: 12,
                  cursor: 'default',
                }}
              >
                {segment}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
