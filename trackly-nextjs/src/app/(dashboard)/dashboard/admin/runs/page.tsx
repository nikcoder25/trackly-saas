'use client';

/**
 * Admin operator console for active runs + cron locks.
 *
 * Two tables:
 *   1. Active Runs - every active_runs row at status='running'.
 *      Per-row "Reap" button calls POST /api/admin/runs/reap with
 *      { runId } (surgical, force=true). Bulk "Reap all stale"
 *      requires an explicit minAgeMinutes (default 30, hard-floor
 *      RUN_WATCHDOG_STALE_MINUTES enforced server-side).
 *   2. Cron Locks - every Redis + Postgres lock holder. Per-row
 *      "Force release" button calls POST /api/admin/locks/[name]/release.
 *      Both require confirm() - neither operation has a friendly
 *      undo and force-release of a live scheduler lock can cause
 *      double dispatch.
 *
 * Auto-refreshes every 10s while mounted.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/dashboard/Toast';

interface ActiveRun {
  runId: string;
  brandId: string;
  userId: string;
  brandName: string | null;
  ownerEmail: string | null;
  status: string;
  totalExpected: number;
  received: number;
  foundCount: number;
  errorCount: number;
  platforms: string[];
  startedAt: string;
  updatedAt: string | null;
  lastAttemptAt: string | null;
  lastPlatformAttempted: string | null;
  lastQueryAttempted: string | null;
  ageSeconds: number;
  noProgressSeconds: number;
  stale: boolean;
}

interface CronLock {
  name: string;
  source: 'redis' | 'postgres';
  lockedAt: string | null;
  ageSeconds: number | null;
  instanceId: string | null;
  ttlMs: number | null;
}

function fmtAge(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '-';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtTtl(ms: number | null): string {
  if (ms === null || ms === undefined) return '-';
  return fmtAge(Math.floor(ms / 1000));
}

export default function AdminRunsPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [runs, setRuns] = useState<ActiveRun[]>([]);
  const [staleThreshold, setStaleThreshold] = useState<number>(10);
  const [locks, setLocks] = useState<CronLock[]>([]);
  const [redisAvailable, setRedisAvailable] = useState<boolean>(false);
  const [redisError, setRedisError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bulkMinAge, setBulkMinAge] = useState<number>(30);
  const [acting, setActing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/admin/runs/active', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/locks', { credentials: 'include', cache: 'no-store' }),
      ]);
      if (r1.ok) {
        const d = await r1.json();
        setRuns(d.runs || []);
        setStaleThreshold(d.staleThresholdMinutes || 10);
      }
      if (r2.ok) {
        const d = await r2.json();
        setLocks(d.locks || []);
        setRedisAvailable(!!d.redis?.available);
        setRedisError(d.redis?.error || null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }
  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center max-w-md">
          <p className="text-lg font-semibold text-[var(--red)] mb-2">Access Denied</p>
          <p className="text-sm text-[var(--muted)]">Admin panel is only accessible to administrators.</p>
        </div>
      </div>
    );
  }

  async function reapRun(runId: string, brandName: string | null) {
    if (!confirm(`Force-reap run ${runId} (brand: ${brandName || '?'})?\n\nThis flips status='running' to 'error' and unblocks the next /run trigger for the brand. If the underlying worker is actually still doing work, this will leave it without a row to write to (its terminal write becomes a no-op). Confirm?`)) return;
    setActing(runId);
    try {
      const res = await fetch('/api/admin/runs/reap', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      const d = await res.json();
      if (!res.ok) { toast(d.error || 'Reap failed', 'error'); return; }
      toast(`Reaped 1 run`);
      refresh();
    } catch (e) {
      toast('Reap failed: ' + (e as Error).message, 'error');
    } finally {
      setActing(null);
    }
  }

  async function reapAllStale() {
    if (bulkMinAge < staleThreshold) {
      toast(`minAgeMinutes must be >= ${staleThreshold} (the env-default watchdog threshold)`, 'error');
      return;
    }
    if (!confirm(`Bulk-reap every running row with no progress for >= ${bulkMinAge} minutes?\n\nThis hits the staleness gate (no force flag), so healthy in-flight runs are safe. The reaper will only flip rows that haven't advanced 'updated_at' in the window.`)) return;
    setActing('__bulk__');
    try {
      const res = await fetch('/api/admin/runs/reap', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'stale', minAgeMinutes: bulkMinAge }),
      });
      const d = await res.json();
      if (!res.ok) { toast(d.error || 'Bulk reap failed', 'error'); return; }
      toast(`Reaped ${d.count} run${d.count === 1 ? '' : 's'}`);
      refresh();
    } catch (e) {
      toast('Bulk reap failed: ' + (e as Error).message, 'error');
    } finally {
      setActing(null);
    }
  }

  async function releaseLock(name: string) {
    if (!confirm(`Force-release cron lock "${name}"?\n\nThis bypasses the Lua compare-and-delete and DELETEs both the Redis key and the Postgres row. If the previous holder is still doing work, the next tick can start in parallel. Per-brand work is still de-duplicated by the active_runs partial unique index, so the worst case is two scheduler ticks racing the same loop.`)) return;
    setActing('lock:' + name);
    try {
      const res = await fetch(`/api/admin/locks/${encodeURIComponent(name)}/release`, {
        method: 'POST', credentials: 'include',
      });
      const d = await res.json();
      if (!res.ok) { toast(d.error || 'Release failed', 'error'); return; }
      toast(`Released "${name}" (redis: ${d.redis?.deleted ?? 0}, postgres: ${d.postgres?.deleted ?? 0})`);
      refresh();
    } catch (e) {
      toast('Release failed: ' + (e as Error).message, 'error');
    } finally {
      setActing(null);
    }
  }

  return (
    <div>
      <h1 className="view-title">Runs &amp; Locks</h1>
      <p className="view-sub" style={{ marginBottom: 14 }}>
        Active runs across the fleet and cron lock state. Auto-refresh every 10s.
        Stale threshold: <code>{staleThreshold}</code> minutes.
      </p>

      {loading && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      )}

      {/* ─── Active Runs ─── */}
      <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 8, marginBottom: 8, color: 'var(--text)' }}>
        Active Runs ({runs.length})
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Reap all stale ≥</span>
        <input
          type="number"
          min={staleThreshold}
          value={bulkMinAge}
          onChange={e => setBulkMinAge(parseInt(e.target.value, 10) || staleThreshold)}
          style={{ width: 60, height: 26, padding: '0 6px', fontSize: 12, fontFamily: 'var(--mono)', background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4 }}
        />
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>minutes</span>
        <button
          onClick={reapAllStale}
          disabled={acting !== null || bulkMinAge < staleThreshold}
          style={{ height: 26, padding: '0 10px', fontSize: 11, fontWeight: 600, background: 'var(--amber, #f59e0b)', color: '#fff', border: 'none', borderRadius: 4, cursor: acting === null && bulkMinAge >= staleThreshold ? 'pointer' : 'not-allowed', opacity: acting === '__bulk__' ? 0.5 : 1 }}
        >
          {acting === '__bulk__' ? 'Reaping…' : 'Reap all stale'}
        </button>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>(min ≥ {staleThreshold})</span>
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'visible', marginBottom: 24 }}>
        {runs.length === 0 && !loading && (
          <div style={{ padding: 18, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
            No active runs.
          </div>
        )}
        {runs.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 720 }}>
            <thead style={{ background: 'var(--bg3, rgba(0,0,0,.04))' }}>
              <tr>
                <th style={th}>Brand</th>
                <th style={th}>Owner</th>
                <th style={th}>Run id</th>
                <th style={th}>Age</th>
                <th style={th}>No progress</th>
                <th style={th}>Last attempt</th>
                <th style={th}>Progress</th>
                <th style={th}>Errs</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.runId} style={{ borderTop: '1px solid var(--border)', background: r.stale ? 'rgba(239,68,68,.04)' : undefined }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{r.brandName || '(no name)'}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>{r.brandId}</div>
                  </td>
                  <td style={td}>{r.ownerEmail || <span style={{ color: 'var(--muted)' }}>-</span>}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.runId}</td>
                  <td style={td}>{fmtAge(r.ageSeconds)}</td>
                  <td style={{ ...td, color: r.stale ? 'var(--red)' : undefined, fontWeight: r.stale ? 700 : undefined }}>
                    {fmtAge(r.noProgressSeconds)}
                    {r.stale && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'var(--red)', color: '#fff' }}>STALE</span>}
                  </td>
                  <td style={td}>
                    {r.lastPlatformAttempted ? (
                      <span><span style={{ fontWeight: 600 }}>{r.lastPlatformAttempted}</span>{r.lastQueryAttempted ? ` · ${r.lastQueryAttempted.slice(0, 30)}…` : ''}</span>
                    ) : <span style={{ color: 'var(--muted)' }}>-</span>}
                  </td>
                  <td style={td}>{r.received}/{r.totalExpected}</td>
                  <td style={td}>{r.errorCount || 0}</td>
                  <td style={td}>
                    <button
                      onClick={() => reapRun(r.runId, r.brandName)}
                      disabled={acting !== null}
                      style={{ height: 22, padding: '0 8px', fontSize: 10, fontWeight: 600, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 3, cursor: acting === null ? 'pointer' : 'not-allowed', opacity: acting === r.runId ? 0.5 : 1 }}
                    >
                      {acting === r.runId ? '…' : 'Reap'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ─── Cron Locks ─── */}
      <h2 style={{ fontSize: 14, fontWeight: 700, marginTop: 8, marginBottom: 8, color: 'var(--text)' }}>
        Cron Locks ({locks.length})
        {!redisAvailable && (
          <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(245,158,11,.12)', color: 'var(--amber, #f59e0b)' }}>
            Redis unavailable{redisError ? ` (${redisError})` : ''}
          </span>
        )}
      </h2>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'visible' }}>
        {locks.length === 0 && !loading && (
          <div style={{ padding: 18, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
            No locks held.
          </div>
        )}
        {locks.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', minWidth: 720 }}>
            <thead style={{ background: 'var(--bg3, rgba(0,0,0,.04))' }}>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Source</th>
                <th style={th}>Locked at / TTL</th>
                <th style={th}>Age</th>
                <th style={th}>Instance id</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {locks.map(l => (
                <tr key={`${l.source}:${l.name}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 600 }}>{l.name}</td>
                  <td style={td}>
                    <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: l.source === 'redis' ? 'rgba(99,102,241,.1)' : 'rgba(34,197,94,.1)', color: l.source === 'redis' ? 'var(--primary)' : 'var(--green)' }}>
                      {l.source.toUpperCase()}
                    </span>
                  </td>
                  <td style={td}>
                    {l.source === 'redis' ? `TTL ${fmtTtl(l.ttlMs)}` : (l.lockedAt || <span style={{ color: 'var(--muted)' }}>-</span>)}
                  </td>
                  <td style={td}>{fmtAge(l.ageSeconds)}</td>
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 10 }}>{l.instanceId || <span style={{ color: 'var(--muted)' }}>-</span>}</td>
                  <td style={td}>
                    <button
                      onClick={() => releaseLock(l.name)}
                      disabled={acting !== null}
                      style={{ height: 22, padding: '0 8px', fontSize: 10, fontWeight: 600, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 3, cursor: acting === null ? 'pointer' : 'not-allowed', opacity: acting === 'lock:' + l.name ? 0.5 : 1 }}
                    >
                      {acting === 'lock:' + l.name ? '…' : 'Release'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '.5px',
  color: 'var(--muted)',
};

const td: React.CSSProperties = {
  padding: '8px 10px',
  verticalAlign: 'top',
  color: 'var(--text)',
};
