import type { OpenTab } from './EditorTabs';
import { getFileLanguage } from '../../utils/language';

interface Props {
  activeTab: OpenTab | null;
  saving: boolean;
  shellStatus?: string;
  executionStatus?: string;
  projectName?: string;
  branch?: string;
}

export default function StatusBar({ activeTab, saving, shellStatus, executionStatus, projectName, branch = 'main' }: Props) {
  const language = activeTab ? getFileLanguage(activeTab.file.name) : null;

  return (
    <div
      className="flex items-center justify-between flex-shrink-0 px-2"
      style={{ height: 22, background: '#007acc', color: '#ffffff', fontSize: 12 }}
    >
      {/* Left side */}
      <div className="flex items-center gap-3">
        {/* Git branch */}
        <span className="flex items-center gap-1 px-1" style={{ opacity: 0.9 }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.8 }}>
            <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 019 8.5H7A1 1 0 006 9.5v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 017 7h2A1 1 0 0010 6V5.372A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
          </svg>
          {branch}
        </span>

        {/* Project name */}
        {projectName && (
          <span style={{ opacity: 0.8 }}>{projectName}</span>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3" style={{ opacity: 0.9 }}>
        {/* Save state */}
        {saving && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse" />
            Saving…
          </span>
        )}
        {activeTab?.isDirty && !saving && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-300" />
            Modified
          </span>
        )}

        {/* Shell status */}
        {shellStatus === 'ready' && executionStatus === 'idle' && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-300" />
            Shell
          </span>
        )}
        {executionStatus === 'running' && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
            Running
          </span>
        )}

        {/* Encoding */}
        <span>UTF-8</span>

        {/* Line ending */}
        <span>CRLF</span>

        {/* Language */}
        {language && <span>{language.label}</span>}

        {/* Position placeholder */}
        {activeTab && <span>Ln 1, Col 1</span>}

        {/* Spaces */}
        <span>Spaces: 2</span>
      </div>
    </div>
  );
}
