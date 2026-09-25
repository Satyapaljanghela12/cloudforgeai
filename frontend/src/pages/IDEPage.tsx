import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { projectService } from '../services/projectService';
import type { Project } from '../types';

/**
 * IDE page — placeholder.
 * Phase 3 will replace this with the full Monaco editor + file explorer + terminal.
 */
export default function IDEPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    projectService
      .getProject(id)
      .then(setProject)
      .catch((err) => {
        // 404 means wrong project ID or wrong user
        if (err.message === 'Project not found') navigate('/dashboard');
        else setError(err.message);
      });
  }, [id, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* IDE Toolbar */}
      <div className="border-b border-gray-800 px-4 py-2 flex items-center gap-4">
        <Link to="/dashboard" className="text-gray-500 hover:text-white text-sm transition-colors">
          ← Dashboard
        </Link>
        <span className="text-gray-600">|</span>
        <span className="text-sm font-medium">{project.name}</span>
        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
          {project.language}
        </span>
      </div>

      {/* Placeholder content */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-gray-500 text-sm">Cloud IDE</p>
          <p className="text-gray-600 text-xs">
            Monaco editor + file explorer + terminal coming in Phase 3
          </p>
          <p className="text-indigo-400 text-xs font-mono">Project ID: {project.id}</p>
        </div>
      </div>
    </div>
  );
}
