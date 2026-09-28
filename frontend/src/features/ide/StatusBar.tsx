import type { OpenTab } from './EditorTabs';
import { getFileLanguage } from '../../utils/language';

interface Props {
  activeTab: OpenTab | null;
  saving: boolean;
}

export default function StatusBar({ activeTab, saving }: Props) {
  const language = activeTab ? getFileLanguage(activeTab.file.name) : null;

  return (
    <div className="h-6 bg-indigo-900 flex items-center justify-between px-3 text-xs text-indigo-200 flex-shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-medium">CloudForge AI</span>
      </div>
      <div className="flex items-center gap-4">
        {saving && <span className="text-indigo-300 animate-pulse">Saving…</span>}
        {activeTab?.isDirty && !saving && (
          <span className="text-yellow-300">● Unsaved changes</span>
        )}
        {activeTab && !activeTab.isDirty && !saving && (
          <span className="text-indigo-400">Saved</span>
        )}
        {language && (
          <span className="text-indigo-300">{language.label}</span>
        )}
        {activeTab && (
          <span className="text-indigo-400 font-mono">{activeTab.file.path}</span>
        )}
      </div>
    </div>
  );
}
