'use client';

import { useState, useEffect, useMemo } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';

interface Brand {
  id: string;
  name: string;
}

interface KeywordRow {
  prompt: string;
  platform: string;
  total_runs: number;
  mention_count: number;
  mention_rate: string;
  avg_rank: string;
  last_run_at: string;
}

export default function QueryPerformancePage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [keywords, setKeywords] = useState<KeywordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState<string>('rate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const b = d.brands || [];
        setBrands(b);
        if (b.length) setSelectedBrand(b[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBrand) return;
    fetch(`/api/brands/${selectedBrand.id}/keyword-tracker`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setKeywords(d.keywords || []))
      .catch(() => setKeywords([]));
  }, [selectedBrand]);

  // Aggregate by query (combine platforms) + per-platform rates for bar chart
  const aggregated = useMemo(() => {
    const map: Record<string, { prompt: string; totalMentions: number; totalRuns: number; platforms: Set<string>; rankSum: number; rankCount: number; perPlatform: Record<string, { mentions: number; total: number }> }> = {};
    keywords.forEach(k => {
      if (!map[k.prompt]) {
        map[k.prompt] = { prompt: k.prompt, totalMentions: 0, totalRuns: 0, platforms: new Set(), rankSum: 0, rankCount: 0, perPlatform: {} };
      }
      const agg = map[k.prompt];
      agg.totalMentions += k.mention_count;
      agg.totalRuns += k.total_runs;
      agg.platforms.add(k.platform);
      if (!agg.perPlatform[k.platform]) agg.perPlatform[k.platform] = { mentions: 0, total: 0 };
      agg.perPlatform[k.platform].mentions += k.mention_count;
      agg.perPlatform[k.platform].total += k.total_runs;
      if (k.avg_rank) {
        agg.rankSum += parseFloat(k.avg_rank);
        agg.rankCount += 1;
      }
    });
    return Object.values(map).map(a => ({
      prompt: a.prompt,
      mentions: a.totalMentions,
      total: a.totalRuns,
      rate: a.totalRuns > 0 ? a.totalMentions / a.totalRuns : 0,
      platforms: Array.from(a.platforms),
      avgRank: a.rankCount > 0 ? a.rankSum / a.rankCount : 0,
      perPlatform: a.perPlatform,
    }));
  }, [keywords]);

  const sorted = useMemo(() => {
    return [...aggregated].sort((a, b) => {
      let va: number, vb: number;
      switch (sortCol) {
        case 'mentions': va = a.mentions; vb = b.mentions; break;
        case 'total': va = a.total; vb = b.total; break;
        case 'rate': va = a.rate; vb = b.rate; break;
        case 'avgRank': va = a.avgRank; vb = b.avgRank; break;
        default: va = a.rate; vb = b.rate;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [aggregated, sortCol, sortDir]);

  const totalQueries = aggregated.length;
  const avgMentionRate = aggregated.length > 0 ? aggregated.reduce((s, a) => s + a.rate, 0) / aggregated.length : 0;
  const bestPerformer = aggregated.length > 0 ? aggregated.reduce((best, a) => a.rate > best.rate ? a : best, aggregated[0]) : null;
  const worstPerformer = aggregated.length > 0 ? aggregated.reduce((worst, a) => a.rate < worst.rate ? a : worst, aggregated[0]) : null;

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  function sortArrow(col: string) {
    if (sortCol !== col) return '';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Query Performance</h1>
          <p className="text-[var(--muted)] mt-1">Monitor mention rates and performance for every tracked keyword across AI platforms.</p>
        </div>
        <a
          href="/dashboard/setup"
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[var(--primary)] hover:opacity-90 transition"
        >
          Manage Queries
        </a>
      </div>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {brands.map(b => (
            <button key={b.id} onClick={() => setSelectedBrand(b)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)]'}`}>{b.name}</button>
          ))}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Total Queries</p>
          <p className="text-2xl font-bold font-mono text-[var(--text)]">{totalQueries}</p>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Avg Mention Rate</p>
          <p className={`text-2xl font-bold font-mono ${avgMentionRate >= 0.5 ? 'text-[var(--green)]' : avgMentionRate > 0 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>
            {(avgMentionRate * 100).toFixed(0)}%
          </p>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Best Performer</p>
          <p className="text-sm font-semibold text-[var(--green)] truncate">{bestPerformer?.prompt || '\u2014'}</p>
          <p className="text-xs font-mono text-[var(--muted)] mt-0.5">{bestPerformer ? `${(bestPerformer.rate * 100).toFixed(0)}%` : ''}</p>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Worst Performer</p>
          <p className="text-sm font-semibold text-[var(--red)] truncate">{worstPerformer?.prompt || '\u2014'}</p>
          <p className="text-xs font-mono text-[var(--muted)] mt-0.5">{worstPerformer ? `${(worstPerformer.rate * 100).toFixed(0)}%` : ''}</p>
        </div>
      </div>

      {/* Horizontal Bar Chart */}
      {sorted.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--muted)]">No query performance data yet. Run tracking queries from Brand Setup to see results here.</p>
        </div>
      ) : (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] p-5">
          {/* Sort controls */}
          <div className="flex items-center gap-3 mb-4 text-[11px]">
            <span className="text-[var(--muted)] font-semibold uppercase tracking-wider">Sort by:</span>
            {[{ key: 'rate', label: 'Rate' }, { key: 'mentions', label: 'Mentions' }, { key: 'total', label: 'Runs' }, { key: 'avgRank', label: 'Rank' }].map(s => (
              <button key={s.key} onClick={() => handleSort(s.key)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${sortCol === s.key ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] bg-[var(--bg3)] hover:text-[var(--text)]'}`}>
                {s.label}{sortArrow(s.key)}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {sorted.map((row, i) => {
              const ratePercent = row.rate * 100;
              return (
                <div key={i}>
                  {/* Query label row */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] font-medium text-[var(--text)] truncate max-w-[60%]">{row.prompt}</span>
                    <div className="flex items-center gap-3 text-[11px] font-mono shrink-0">
                      <span className="text-[var(--muted)]">{row.mentions}/{row.total}</span>
                      <span className={`font-bold ${ratePercent >= 50 ? 'text-[var(--green)]' : ratePercent > 0 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>
                        {ratePercent.toFixed(0)}%
                      </span>
                      {row.avgRank > 0 && <span className="text-[var(--muted)]">#{row.avgRank.toFixed(1)}</span>}
                    </div>
                  </div>
                  {/* Overall bar */}
                  <div className="h-[6px] bg-[var(--bg3)] rounded-full overflow-hidden mb-1.5">
                    <div className="h-full rounded-full transition-all duration-500" style={{
                      width: `${ratePercent}%`,
                      background: ratePercent >= 50 ? 'var(--green)' : ratePercent > 0 ? 'var(--amber)' : 'var(--red)',
                    }} />
                  </div>
                  {/* Per-platform mini bars */}
                  <div className="flex gap-2 flex-wrap">
                    {row.platforms.map(p => {
                      const pp = row.perPlatform[p];
                      const ppRate = pp && pp.total > 0 ? Math.round((pp.mentions / pp.total) * 100) : 0;
                      return (
                        <div key={p} className="flex items-center gap-1.5 text-[10px]">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PLATFORM_COLORS[p] || '#666' }} />
                          <span className="text-[var(--muted)]">{p}</span>
                          <div className="w-16 h-[4px] bg-[var(--bg3)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${ppRate}%`, background: PLATFORM_COLORS[p] || '#666' }} />
                          </div>
                          <span className="font-mono text-[var(--muted)]">{ppRate}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
