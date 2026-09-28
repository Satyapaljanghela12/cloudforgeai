import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { ProjectFile } from '../../../types';

interface Props {
  file: ProjectFile;
  onConfirm: (newPath: string) => void;
  onCancel: () => void;
}

export default function RenameDialog({ file, onConfirm, onCancel }: Props) {
  const [name, setName] = useState(file.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === file.name) return;
    // Reconstruct full path with new name
    const parentPath = file.path.includes('/')
      ? file.path.substring(0, file.path.lastIndexOf('/'))
      : null;
    const newPath = parentPath ? `${parentPath}/${trimmed}` : trimmed;
    onConfirm(newPath);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-medium">Rename</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <button type="button" onClick={onCancel}
              className="flex-1 border border-gray-700 text-gray-300 text-sm py-1.5 rounded hover:border-gray-500 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim() || name.trim() === file.name}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white text-sm py-1.5 rounded transition-colors">
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
