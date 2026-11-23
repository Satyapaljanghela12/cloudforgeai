import { useState, useEffect, useCallback } from 'react';
import { githubService } from '../../services/githubService';
import type { GitStatus, GitCommit, LinkedRepo } from '../../services/githubService';

interface Props {
  projectId: string;
  projectName: string;
}

type ChangeType = 'M' | 'A' | 'D' | 'U';

interface FileChange {
  path: string;
  type: ChangeType;
}

export default function GitPanel({ projectId, projectName }: Props) {
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [linkedRepo, setLinkedRepo] = useState<LinkedRepo | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [pushing, setPushing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successUrl, setSuccessUrl] = useState('');
  const [showLog, setShowLog] = useState(false);

  // Staged files set — files the user has explicitly staged
  const [stagedPaths, setStagedPaths] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ghStatus, { status, linkedRepo: repo }] = await Promise.all([
        githubService.getStatus(),
        githubService.getGitStatus(projectId),
      ]);
      setGithubConnected(ghStatus.connected);
      setGithubLogin(ghStatus.login);
      setGitStatus(status);
      setLinkedRepo(repo);
      // Auto-stage all changes on first load
      setStagedPaths(prev => {
        if (prev.size > 0) return prev;
        const all = new Set<string>();
        [...status.modified, ...status.added, ...status.deleted, ...status.untracked]
          .forEach(f => all.add(f));
        return all;
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Build all changes list
  const allChanges: FileChange[] = gitStatus ? [
    ...gitStatus.modified.map(f => ({ path: f, type: 'M' as ChangeType })),
    ...gitStatus.added.map(f => ({ path: f, type: 'A' as ChangeType })),
    ...gitStatus.deleted.map(f => ({ path: f, type: 'D' as ChangeType })),
    ...gitStatus.untracked.map(f => ({ path: f, type: 'U' as ChangeType })),
  ] : [];

  const staged = allChanges.filter(f => stagedPaths.has(f.path));
  const unstaged = allChanges.filter(f => !stagedPaths.has(f.path));

  function stageFile(path: string) {
    setStagedPaths(prev => new Set([...prev, path]));
  }
  function unstageFile(path: string) {
    setStagedPaths(prev => { const n = new Set(prev); n.delete(path); return n; });
  }
  function stageAll() {
    setStagedPaths(new Set(allChanges.map(f => f.path)));
  }
  function unstageAll() {
    setStagedPaths(new Set());
  }

  async function handleCommitPush() {
    if (!commitMessage.trim() || staged.length === 0) return;
    setPushing(true);
    setError('');
    setSuccessUrl('');
    try {
      const result = await githubService.push(projectId, {
        message: commitMessage,
        repoName: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        isPrivate: false,
      });
      setSuccessUrl(result.repoUrl);
      setCommitMessage('');
      setStagedPaths(new Set());
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPushing(false);
    }
  }

  async function loadLog() {
    try {
      const log = await githubService.getLog(projectId);
      setCommits(log);
      setShowLog(true);
    } catch { /* ignore */ }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden text-xs"
      style={{ background: '#252526', color: '#cccccc', userSelect: 'none' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid #3c3c3c' }}>
        <span className="font-semibold uppercase tracking-wider" style={{ color: '#bbbbbe', fontSize: 11 }}>
          Source Control
        </span>
        <button onClick={refresh} title="Refresh"
          style={{ color: '#858585', fontSize: 14 }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#cccccc'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#858585'}>
          ↻
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 rounded-full animate-spin"
              style={{ border: '2px solid #3c3c3c', borderTopColor: '#007acc' }} />
          </div>
        )}

        {!loading && (
          <>
            {/* ── GitHub connection ── */}
            <div className="px-3 py-2" style={{ borderBottom: '1px solid #3c3c3c' }}>
              {githubConnected ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: '#89d185' }}>✓</span>
                    <span style={{ color: '#cccccc' }}>
                      Connected as <strong>{githubLogin}</strong>
                    </span>
                  </div>
                  <button onClick={() => githubService.disconnect().then(refresh)}
                    style={{ color: '#858585' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#f48771'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#858585'}>
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p style={{ color: '#858585' }}>Connect GitHub to push your code.</p>
                  <button onClick={() => githubService.startOAuth()}
                    className="w-full flex items-center justify-center gap-2 py-1.5 rounded"
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#8b949e'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#30363d'}>
                    <GitHubIcon /> Connect GitHub
                  </button>
                </div>
              )}
            </div>

            {/* ── Linked repo ── */}
            {linkedRepo && (
              <div className="px-3 py-1.5 flex items-center gap-2"
                style={{ borderBottom: '1px solid #3c3c3c', background: '#1e1e1e' }}>
                <span style={{ color: '#858585' }}>⎇</span>
                <a href={`https://github.com/${linkedRepo.githubRepo}`}
                  target="_blank" rel="noopener noreferrer"
                  className="font-mono truncate" style={{ color: '#75beff' }}>
                  {linkedRepo.githubRepo}
                </a>
                <span className="px-1 rounded flex-shrink-0"
                  style={{ background: '#3c3c3c', color: '#858585' }}>
                  {linkedRepo.defaultBranch}
                </span>
              </div>
            )}

            {/* ── Commit message + action buttons ── */}
            {githubConnected && (
              <div className="px-3 py-2 space-y-2" style={{ borderBottom: '1px solid #3c3c3c' }}>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={e => setCommitMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleCommitPush(); }}
                  placeholder="Message (Enter to commit)"
                  disabled={pushing}
                  className="w-full px-2 py-1.5 rounded outline-none"
                  style={{ background: '#3c3c3c', border: '1px solid #4c4c4c', color: '#cccccc' }}
                  onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = '#007acc'}
                  onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = '#4c4c4c'}
                />

                {/* Commit & Push */}
                <button
                  onClick={handleCommitPush}
                  disabled={!commitMessage.trim() || staged.length === 0 || pushing}
                  className="w-full flex items-center justify-center gap-2 py-1.5 rounded font-medium"
                  style={{
                    background: commitMessage.trim() && staged.length > 0 && !pushing ? '#0e7a0d' : '#3c3c3c',
                    color: commitMessage.trim() && staged.length > 0 && !pushing ? '#fff' : '#858585',
                    cursor: commitMessage.trim() && staged.length > 0 && !pushing ? 'pointer' : 'not-allowed',
                  }}>
                  {pushing ? (
                    <><span className="w-3 h-3 rounded-full animate-spin"
                      style={{ border: '2px solid currentColor', borderTopColor: 'transparent' }} />
                      Pushing…</>
                  ) : (
                    <><UploadIcon />
                      {linkedRepo ? `Commit & Push (${staged.length})` : 'Publish to GitHub'}</>
                  )}
                </button>

                {error && <p style={{ color: '#f48771' }}>{error}</p>}
                {successUrl && (
                  <div style={{ color: '#89d185' }}>
                    ✓ Pushed!{' '}
                    <a href={successUrl} target="_blank" rel="noopener noreferrer"
                      style={{ color: '#75beff' }}>View on GitHub ↗</a>
                  </div>
                )}
              </div>
            )}

            {/* ── Staged changes ── */}
            {staged.length > 0 && (
              <div style={{ borderBottom: '1px solid #3c3c3c' }}>
                <SectionHeader
                  label={`STAGED CHANGES (${staged.length})`}
                  action={{ label: '− Unstage All', onClick: unstageAll }}
                />
                {staged.map(f => (
                  <FileRow
                    key={f.path} path={f.path} type={f.type}
                    action={{ icon: '−', title: 'Unstage', onClick: () => unstageFile(f.path) }}
                  />
                ))}
              </div>
            )}

            {/* ── Unstaged changes ── */}
            {unstaged.length > 0 && (
              <div style={{ borderBottom: '1px solid #3c3c3c' }}>
                <SectionHeader
                  label={`CHANGES (${unstaged.length})`}
                  action={{ label: '+ Stage All', onClick: stageAll }}
                />
                {unstaged.map(f => (
                  <FileRow
                    key={f.path} path={f.path} type={f.type}
                    action={{ icon: '+', title: 'Stage', onClick: () => stageFile(f.path) }}
                  />
                ))}
              </div>
            )}

            {allChanges.length === 0 && !loading && (
              <p className="px-3 py-4" style={{ color: '#858585' }}>
                No changes — working tree clean.
              </p>
            )}

            {/* ── Commit history ── */}
            <div className="px-3 py-2">
              <button
                onClick={showLog ? () => setShowLog(false) : loadLog}
                className="flex items-center gap-1 w-full"
                style={{ color: '#858585' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#cccccc'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#858585'}>
                <span style={{ fontSize: 10 }}>{showLog ? '▾' : '▸'}</span>
                <span className="font-semibold uppercase tracking-wider" style={{ fontSize: 11 }}>
                  HISTORY
                </span>
              </button>
              {showLog && (
                <div className="mt-2 space-y-2 pl-1">
                  {commits.length === 0 && <p style={{ color: '#858585' }}>No commits yet.</p>}
                  {commits.map(c => (
                    <div key={c.hash} className="pl-2" style={{ borderLeft: '2px solid #3c3c3c' }}>
                      <div className="font-mono" style={{ color: '#ce9178' }}>{c.hash}</div>
                      <div style={{ color: '#cccccc' }}>{c.message}</div>
                      <div style={{ color: '#858585' }}>
                        {c.author} · {new Date(c.date).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ label, action }: {
  label: string;
  action: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between px-3 py-1"
      style={{ background: '#2d2d2d' }}>
      <span className="font-semibold uppercase tracking-wider"
        style={{ color: '#bbbbbe', fontSize: 11 }}>
        {label}
      </span>
      <button onClick={action.onClick}
        style={{ color: '#858585', fontSize: 11 }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#cccccc'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#858585'}>
        {action.label}
      </button>
    </div>
  );
}

function FileRow({ path, type, action }: {
  path: string;
  type: 'M' | 'A' | 'D' | 'U';
  action: { icon: string; title: string; onClick: () => void };
}) {
  const [hovered, setHovered] = useState(false);
  const typeColors = { M: '#e2c08d', A: '#89d185', D: '#f48771', U: '#75beff' };
  const typeLabels = { M: 'Modified', A: 'Added', D: 'Deleted', U: 'Untracked' };

  return (
    <div
      className="flex items-center justify-between px-3 py-0.5 group"
      style={{ background: hovered ? '#2a2d2e' : 'transparent', cursor: 'default' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      {/* File path */}
      <span className="font-mono truncate flex-1" style={{ color: '#cccccc', fontSize: 12 }}>
        {path.includes('/') ? (
          <>
            <span style={{ color: '#858585' }}>{path.substring(0, path.lastIndexOf('/') + 1)}</span>
            {path.substring(path.lastIndexOf('/') + 1)}
          </>
        ) : path}
      </span>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Stage/Unstage button — shows on hover */}
        <button
          onClick={action.onClick}
          title={action.title}
          className="w-4 h-4 flex items-center justify-center rounded"
          style={{
            opacity: hovered ? 1 : 0,
            color: '#cccccc',
            background: hovered ? '#4c4c4c' : 'transparent',
            fontSize: 14,
            fontWeight: 'bold',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#007acc'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = hovered ? '#4c4c4c' : 'transparent'}>
          {action.icon}
        </button>

        {/* Type badge */}
        <span style={{ color: typeColors[type], fontWeight: 700, minWidth: 12, textAlign: 'center' }}
          title={typeLabels[type]}>
          {type}
        </span>
      </div>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
    </svg>
  );
}
