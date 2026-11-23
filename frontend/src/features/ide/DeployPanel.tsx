import { useState, useEffect, useRef } from 'react';
import { deploymentService } from '../../services/deploymentService';
import type { Deployment, DeploymentStatus } from '../../services/deploymentService';

interface Props {
  projectId: string;
}

const STATUS_COLOR: Record<DeploymentStatus, string> = {
  pending:  '#e2c08d',
  building: '#75beff',
  running:  '#89d185',
  failed:   '#f48771',
  stopped:  '#858585',
};

const STATUS_ICON: Record<DeploymentStatus, string> = {
  pending:  '⏳',
  building: '🔨',
  running:  '🟢',
  failed:   '✗',
  stopped:  '⏹',
};

export default function DeployPanel({ projectId }: Props) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    deploymentService.list(projectId)
      .then(setDeployments)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    return () => { stopStreamRef.current?.(); };
  }, []);

  async function handleDeploy() {
    setDeploying(true);
    setError('');
    setLogs([]);

    try {
      const deployment = await deploymentService.deploy(projectId);
      setDeployments(prev => [deployment, ...prev]);
      setActiveDeploymentId(deployment.id);

      // Stream logs via SSE
      const stop = deploymentService.streamLogs(
        deployment.id,
        (msg) => setLogs(prev => [...prev, msg]),
        (status, url) => {
          setDeploying(false);
          setDeployments(prev => prev.map(d =>
            d.id === deployment.id ? { ...d, status, url: url ?? null } : d
          ));
        }
      );
      stopStreamRef.current = stop;

    } catch (err) {
      setError((err as Error).message);
      setDeploying(false);
    }
  }

  async function handleStop(deploymentId: string) {
    try {
      await deploymentService.stop(deploymentId);
      setDeployments(prev => prev.map(d =>
        d.id === deploymentId ? { ...d, status: 'stopped' } : d
      ));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const activeDeployment = deployments[0];

  return (
    <div className="h-full flex flex-col overflow-hidden text-xs"
      style={{ background: '#252526', color: '#cccccc' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid #3c3c3c' }}>
        <span className="font-semibold uppercase tracking-wider" style={{ color: '#bbbbbe', fontSize: 11 }}>
          Deployments
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Deploy button */}
        <div className="px-3 py-3" style={{ borderBottom: '1px solid #3c3c3c' }}>
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="w-full flex items-center justify-center gap-2 py-2 rounded font-medium transition-colors"
            style={{
              background: deploying ? '#3c3c3c' : '#0e7a0d',
              color: deploying ? '#858585' : '#fff',
              cursor: deploying ? 'not-allowed' : 'pointer',
            }}>
            {deploying ? (
              <>
                <span className="w-3 h-3 rounded-full animate-spin"
                  style={{ border: '2px solid currentColor', borderTopColor: 'transparent' }} />
                Deploying…
              </>
            ) : (
              <>
                <RocketIcon />
                Deploy Project
              </>
            )}
          </button>

          {error && (
            <p className="mt-2" style={{ color: '#f48771' }}>{error}</p>
          )}
        </div>

        {/* Live logs while deploying */}
        {logs.length > 0 && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid #3c3c3c' }}>
            <div className="font-semibold mb-2 uppercase tracking-wider"
              style={{ color: '#bbbbbe', fontSize: 11 }}>
              BUILD LOG
            </div>
            <div className="rounded overflow-y-auto max-h-48"
              style={{ background: '#1e1e1e', padding: '8px', fontFamily: 'monospace' }}>
              {logs.map((log, i) => (
                <div key={i} style={{
                  color: log.startsWith('✓') ? '#89d185' :
                         log.startsWith('✗') ? '#f48771' :
                         log.includes('error') || log.includes('Error') ? '#f48771' :
                         '#cccccc',
                  lineHeight: 1.5,
                }}>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Current deployment URL */}
        {activeDeployment?.status === 'running' && activeDeployment.url && (
          <div className="px-3 py-3" style={{ borderBottom: '1px solid #3c3c3c', background: '#1a2a1a' }}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: '#89d185' }}>🟢</span>
              <span style={{ color: '#89d185', fontWeight: 600 }}>Live</span>
            </div>
            <a
              href={activeDeployment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-1.5 rounded font-mono truncate"
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#75beff' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#8b949e'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#30363d'}>
              {activeDeployment.url} ↗
            </a>
            <button
              onClick={() => handleStop(activeDeployment.id)}
              className="mt-2 w-full py-1 rounded text-center"
              style={{ background: '#3c0000', border: '1px solid #6e0000', color: '#f48771' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#5a0000'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#3c0000'}>
              Stop Deployment
            </button>
          </div>
        )}

        {/* Deployment history */}
        {!loading && deployments.length > 0 && (
          <div className="px-3 py-2">
            <div className="font-semibold mb-2 uppercase tracking-wider"
              style={{ color: '#bbbbbe', fontSize: 11 }}>
              HISTORY
            </div>
            <div className="space-y-1">
              {deployments.map(d => (
                <div
                  key={d.id}
                  onClick={() => setActiveDeploymentId(d.id)}
                  className="flex items-center justify-between p-2 rounded cursor-pointer"
                  style={{
                    background: activeDeploymentId === d.id ? '#2a2d2e' : 'transparent',
                    border: `1px solid ${activeDeploymentId === d.id ? '#3c3c3c' : 'transparent'}`,
                  }}
                  onMouseEnter={e => { if (activeDeploymentId !== d.id) (e.currentTarget as HTMLElement).style.background = '#2a2d2e'; }}
                  onMouseLeave={e => { if (activeDeploymentId !== d.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span>{STATUS_ICON[d.status]}</span>
                    <div className="min-w-0">
                      <div style={{ color: '#cccccc' }}>v{d.version}</div>
                      <div style={{ color: '#858585', fontSize: 10 }}>
                        {new Date(d.createdAt).toLocaleDateString()} {new Date(d.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="px-1.5 py-0.5 rounded"
                      style={{ background: '#3c3c3c', color: STATUS_COLOR[d.status], fontSize: 10 }}>
                      {d.status}
                    </span>
                    {d.url && d.status === 'running' && (
                      <a href={d.url} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#75beff' }}
                        onClick={e => e.stopPropagation()}>
                        ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && deployments.length === 0 && (
          <div className="px-3 py-8 text-center" style={{ color: '#858585' }}>
            <p>No deployments yet.</p>
            <p className="mt-1">Click Deploy Project to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RocketIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
    </svg>
  );
}
