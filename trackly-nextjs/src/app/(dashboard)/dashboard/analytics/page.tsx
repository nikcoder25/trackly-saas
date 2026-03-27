'use client';

import { useState, useEffect, useMemo } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';

interface KeywordRow {
  prompt: string;
  platform: string;
  total_runs: number;
  mention_count: number;
  mention_rate: string;
  avg_rank: string;
  last_run_at: string;
}

interface Run {
  date?: string;
  sov?: number;
  totalM?: number;
  totalQ?: number;
  sentiment?: { positive?: number; neutral?: number; negative?: number };
  platforms?: Record<string, { sov?: number; mentions?: number; total?: number }>;
}

interface Brand {
  id: string;
  name: string;
  runs?: Run[];
}

type SortKey = 'query' | 'platform' | 'runs' | 'mentions' | 'rate' | 'rank';

export default function AnalyticsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [keywords, setKeywords] = useState<KeywordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('rate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' }).then(r => r.json()).then(d => {
      const b = d.brands || []; setBrands(b); if (b.length) setSelectedBrand(b[0]); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBrand) return;
    fetch(`/api/brands/${selectedBrand.id}/keyword-tracker`, { credentials: 'include' })
      .then(r => r.json()).then(d => setKeywords(d.keywords || []))
      .catch(() => setKeywords([]));
  }, [selectedBrand]);

  const runs = selectedBrand?.runs || [];
  const lastRun = runs.length ? runs[runs.length - 1] : null;

  // Platforms from keywords
  const platforms = useMemo(() => {
    const set = new Set<string>();
    keywords.forEach(k => set.add(k.platform));
    return Array.from(set);
  }, [keywords]);

  // KPIs
  const totalQueries = useMemo(() => new Set(keywords.map(k => k.prompt)).size, [keywords]);
  const avgMentionRate = useMemo(() => {
    if (!keywords.length) return 0;
    return keywords.reduce((s, k) => s + parseFloat(k.mention_rate || '0'), 0) / keywords.length * 100;
  }, [keywords]);
  const bestPerformer = useMemo(() => {
    if (!keywords.length) return null;
    return keywords.reduce((best, k) => parseFloat(k.mention_rate) > parseFloat(best.mention_rate) ? k : best);
  }, [keywords]);
  const worstPerformer = useMemo(() => {
    if (!keywords.length) return null;
    return keywords.reduce((worst, k) => parseFloat(k.mention_rate) < parseFloat(worst.mention_rate) ? k : worst);
  }, [keywords]);

  // Filtered and sorted
  const filtered = useMemo(() => {
    let rows = keywords;
    if (platformFilter !== 'all') rows = rows.filter(k => k.platform === platformFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(k => k.prompt.toLowerCase().includes(q) || k.platform.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case 'query': va = a.prompt.toLowerCase(); vb = b.prompt.toLowerCase(); break;
        case 'platform': va = a.platform; vb = b.platform; break;
        case 'runs': va = a.total_runs; vb = b.total_runs; break;
        case 'mentions': va = a.mention_count; vb = b.mention_count; break;
        case 'rate': va = parseFloat(a.mention_rate); vb = parseFloat(b.mention_rate); break;
        case 'rank': va = parseFloat(a.avg_rank || '999'); vb = parseFloat(b.avg_rank || '999'); break;
        default: va = parseFloat(a.mention_rate); vb = parseFloat(b.mention_rate);
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [keywords, platformFilter, searchQuery, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  // Sentiment from last run
  const sentiment = lastRun?.sentiment || { positive: 0, neutral: 0, negative: 0 };
  const sentTotal = (sentiment.positive || 0) + (sentiment.neutral || 0) + (sentiment.negative || 0);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)] mb-1">Analytics</h1>
      <p className="text-[13px] text-[var(--muted)] mb-4">Statistical analysis, query performance, and trend detection.</p>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">{brands.map(b => (
          <button key={b.id} onClick={() => setSelectedBrand(b)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)]'}`}>{b.name}</button>
        ))}</div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-4">
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Total Queries</p>
          <p className="text-2xl font-extrabold font-mono text-[var(--text)]">{totalQueries}</p>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Avg Mention Rate</p>
          <p className={`text-2xl font-extrabold font-mono ${avgMentionRate >= 50 ? 'text-[var(--green)]' : avgMentionRate > 0 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>{avgMentionRate.toFixed(0)}%</p>
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Best Performer</p>
          <p className="text-sm font-bold text-[var(--green)] truncate">{bestPerformer?.prompt || '—'}</p>
          {bestPerformer && <p className="text-[10px] text-[var(--muted)] font-mono mt-0.5">{(parseFloat(bestPerformer.mention_rate) * 100).toFixed(0)}% on {bestPerformer.platform}</p>}
        </div>
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Worst Performer</p>
          <p className="text-sm font-bold text-[var(--red)] truncate">{worstPerformer?.prompt || '—'}</p>
          {worstPerformer && <p className="text-[10px] text-[var(--muted)] font-mono mt-0.5">{(parseFloat(worstPerformer.mention_rate) * 100).toFixed(0)}% on {worstPerformer.platform}</p>}
        </div>
      </div>

      {/* Sentiment + SOV Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-4">
        {/* Sentiment Distribution */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Sentiment Distribution</h3>
          {sentTotal > 0 ? (
            <>
              <div className="flex gap-0.5 h-6 rounded-full overflow-hidden bg-[var(--bg3)] mb-3">
                <div className="bg-[var(--green)] h-full transition-all" style={{ width: `${((sentiment.positive || 0) / sentTotal) * 100}%` }} />
                <div className="bg-[var(--bg4)] h-full transition-all" style={{ width: `${((sentiment.neutral || 0) / sentTotal) * 100}%` }} />
                <div className="bg-[var(--red)] h-full transition-all" style={{ width: `${((sentiment.negative || 0) / sentTotal) * 100}%` }} />
              </div>
              <div className="flex gap-6 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--green)]" /> Positive <strong className="font-mono">{sentiment.positive || 0}</strong></span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--muted)]" /> Neutral <strong className="font-mono">{sentiment.neutral || 0}</strong></span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[var(--red)]" /> Negative <strong className="font-mono">{sentiment.negative || 0}</strong></span>
              </div>
            </>
          ) : (
            <p className="text-[var(--muted)] text-xs">No sentiment data yet.</p>
          )}
        </div>

        {/* SOV History Mini */}
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-3">SOV History <span className="font-normal">Last {Math.min(runs.length, 10)} runs</span></h3>
          {runs.length > 0 ? (
            <div className="flex items-end gap-1 h-[80px]">
              {runs.slice(-10).map((r, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[8px] font-mono text-[var(--muted)]">{r.sov || 0}%</span>
                  <div className="w-full rounded-t" style={{ height: `${Math.max(4, r.sov || 0)}%`, background: (r.sov || 0) >= 50 ? 'var(--green)' : (r.sov || 0) > 0 ? 'var(--amber)' : 'var(--bg4)', minHeight: 4 }} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[var(--muted)] text-xs">No run data yet.</p>
          )}
        </div>
      </div>

      {/* Query Performance Bars */}
      {keywords.length > 0 && (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] mb-4">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] mb-3">Query Performance</h3>
          <div className="space-y-2">
            {[...new Set(keywords.map(k => k.prompt))].map(prompt => {
              const rows = keywords.filter(k => k.prompt === prompt);
              const totalMent = rows.reduce((s, r) => s + r.mention_count, 0);
              const totalRuns = rows.reduce((s, r) => s + r.total_runs, 0);
              const rate = totalRuns > 0 ? (totalMent / totalRuns) * 100 : 0;
              return (
                <div key={prompt} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--text)] truncate w-48 shrink-0">{prompt}</span>
                  <div className="flex-1 h-[6px] bg-[var(--bg3)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rate}%`, background: rate >= 40 ? 'var(--green)' : rate > 0 ? 'var(--amber)' : 'var(--red)' }} />
                  </div>
                  <span className={`text-xs font-mono font-semibold w-12 text-right ${rate >= 40 ? 'text-[var(--green)]' : rate > 0 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>{rate.toFixed(0)}%</span>
                </div>
              );
            }).slice(0, 15)}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-2 overflow-x-auto">
          <button onClick={() => setPlatformFilter('all')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${platformFilter === 'all' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)]'}`}
          >All Platforms</button>
          {platforms.map(p => (
            <button key={p} onClick={() => setPlatformFilter(platformFilter === p ? 'all' : p)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 ${platformFilter === p ? 'text-white' : 'bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)]'}`}
              style={platformFilter === p ? { background: PLATFORM_COLORS[p] || '#666' } : {}}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[p] || '#666' }} />
              {p}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" placeholder="Search queries..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none placeholder:text-[var(--muted)]" />
        </div>
      </div>

      {/* Data Table */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--muted)]">{keywords.length === 0 ? 'Analytics will populate after your first brand tracking run.' : 'No results match your filters.'}</p>
        </div>
      ) : (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl overflow-hidden overflow-x-auto shadow-[var(--app-shadow)]">
          <table className="w-full text-sm min-w-[700px]">
            <thead><tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('query')}>Query{sortArrow('query')}</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('platform')}>Platform{sortArrow('platform')}</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('runs')}>Runs{sortArrow('runs')}</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('mentions')}>Mentions{sortArrow('mentions')}</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('rate')}>Mention Rate{sortArrow('rate')}</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('rank')}>Avg Rank{sortArrow('rank')}</th>
            </tr></thead>
            <tbody>
              {filtered.map((k, i) => {
                const rate = parseFloat(k.mention_rate) * 100;
                return (
                  <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg3)] transition-colors">
                    <td className="px-4 py-2.5 text-[var(--text)] font-medium max-w-xs truncate">{k.prompt}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[k.platform] || '#666' }} />
                        <span className="text-[var(--muted)]">{k.platform}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--muted)]">{k.total_runs}</td>
                    <td className="px-4 py-2.5 font-mono text-[var(--text)] font-medium">{k.mention_count}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-[5px] bg-[var(--bg3)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${rate}%`, background: rate >= 50 ? 'var(--green)' : rate > 0 ? 'var(--amber)' : 'var(--red)' }} />
                        </div>
                        <span className={`font-mono font-semibold text-xs ${rate >= 50 ? 'text-[var(--green)]' : rate > 0 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>{rate.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--muted)]">{k.avg_rank ? `#${parseFloat(k.avg_rank).toFixed(1)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
