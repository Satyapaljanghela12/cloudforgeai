import { useState, useRef, useEffect } from 'react';
import type { FormEvent } from 'react';

interface Props {
  parentPath?: string;
  isFolder?: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export default function NewFileDialog({ parentPath, isFolder = false, onConfirm, onCancel }: Props) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const fullPath = parentPath ? `${parentPath}/${trimmed}` : trimmed;
    onConfirm(fullPath);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-medium">
            {isFolder ? 'New folder' : 'New file'}
            {parentPath && <span className="text-gray-500"> in {parentPath}</span>}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isFolder ? 'folder-name' : 'filename.ts'}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-gray-700 text-gray-300 text-sm py-1.5 rounded hover:border-gray-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white text-sm py-1.5 rounded transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
