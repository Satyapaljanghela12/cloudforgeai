import type { ProjectFile } from '../../../types';

interface Props {
  file: ProjectFile;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmDialog({ file, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-medium text-red-400">Delete {file.isDirectory ? 'folder' : 'file'}</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-300">
            Are you sure you want to delete{' '}
            <span className="font-mono text-white">{file.path}</span>?
            {file.isDirectory && (
              <span className="text-red-400"> This will delete all files inside it.</span>
            )}
          </p>
          <div className="flex gap-2">
            <button onClick={onCancel}
              className="flex-1 border border-gray-700 text-gray-300 text-sm py-1.5 rounded hover:border-gray-500 transition-colors">
              Cancel
            </button>
            <button onClick={onConfirm}
              className="flex-1 bg-red-700 hover:bg-red-600 text-white text-sm py-1.5 rounded transition-colors">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
