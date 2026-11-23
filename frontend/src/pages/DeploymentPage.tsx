import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { projectService } from '../services/projectService';
import { deploymentService } from '../services/deploymentService';
import { githubService } from '../services/githubService';
import type { Deployment } from '../services/deploymentService';
import type { Project } from '../types';

/**
 * DeploymentPage — Vercel/Railway-style deployment dashboard.
 *
 * Flow:
 * 1. User arrives at /deployments/:projectId
 * 2. Page checks GitHub connection + linked repo
 * 3. If not connected → prompt to connect GitHub first
 * 4. If connected → show Deploy button
 * 5. On Deploy:
 *    - Backend creates deployment record
 *    - Streams build logs via SSE
 *    - Shows live progress steps (like Vercel's deployment view)
 *    - On success → shows live URL with copy button
 * 6. Deployment history below
 */

type Step = { label: string; status: 'pending' | 'running' | 'done' | 'failed' };

const DEPLOY_STEPS: Step[] = [
  { label: 'Connecting to GitHub',  status: 'pending' },
  { label: 'Preparing project files', status: 'pending' },
  { label: 'Building Docker image', status: 'pending' },
  { label: 'Starting container',    status: 'pending' },
  { label: 'Health check',          status: 'pending' },
  { label: 'Generating live URL',   status: 'pending' },
];

export default function DeploymentPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [linkedRepo, setLinkedRepo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [steps, setSteps] = useState<Step[]>(DEPLOY_STEPS.map(s => ({ ...s })));
  const [logs, setLogs] = useState<string[]>([]);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [deployError, setDeployError] = useState('');
  const [copied, setCopied] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      projectService.getProject(projectId),
      deploymentService.list(projectId),
      githubService.getStatus(),
      githubService.getGitStatus(projectId),
    ]).then(([proj, deps, ghStatus, { linkedRepo: repo }]) => {
      setProject(proj);
      setDeployments(deps);
      setGithubConnected(ghStatus.connected);
      setGithubLogin(ghStatus.login);
      setLinkedRepo(repo?.githubRepo ?? null);
    }).catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false));
  }, [projectId, navigate]);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => () => { stopStreamRef.current?.(); }, []);

  function advanceStep(stepIdx: number, status: 'running' | 'done' | 'failed') {
    setSteps(prev => prev.map((s, i) => i === stepIdx ? { ...s, status } : s));
  }

  const handleDeploy = useCallback(async () => {
    if (!projectId) return;
    setDeploying(true);
    setDeployError('');
    setLiveUrl(null);
    setLogs([]);
    setSteps(DEPLOY_STEPS.map(s => ({ ...s })));

    advanceStep(0, 'running');

    try {
      const deployment = await deploymentService.deploy(projectId);
      setDeployments(prev => [deployment, ...prev]);

      advanceStep(0, 'done');
      advanceStep(1, 'running');

      let currentStep = 1;

      const stop = deploymentService.streamLogs(
        deployment.id,
        (msg) => {
          setLogs(prev => [...prev, msg]);

          // Map log messages to visual steps
          if (msg.includes('Dockerfile generated') || msg.includes('Files:')) {
            if (currentStep === 1) { advanceStep(1, 'done'); advanceStep(2, 'running'); currentStep = 2; }
          }
          if (msg.includes('Image built') || msg.includes('Building image')) {
            if (currentStep === 2) { /* still building */ }
          }
          if (msg.includes('Container started')) {
            advanceStep(2, 'done'); advanceStep(3, 'done'); advanceStep(4, 'running'); currentStep = 4;
          }
          if (msg.includes('health check')) {
            if (currentStep === 4) { advanceStep(4, 'running'); currentStep = 4; }
          }
          if (msg.includes('Deployment live at') || msg.includes('Deployment successful')) {
            advanceStep(4, 'done'); advanceStep(5, 'running'); currentStep = 5;
          }
        },
        (status, url) => {
          if (status === 'running' && url) {
            advanceStep(5, 'done');
            setLiveUrl(url);
            setDeployments(prev => prev.map(d =>
              d.id === deployment.id ? { ...d, status, url } : d
            ));
          } else if (status === 'failed') {
            // Mark current running step as failed
            setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'failed' } : s));
            setDeployError('Deployment failed. Check the build log below.');
            setDeployments(prev => prev.map(d =>
              d.id === deployment.id ? { ...d, status } : d
            ));
          }
          setDeploying(false);
        }
      );
      stopStreamRef.current = stop;

    } catch (err) {
      setDeployError((err as Error).message);
      setDeploying(false);
      setSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: 'failed' } : s));
    }
  }, [projectId]);

  function copyUrl() {
    if (!liveUrl) return;
    navigator.clipboard.writeText(liveUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-gray-500 hover:text-white text-sm transition-colors">
            ← Dashboard
          </Link>
          <span className="text-gray-700">·</span>
          <span className="font-semibold">{project?.name}</span>
          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
            {project?.language}
          </span>
        </div>
        <Link to={`/projects/${projectId}`}
          className="text-sm text-gray-400 hover:text-white transition-colors">
          Open IDE →
        </Link>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold mb-1">Deploy {project?.name}</h1>
          <p className="text-gray-400 text-sm">
            Your project will be built, containerized, and deployed to a live URL.
          </p>
        </div>

        {/* GitHub connection status */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <GitHubIcon />
            GitHub Integration
          </h2>
          {githubConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <div>
                  <p className="text-sm">Connected as <strong>{githubLogin}</strong></p>
                  {linkedRepo ? (
                    <a href={`https://github.com/${linkedRepo}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300">
                      {linkedRepo} ↗
                    </a>
                  ) : (
                    <p className="text-xs text-gray-500">No repository linked yet — will be created on first deploy</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">Connect GitHub to enable deployments</p>
              <button
                onClick={() => githubService.startOAuth()}
                className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                <GitHubIcon />
                Connect GitHub
              </button>
            </div>
          )}
        </div>

        {/* Deploy button */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Deploy to Production</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Builds your project and runs it on a live URL
              </p>
            </div>
            <button
              onClick={handleDeploy}
              disabled={deploying || !githubConnected}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all"
              style={{
                background: deploying || !githubConnected ? '#374151' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                color: deploying || !githubConnected ? '#6b7280' : '#fff',
                cursor: deploying || !githubConnected ? 'not-allowed' : 'pointer',
                boxShadow: deploying || !githubConnected ? 'none' : '0 0 20px rgba(79,70,229,0.4)',
              }}>
              {deploying ? (
                <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Deploying…</>
              ) : (
                <><RocketIcon /> Deploy Now</>
              )}
            </button>
          </div>

          {/* Deployment steps — shown while deploying */}
          {(deploying || liveUrl || deployError) && (
            <div className="space-y-2 mt-4 pt-4 border-t border-gray-800">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <StepIndicator status={step.status} />
                  <span className={`text-sm ${
                    step.status === 'done' ? 'text-green-400' :
                    step.status === 'running' ? 'text-white' :
                    step.status === 'failed' ? 'text-red-400' :
                    'text-gray-500'
                  }`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {deployError && (
            <div className="mt-4 bg-red-950 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">
              {deployError}
            </div>
          )}
        </div>

        {/* Live URL card — shown after successful deploy */}
        {liveUrl && (
          <div className="bg-green-950 border border-green-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              <span className="font-semibold text-green-300">Deployment Live</span>
            </div>
            <div className="flex items-center gap-2">
              <a href={liveUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-sm font-mono text-indigo-300 hover:text-indigo-200 truncate transition-colors">
                {liveUrl}
              </a>
              <button onClick={copyUrl}
                className="flex-shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                style={{ background: copied ? '#166534' : '#1e3a5f', color: copied ? '#86efac' : '#93c5fd' }}>
                {copied ? '✓ Copied' : 'Copy URL'}
              </button>
              <a href={liveUrl} target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors">
                Visit →
              </a>
            </div>
          </div>
        )}

        {/* Build log */}
        {logs.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-400">Build Log</span>
              <span className="text-xs text-gray-600">{logs.length} lines</span>
            </div>
            <div ref={logsRef}
              className="p-4 overflow-y-auto max-h-64 font-mono text-xs"
              style={{ background: '#0a0a0f' }}>
              {logs.map((log, i) => (
                <div key={i} style={{
                  color: log.startsWith('✓') || log.includes('successfully') ? '#4ade80' :
                         log.startsWith('✗') || log.toLowerCase().includes('error') || log.toLowerCase().includes('failed') ? '#f87171' :
                         log.includes('Deployment live') ? '#818cf8' :
                         '#9ca3af',
                  lineHeight: 1.6,
                }}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deployment history */}
        {deployments.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800">
              <h2 className="font-semibold text-sm">Deployment History</h2>
            </div>
            <div className="divide-y divide-gray-800">
              {deployments.map(d => (
                <div key={d.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusDot status={d.status} />
                    <div>
                      <p className="text-sm font-medium">v{d.version}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(d.createdAt).toLocaleDateString()} {new Date(d.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      d.status === 'running' ? 'bg-green-900 text-green-300' :
                      d.status === 'failed' ? 'bg-red-900 text-red-300' :
                      d.status === 'building' ? 'bg-blue-900 text-blue-300' :
                      'bg-gray-800 text-gray-400'
                    }`}>
                      {d.status}
                    </span>
                    {d.url && d.status === 'running' && (
                      <a href={d.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-mono">
                        {d.url.replace('http://', '').replace('https://', '')} ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function StepIndicator({ status }: { status: Step['status'] }) {
  if (status === 'done') return <span className="w-5 h-5 flex items-center justify-center text-green-400">✓</span>;
  if (status === 'failed') return <span className="w-5 h-5 flex items-center justify-center text-red-400">✗</span>;
  if (status === 'running') return (
    <span className="w-5 h-5 flex items-center justify-center">
      <span className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
    </span>
  );
  return <span className="w-5 h-5 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-gray-700" /></span>;
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'running' ? '#4ade80' : status === 'failed' ? '#f87171' : status === 'building' ? '#60a5fa' : '#6b7280';
  return <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />;
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
    </svg>
  );
}
