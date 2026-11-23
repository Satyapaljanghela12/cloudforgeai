import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { projectService } from '../services/projectService';
import { vmService } from '../services/vmService';
import type { VMConnection } from '../services/vmService';
import { SUPPORTED_LANGUAGES } from '../types';
import type { Project } from '../types';
import CreateProjectModal from '../features/projects/CreateProjectModal';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [githubNotice, setGithubNotice] = useState('');
  const [vm, setVm] = useState<VMConnection | null>(null);

  // Handle GitHub OAuth callback redirect
  useEffect(() => {
    if (searchParams.get('github_connected') === '1') {
      setGithubNotice('✓ GitHub connected successfully!');
      setSearchParams({});
      setTimeout(() => setGithubNotice(''), 4000);
    } else if (searchParams.get('github_error')) {
      setGithubNotice(`GitHub error: ${searchParams.get('github_error')}`);
      setSearchParams({});
      setTimeout(() => setGithubNotice(''), 5000);
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    projectService
      .getProjects()
      .then(setProjects)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // Load VM status for deploy button indicator
    vmService.getStatus().then(setVm).catch(() => {});
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
          {/* VM connection status */}
          <Link to="/settings" className="flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: vm?.status === 'connected' ? '#4ade80' : vm?.status === 'failed' ? '#f87171' : '#6b7280' }}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              vm?.status === 'connected' ? 'bg-green-400' :
              vm?.status === 'failed' ? 'bg-red-400' : 'bg-gray-600'
            }`} />
            {vm?.status === 'connected' ? 'VM Connected' : vm?.status === 'failed' ? 'VM Error' : 'Connect VM'}
          </Link>
          <span className="text-gray-700">·</span>
          <span className="text-sm text-gray-400">{user?.name}</span>
          <Link to="/settings" className="text-sm text-gray-400 hover:text-white transition-colors">
            Settings
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* GitHub OAuth notice */}
      {githubNotice && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg transition-all ${
          githubNotice.startsWith('✓')
            ? 'bg-green-900 border border-green-700 text-green-200'
            : 'bg-red-900 border border-red-700 text-red-200'
        }`}>
          {githubNotice}
        </div>
      )}

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
              <div
                key={project.id}
                className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-lg p-5 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <button
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="text-left flex-1 min-w-0"
                  >
                    <h2 className="font-medium text-white group-hover:text-indigo-300 transition-colors truncate pr-2">
                      {project.name}
                    </h2>
                  </button>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${getLanguageColor(project.language)}`}>
                    {getLanguageLabel(project.language)}
                  </span>
                </div>
                {project.description && (
                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                    {project.description}
                  </p>
                )}
                <p className="text-xs text-gray-600 mb-4">
                  Updated {formatDate(project.updatedAt)}
                </p>
                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-800">
                  <button
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="flex-1 text-xs py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                  >
                    Open IDE
                  </button>
                  <button
                    onClick={() => navigate(`/deployments/${project.id}`)}
                    className="flex-1 text-xs py-1.5 rounded-md text-white transition-all"
                    title={!vm || vm.status !== 'connected' ? 'Connect AWS VM in Settings first' : 'Deploy to your AWS VM'}
                    style={{
                      background: vm?.status === 'connected'
                        ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
                        : '#374151',
                      color: vm?.status === 'connected' ? '#fff' : '#6b7280',
                      boxShadow: vm?.status === 'connected' ? '0 0 12px rgba(79,70,229,0.3)' : 'none',
                    }}
                  >
                    🚀 Deploy
                  </button>
                </div>
              </div>
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
