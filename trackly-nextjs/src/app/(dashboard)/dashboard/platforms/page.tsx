'use client';

import { useState, useEffect, useMemo } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';

interface PlatformData {
  sov?: number;
  queries?: number;
  mentions?: number;
  total?: number;
  errors?: number;
  latency?: number;
  successRate?: number;
  calls24h?: number;
}

interface Run {
  date?: string;
  platforms?: Record<string, PlatformData>;
}

interface Brand {
  id: string;
  name: string;
  runs?: Run[];
  selected_platforms?: string[];
}

function healthStatus(pd: PlatformData): { label: string; color: string; dot: string } {
  if (!pd || pd.sov === undefined) return { label: 'No Data', color: 'var(--muted)', dot: 'var(--muted)' };
  if (pd.errors && pd.total && pd.errors / pd.total > 0.3) return { label: 'Degraded', color: 'var(--red)', dot: 'var(--red)' };
  if (pd.latency && pd.latency > 5000) return { label: 'Slow', color: 'var(--amber)', dot: 'var(--amber)' };
  return { label: 'Healthy', color: 'var(--green)', dot: 'var(--green)' };
}

export default function PlatformsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { const b = d.brands || []; setBrands(b); if (b.length) setSelectedBrand(b[0]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const latestRun = selectedBrand?.runs?.length ? selectedBrand.runs[selectedBrand.runs.length - 1] : null;
  const platformData = latestRun?.platforms || {};

  // Aggregate stats across last 10 runs for latency/success rate estimates
  const platformStats = useMemo(() => {
    const stats: Record<string, { totalCalls: number; totalErrors: number; avgLatency: number; latencyCount: number }> = {};
    const recentRuns = (selectedBrand?.runs || []).slice(-10);
    recentRuns.forEach(run => {
      if (!run.platforms) return;
      Object.entries(run.platforms).forEach(([name, pd]) => {
        if (!stats[name]) stats[name] = { totalCalls: 0, totalErrors: 0, avgLatency: 0, latencyCount: 0 };
        const s = stats[name];
        s.totalCalls += (pd.total || 0);
        s.totalErrors += (pd.errors || 0);
        if (pd.latency) { s.avgLatency += pd.latency; s.latencyCount++; }
      });
    });
    return stats;
  }, [selectedBrand?.runs]);

  // Summary stats
  const healthyCount = Object.entries(PLATFORM_COLORS).filter(([name]) => {
    const pd = platformData[name];
    return pd && pd.sov !== undefined && healthStatus(pd).label === 'Healthy';
  }).length;
  const totalPlatforms = Object.keys(PLATFORM_COLORS).length;
  const totalErrors = Object.values(platformData).reduce((s, pd) => s + (pd.errors || 0), 0);
  const totalMentions = Object.values(platformData).reduce((s, pd) => s + (pd.mentions || 0), 0);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)] mb-1">Platform Status</h1>
      <p className="text-[13px] text-[var(--muted)] mb-4">API health and configuration for all AI platforms.</p>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {brands.map(b => (
            <button key={b.id} onClick={() => setSelectedBrand(b)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)]'}`}>{b.name}</button>
          ))}
        </div>
      )}

      {/* Health Summary Banner */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 mb-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: healthyCount === totalPlatforms ? 'var(--green)' : healthyCount > 0 ? 'var(--amber)' : 'var(--red)' }} />
          <span className="text-sm text-[var(--text)] font-medium">
            {healthyCount}/{totalPlatforms} platforms healthy
          </span>
        </div>
        <span className="text-xs text-[var(--muted)]">·</span>
        <span className="text-xs text-[var(--muted)]">{totalMentions} total mentions</span>
        {totalErrors > 0 && (
          <>
            <span className="text-xs text-[var(--muted)]">·</span>
            <span className="text-xs text-[var(--red)]">{totalErrors} errors</span>
          </>
        )}
        {latestRun?.date && (
          <>
            <span className="text-xs text-[var(--muted)]">·</span>
            <span className="text-xs text-[var(--muted)]">Last run: {new Date(latestRun.date).toLocaleString()}</span>
          </>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-4">
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Active Platforms</p>
          <p className="text-2xl font-extrabold font-mono text-[var(--text)]">{Object.keys(platformData).length}</p>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Healthy</p>
          <p className="text-2xl font-extrabold font-mono text-[var(--green)]">{healthyCount}</p>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Total Mentions</p>
          <p className="text-2xl font-extrabold font-mono text-[var(--text)]">{totalMentions}</p>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Errors</p>
          <p className={`text-2xl font-extrabold font-mono ${totalErrors > 0 ? 'text-[var(--red)]' : 'text-[var(--green)]'}`}>{totalErrors}</p>
        </div>
      </div>

      {/* Platform Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(PLATFORM_COLORS).map(([name, color]) => {
          const pd = platformData[name] || {} as PlatformData;
          const sov = pd.sov;
          const hasData = sov !== undefined;
          const health = healthStatus(pd);
          const stats = platformStats[name];
          const successRate = stats && stats.totalCalls > 0
            ? Math.round(((stats.totalCalls - stats.totalErrors) / stats.totalCalls) * 100)
            : null;
          const avgLatency = stats && stats.latencyCount > 0
            ? Math.round(stats.avgLatency / stats.latencyCount)
            : null;

          return (
            <div key={name} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] hover:shadow-[var(--app-shadow-lg)] hover:-translate-y-px transition" style={{ borderLeft: `3px solid ${color}` }}>
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="w-4 h-4 rounded-full" style={{ background: color }} />
                <h3 className="font-semibold text-[var(--text)]">{name}</h3>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: health.dot }} />
                  <span className="text-[10px] font-medium" style={{ color: health.color }}>{health.label}</span>
                </div>
              </div>

              {hasData ? (
                <>
                  {/* SOV */}
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-2xl font-extrabold font-mono" style={{ color: sov >= 50 ? 'var(--green)' : sov > 0 ? 'var(--amber)' : 'var(--muted)' }}>{sov}%</span>
                    <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">SOV</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-[var(--bg)] rounded-full h-2 mb-3">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(sov, 100)}%`, background: color }} />
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">Mentions</span>
                      <span className="font-mono text-[var(--text)] font-medium">{pd.mentions || 0}/{pd.total || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--muted)]">Queries</span>
                      <span className="font-mono text-[var(--text)] font-medium">{pd.queries || pd.total || 0}</span>
                    </div>
                    {successRate !== null && (
                      <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Success Rate</span>
                        <span className={`font-mono font-medium ${successRate >= 90 ? 'text-[var(--green)]' : successRate >= 70 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>{successRate}%</span>
                      </div>
                    )}
                    {avgLatency !== null && (
                      <div className="flex justify-between">
                        <span className="text-[var(--muted)]">Avg Latency</span>
                        <span className={`font-mono font-medium ${avgLatency < 3000 ? 'text-[var(--green)]' : avgLatency < 6000 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>{(avgLatency / 1000).toFixed(1)}s</span>
                      </div>
                    )}
                    {(pd.errors || 0) > 0 && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-[var(--muted)]">Errors</span>
                        <span className="font-mono text-[var(--red)] font-medium">{pd.errors}</span>
                      </div>
                    )}
                    {stats && stats.totalCalls > 0 && (
                      <div className="flex justify-between col-span-2">
                        <span className="text-[var(--muted)]">Total Calls (last 10 runs)</span>
                        <span className="font-mono text-[var(--text)] font-medium">{stats.totalCalls}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-2xl font-bold text-[var(--muted)]">—</p>
                  <p className="text-xs text-[var(--muted)] mt-1">No data yet. Run queries to see results.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
