import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { projectService } from '../services/projectService';
import { SUPPORTED_LANGUAGES } from '../types';
import type { Project } from '../types';
import CreateProjectModal from '../features/projects/CreateProjectModal';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    projectService
      .getProjects()
      .then(setProjects)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  function handleProjectCreated(project: Project) {
    setProjects((prev) => [project, ...prev]);
    setShowCreateModal(false);
  }

  function getLanguageLabel(value: string) {
    return SUPPORTED_LANGUAGES.find((l) => l.value === value)?.label ?? value;
  }

  function getLanguageColor(lang: string) {
    switch (lang) {
      case 'javascript': return 'bg-yellow-900 text-yellow-300';
      case 'typescript': return 'bg-blue-900 text-blue-300';
      case 'python': return 'bg-green-900 text-green-300';
      case 'html': return 'bg-orange-900 text-orange-300';
      default: return 'bg-gray-800 text-gray-300';
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">
          <span className="text-indigo-400">CloudForge</span> AI
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user?.name}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-gray-400 text-sm mt-1">
              {projects.length === 0 ? 'No projects yet' : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-sm font-medium px-4 py-2 rounded-md transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span>
            New project
          </button>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-950 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-md mb-6">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="border border-dashed border-gray-700 rounded-lg py-20 text-center">
            <p className="text-gray-500 text-sm mb-4">No projects yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
            >
              Create your first project →
            </button>
          </div>
        )}

        {/* Project grid */}
        {!loading && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="text-left bg-gray-900 border border-gray-800 hover:border-indigo-600 rounded-lg p-5 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <h2 className="font-medium text-white group-hover:text-indigo-300 transition-colors truncate pr-2">
                    {project.name}
                  </h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${getLanguageColor(project.language)}`}>
                    {getLanguageLabel(project.language)}
                  </span>
                </div>
                {project.description && (
                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                    {project.description}
                  </p>
                )}
                <p className="text-xs text-gray-600">
                  Updated {formatDate(project.updatedAt)}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Create project modal */}
      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}
