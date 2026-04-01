'use client';

import { useState, useEffect, useMemo } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';
import { useBrandData } from '@/hooks/useBrandData';
import { useBrands } from '@/contexts/BrandContext';

interface PlatformData {
  sov?: number;
  queries?: number;  // stored by run route as 'queries' (total query count per platform)
  mentions?: number;
  total?: number;    // alias for queries in some contexts
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

// Normalize platform data — handles both number (SOV%) and object formats
function normPlatform(pd: unknown): { sov: number; total: number; mentions: number; errors: number } {
  if (typeof pd === 'number') return { sov: pd, total: pd > 0 ? 1 : 0, mentions: pd > 0 ? 1 : 0, errors: 0 };
  if (typeof pd === 'object' && pd !== null) {
    const o = pd as Record<string, number>;
    return { sov: o.sov || 0, total: o.total || o.queries || 0, mentions: o.mentions || 0, errors: o.errors || 0 };
  }
  return { sov: 0, total: 0, mentions: 0, errors: 0 };
}

function healthStatus(pd: unknown): { label: string; color: string; dot: string } {
  const n = normPlatform(pd);
  if (n.sov === 0 && n.total === 0 && n.mentions === 0) return { label: 'No Data', color: 'var(--muted)', dot: 'var(--muted)' };
  if (n.errors && n.total && n.errors / n.total > 0.3) return { label: 'Degraded', color: 'var(--red)', dot: 'var(--red)' };
  return { label: 'Healthy', color: 'var(--green)', dot: 'var(--green)' };
}

export default function PlatformsPage() {
  const { brand: rawBrand, brands, loading } = useBrandData({ fullData: true });
  const selectedBrand = rawBrand as Brand | null;
  const { selectBrandById } = useBrands();

  const latestRun = selectedBrand?.runs?.length ? selectedBrand.runs[selectedBrand.runs.length - 1] : null;
  const platformData = latestRun?.platforms || {};

  // Aggregate stats across last 10 runs
  const platformStats = useMemo(() => {
    const stats: Record<string, { totalCalls: number; totalErrors: number }> = {};
    const recentRuns = (selectedBrand?.runs || []).slice(-10);
    recentRuns.forEach(run => {
      if (!run.platforms) return;
      Object.entries(run.platforms).forEach(([name, pd]) => {
        if (!stats[name]) stats[name] = { totalCalls: 0, totalErrors: 0 };
        const n = normPlatform(pd);
        stats[name].totalCalls += n.total;
        stats[name].totalErrors += n.errors;
      });
    });
    return stats;
  }, [selectedBrand?.runs]);

  // Summary stats
  const healthyCount = Object.entries(PLATFORM_COLORS).filter(([name]) => {
    const pd = platformData[name];
    if (pd === undefined || pd === null) return false;
    return healthStatus(pd).label === 'Healthy';
  }).length;
  const totalPlatforms = Object.keys(PLATFORM_COLORS).length;
  const totalErrors = Object.values(platformData).reduce((s, pd) => s + normPlatform(pd).errors, 0);
  const totalMentions = Object.values(platformData).reduce((s, pd) => s + normPlatform(pd).mentions, 0);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)] mb-1">Platform Status</h1>
      <p className="text-[13px] text-[var(--muted)] mb-4">API health and configuration for all AI platforms.</p>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {brands.map(b => (
            <button key={b.id} onClick={() => selectBrandById(b.id)}
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
          const raw = platformData[name];
          const n = normPlatform(raw);
          const hasData = raw !== undefined && raw !== null;
          const health = healthStatus(raw);
          const stats = platformStats[name];
          const successRate = stats && stats.totalCalls > 0
            ? Math.round(((stats.totalCalls - stats.totalErrors) / stats.totalCalls) * 100)
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
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-2xl font-extrabold font-mono" style={{ color: n.sov >= 50 ? 'var(--green)' : n.sov > 0 ? 'var(--amber)' : 'var(--muted)' }}>{n.sov}%</span>
                    <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider">SOV</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-[var(--bg)] rounded-full h-1.5 mb-4">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(n.sov, 100)}%`, background: color }} />
                  </div>

                  {/* Stats */}
                  <div className="space-y-2 text-[12px]">
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--muted)]">Mentions</span>
                      <span className="font-mono text-[var(--text)] font-medium">{n.mentions} / {n.total}</span>
                    </div>
                    {successRate !== null && (
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--muted)]">Success Rate</span>
                        <span className={`font-mono font-medium ${successRate >= 90 ? 'text-[var(--green)]' : successRate >= 70 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>{successRate}%</span>
                      </div>
                    )}
                    {n.errors > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--muted)]">Errors</span>
                        <span className="font-mono text-[var(--red)] font-medium">{n.errors}</span>
                      </div>
                    )}
                    {stats && stats.totalCalls > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-[var(--muted)]">Total Calls <span className="text-[10px]">(last 10 runs)</span></span>
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
