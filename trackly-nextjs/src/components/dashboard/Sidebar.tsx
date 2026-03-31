'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useRef, useState } from 'react';

const navGroups = [
  {
    label: 'Dashboard',
    items: [
      { href: '/dashboard', label: 'Overview', icon: '📊' },
      { href: '/dashboard/mentions', label: 'Mentions', icon: '◎' },
      { href: '/dashboard/recommendations', label: 'Recommendations', icon: '✦' },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { href: '/dashboard/proof', label: 'Evidence & Proof', icon: '◆' },
      { href: '/dashboard/query-performance', label: 'Query Performance', icon: '◻' },
      { href: '/dashboard/query-tracker', label: 'Query Tracker', icon: '✦' },
      { href: '/dashboard/prompt-details', label: 'Prompt Details', icon: '◇' },
      { href: '/dashboard/trends', label: 'SOV Trends', icon: '◆' },
      { href: '/dashboard/competitors', label: 'Competitors', icon: '⊘' },
      { href: '/dashboard/citations', label: 'Citation Analysis', icon: '⬤' },
      { href: '/dashboard/accuracy', label: 'Accuracy Monitor', icon: '◎' },
      { href: '/dashboard/platforms', label: 'Platform Status', icon: '◎' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/dashboard/copilot', label: 'Copilot', icon: '✦' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { href: '/dashboard/setup', label: 'Brand Setup', icon: '◇' },
      { href: '/dashboard/alerts', label: 'Alerts & Notifications', icon: '⚡' },
      { href: '/dashboard/billing', label: 'Billing', icon: '◻' },
      { href: '/dashboard/account', label: 'Account & Plan', icon: '◉' },
      { href: '/dashboard/activity', label: 'Activity & Logs', icon: '◆' },
      { href: '/dashboard/admin', label: 'Admin Panel', icon: '⚑', adminOnly: true },
    ],
  },
];

function fmtTime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return mins > 0 ? `${mins}m ${s}s` : `${s}s`;
}

interface RunLiveState {
  running: boolean;
  runId: string | null;
  brandId: string | null;
  received: number;
  totalExpected: number;
  foundCount: number;
  errorCount: number;
  startTime: number;
  status: 'idle' | 'running' | 'done' | 'error';
  statusText: string;
  errorMsg: string | null;
}

const INITIAL_STATE: RunLiveState = {
  running: false, runId: null, brandId: null,
  received: 0, totalExpected: 0, foundCount: 0, errorCount: 0,
  startTime: 0, status: 'idle', statusText: '', errorMsg: null,
};

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [live, setLive] = useState<RunLiveState>(INITIAL_STATE);
  const [elapsed, setElapsed] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live timer
  useEffect(() => {
    if (live.running && live.startTime) {
      timerRef.current = setInterval(() => {
        setElapsed(fmtTime(Date.now() - live.startTime));
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else if (!live.running) {
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [live.running, live.startTime]);

  // Poll fallback — when SSE disconnects but run is still active
  const pollRunStatus = useCallback(async (brandId: string, runId: string, startTime: number) => {
    let pollErrors = 0;
    const MAX_POLL_ERRORS = 15;
    let pollDelay = 2000;
    let lastResultCount = 0;

    const poll = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/brands/${brandId}/run-status/${runId}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Poll failed');
        const data = await res.json();
        pollErrors = 0;

        if (data.results && data.results.length > lastResultCount) {
          pollDelay = 2000;
          lastResultCount = data.results.length;
        } else {
          pollDelay = Math.min(pollDelay * 1.5, 10000);
        }

        setLive(prev => ({
          ...prev,
          received: data.received || prev.received,
          totalExpected: data.totalExpected || prev.totalExpected,
          foundCount: data.foundCount || 0,
          errorCount: data.errorCount || 0,
          statusText: `${data.received || 0}/${data.totalExpected || 0} — ${data.foundCount || 0} found`,
        }));

        if (data.status === 'done' || data.status === 'error') {
          localStorage.removeItem('livesov_active_run');
          const finalResult = data.finalData?.result;
          if (data.status === 'done' && finalResult) {
            setLive(prev => ({
              ...prev, running: false, status: 'done',
              statusText: `Done! Found in ${finalResult.newMentions || finalResult.totalM || 0} of ${finalResult.totalQ || 0} responses`,
            }));
            setTimeout(() => {
              setLive(INITIAL_STATE);
              window.location.reload();
            }, 2000);
          } else {
            setLive(prev => ({
              ...prev, running: false, status: 'error',
              statusText: 'Run failed: ' + (data.error || 'Unknown error'),
              errorMsg: data.error || 'Unknown error',
            }));
            setTimeout(() => setLive(INITIAL_STATE), 5000);
          }
          return;
        }

        // Schedule next poll
        await new Promise(r => setTimeout(r, pollDelay));
        return poll();
      } catch {
        pollErrors++;
        if (pollErrors >= MAX_POLL_ERRORS) {
          localStorage.removeItem('livesov_active_run');
          setLive(prev => ({
            ...prev, running: false, status: 'error',
            statusText: 'Lost connection. Refresh to check status.',
            errorMsg: 'Lost connection to server',
          }));
          setTimeout(() => setLive(INITIAL_STATE), 5000);
          return;
        }
        pollDelay = Math.min(pollDelay * 2, 10000);
        await new Promise(r => setTimeout(r, pollDelay));
        return poll();
      }
    };

    return poll();
  }, []);

  // Resume active run on mount
  useEffect(() => {
    const stored = localStorage.getItem('livesov_active_run');
    if (!stored) return;
    let runInfo: { runId: string; brandId: string; startedAt: number };
    try { runInfo = JSON.parse(stored); } catch { localStorage.removeItem('livesov_active_run'); return; }

    // Discard runs older than 10 minutes
    if (Date.now() - runInfo.startedAt > 10 * 60 * 1000) {
      localStorage.removeItem('livesov_active_run');
      return;
    }

    // Check if the run is still active
    fetch(`/api/brands/${runInfo.brandId}/run-status/${runInfo.runId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.status === 'running') {
          setLive({
            running: true, runId: runInfo.runId, brandId: runInfo.brandId,
            received: data.received || 0, totalExpected: data.totalExpected || 0,
            foundCount: data.foundCount || 0, errorCount: data.errorCount || 0,
            startTime: runInfo.startedAt, status: 'running',
            statusText: 'Resuming active run...', errorMsg: null,
          });
          pollRunStatus(runInfo.brandId, runInfo.runId, runInfo.startedAt);
        } else if (data.status === 'done') {
          localStorage.removeItem('livesov_active_run');
          // Reload to show latest results
          window.location.reload();
        } else {
          localStorage.removeItem('livesov_active_run');
        }
      })
      .catch(() => { localStorage.removeItem('livesov_active_run'); });
  }, [pollRunStatus]);

  // --- Start run with SSE streaming ---
  const startRun = useCallback(async (force = false) => {
    if (live.running) return;

    setLive({
      ...INITIAL_STATE, running: true, status: 'running',
      startTime: Date.now(), statusText: 'Connecting to AI platforms...',
    });

    try {
      // Fetch brand
      const brandRes = await fetch('/api/brands', { credentials: 'include' });
      const brandData = await brandRes.json();
      const b = (brandData.brands || [])[0];
      if (!b) {
        setLive(prev => ({ ...prev, running: false, status: 'error', statusText: 'No brand set up', errorMsg: 'No brand set up' }));
        setTimeout(() => setLive(INITIAL_STATE), 3000);
        return;
      }

      const brandId = b.id;
      const abortCtrl = new AbortController();
      abortRef.current = abortCtrl;
      const fetchTimeout = setTimeout(() => abortCtrl.abort(), 10 * 60 * 1000);

      const forceParam = force ? '&force=1' : '';
      const response = await fetch(`/api/brands/${brandId}/run?stream=1${forceParam}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        signal: abortCtrl.signal,
      });

      if (!response.ok) {
        clearTimeout(fetchTimeout);
        const errData = await response.json().catch(() => ({ error: 'Request failed' }));

        // Handle concurrent run (409) — offer force-run
        if (response.status === 409) {
          setLive(prev => ({
            ...prev, running: false, status: 'error',
            statusText: 'A run is already in progress.',
            errorMsg: 'concurrent',
          }));
          return; // Don't auto-clear — let the user click force-run
        }

        throw new Error(errData.error || 'Request failed');
      }

      clearTimeout(fetchTimeout);

      // --- Read SSE stream ---
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let activeRunId: string | null = null;
      let sseReceived = 0;
      let sseTotalExpected = 0;
      let sseFoundCount = 0;
      let sseErrorCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let finalData: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let evt;
          try { evt = JSON.parse(line.slice(6)); } catch { continue; }

          if (evt.type === 'start') {
            sseTotalExpected = evt.totalExpected || 0;
            activeRunId = evt.runId || null;
            if (activeRunId) {
              localStorage.setItem('livesov_active_run', JSON.stringify({
                runId: activeRunId, brandId, startedAt: Date.now(),
              }));
            }
            setLive(prev => ({
              ...prev, runId: activeRunId, brandId, totalExpected: sseTotalExpected,
              statusText: `Running ${evt.queries?.length || 0} queries on ${evt.platforms?.length || 0} platforms...`,
            }));
          } else if (evt.type === 'result') {
            sseReceived++;
            const r = evt.result;
            if (r.error) sseErrorCount++;
            else if (r.mentioned) sseFoundCount++;

            // Throttle UI updates to every 3rd result (or at completion)
            if (sseReceived % 3 === 0 || sseReceived >= sseTotalExpected) {
              setLive(prev => ({
                ...prev,
                received: sseReceived,
                foundCount: sseFoundCount,
                errorCount: sseErrorCount,
                statusText: `${sseReceived}/${sseTotalExpected} — ${sseFoundCount} found`,
              }));
            }
          } else if (evt.type === 'done') {
            finalData = evt;
          } else if (evt.type === 'error') {
            throw new Error(evt.error || 'Server error');
          }
        }
      }

      // --- Stream complete ---
      localStorage.removeItem('livesov_active_run');

      const result = finalData?.result || {
        totalQ: sseReceived, totalM: sseFoundCount,
        sov: sseReceived > 0 ? Math.round((sseFoundCount / sseReceived) * 100) : 0,
        newMentions: sseFoundCount, errorCount: sseErrorCount,
      };

      setLive(prev => ({
        ...prev, running: false, status: 'done',
        received: sseReceived, foundCount: sseFoundCount, errorCount: sseErrorCount,
        statusText: `Done! Found in ${result.newMentions} of ${result.totalQ} responses`,
      }));

      setTimeout(() => {
        setLive(INITIAL_STATE);
        window.location.reload();
      }, 2000);

    } catch (err) {
      const error = err as Error;
      const isAbort = error.name === 'AbortError';

      // If we have a runId, switch to polling
      if (live.runId && live.brandId) {
        setLive(prev => ({ ...prev, statusText: 'Reconnecting — queries still running...' }));
        pollRunStatus(live.brandId, live.runId, live.startTime);
        return;
      }

      setLive(prev => ({
        ...prev, running: false, status: 'error',
        statusText: isAbort ? 'Connection timed out' : 'Run failed: ' + error.message,
        errorMsg: error.message,
      }));
      setTimeout(() => setLive(INITIAL_STATE), 5000);
    }
  }, [live.running, live.runId, live.brandId, live.startTime, pollRunStatus]);

  // Force-run (release lock and retry)
  const forceRun = useCallback(async () => {
    if (!live.brandId && live.errorMsg !== 'concurrent') return;
    setLive(prev => ({ ...prev, statusText: 'Releasing lock...' }));
    try {
      // Get brand ID if we don't have it
      let brandId = live.brandId;
      if (!brandId) {
        const brandRes = await fetch('/api/brands', { credentials: 'include' });
        const brandData = await brandRes.json();
        const b = (brandData.brands || [])[0];
        if (b) brandId = b.id;
      }
      if (brandId) {
        await fetch(`/api/brands/${brandId}/force-release`, { method: 'POST', credentials: 'include' });
      }
      setLive(INITIAL_STATE);
      // Retry the run with force flag
      setTimeout(() => startRun(true), 300);
    } catch {
      setLive(prev => ({ ...prev, statusText: 'Failed to release lock. Try again.', status: 'error' }));
      setTimeout(() => setLive(INITIAL_STATE), 3000);
    }
  }, [live.brandId, live.errorMsg, startRun]);

  const pct = live.totalExpected > 0 ? Math.round((live.received / live.totalExpected) * 100) : 0;

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="mobile-overlay" style={{ display: 'block', position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 998 }} onClick={onClose} />
      )}

      <aside className={`sidebar ${open ? 'mobile-open' : ''}`} style={{
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Run Queries Button */}
        <div style={{ padding: '8px 8px 4px' }}>
          <button
            className={`run-btn${live.running ? ' running' : ''}`}
            id="sidebar-run-btn"
            style={{
              margin: 0,
              opacity: live.running ? 0.6 : 1,
              cursor: live.running ? 'not-allowed' : 'pointer',
              background: live.status === 'done' ? 'var(--green)' : live.status === 'error' ? 'var(--red)' : undefined,
              fontSize: live.status === 'error' && live.errorMsg && live.errorMsg !== 'concurrent' ? '10px' : undefined,
            }}
            title={live.errorMsg && live.errorMsg !== 'concurrent' ? live.errorMsg : undefined}
            disabled={live.running}
            onClick={() => startRun(false)}
          >
            {live.running ? '⏳ RUNNING...' : live.status === 'done' ? '✓ DONE — Refreshing...' : live.status === 'error' ? (live.errorMsg === 'concurrent' ? '⚠ Run in progress' : '❌ ' + (live.statusText.length > 30 ? live.statusText.substring(0, 28) + '...' : live.statusText)) : '▶ RUN QUERIES'}
          </button>

          {/* Force-run button for concurrent lock errors */}
          {live.status === 'error' && live.errorMsg === 'concurrent' && (
            <button
              onClick={forceRun}
              style={{
                width: '100%', marginTop: 4, padding: '6px 8px',
                background: '#e74c3c', color: '#fff', border: 'none',
                borderRadius: 4, cursor: 'pointer', fontSize: 11,
                fontWeight: 600, fontFamily: 'var(--mono)',
              }}
            >
              ⚡ FORCE RUN
            </button>
          )}

          {/* Progress bar + live stats */}
          {(live.running || live.status === 'done') && (
            <div style={{ marginTop: 6, padding: '0 0px' }}>
              <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{
                  width: live.status === 'done' ? '100%' : `${pct}%`,
                  height: '100%', background: 'var(--primary)', borderRadius: 4,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              {/* Live stats row */}
              {live.running && live.received > 0 && (
                <div style={{
                  display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center',
                  fontSize: 10, fontFamily: 'var(--mono)', marginTop: 4, flexWrap: 'wrap',
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0f0', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                    LIVE
                  </span>
                  <span style={{ color: 'var(--green)', fontWeight: 700 }}>{live.foundCount} found</span>
                  <span style={{ color: 'var(--muted)' }}>{live.received - live.foundCount - live.errorCount} not found</span>
                  {live.errorCount > 0 && (
                    <span style={{ color: 'var(--red)', fontWeight: 700 }}>{live.errorCount} error{live.errorCount > 1 ? 's' : ''}</span>
                  )}
                </div>
              )}
              {/* Status text + timer */}
              <div style={{
                fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)',
                marginTop: 3, textAlign: 'center',
              }}>
                {live.statusText}
                {live.running && elapsed ? ` · ${elapsed}` : ''}
              </div>
            </div>
          )}
        </div>


        {/* Nav groups */}
        <nav style={{ flex: 1, padding: '4px 8px' }}>
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="nav-group">{group.label}</div>
              {group.items.map((item) => {
                if ('adminOnly' in item && item.adminOnly && user?.role !== 'admin') return null;
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={onClose}
                    className={`nav-item ${isActive ? 'active' : ''} ${'adminOnly' in item && item.adminOnly ? 'admin-link' : ''}`}
                    style={{ textDecoration: 'none' }}
                  >
                    {item.icon} {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User section */}
        <div style={{ borderTop: '1px solid var(--border)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 500 }}>
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{user?.name || 'User'}</p>
              <p style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--muted)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{user?.plan || 'free'} plan</p>
            </div>
          </div>
          <button onClick={logout} className="logout-btn">
            Sign out
          </button>
        </div>
      </aside>

      <style>{`
        @media(max-width:1023px){
          .sidebar{display:none!important;position:fixed!important;top:52px!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;z-index:999!important;}
          .sidebar.mobile-open{display:flex!important;}
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </>
  );
}
