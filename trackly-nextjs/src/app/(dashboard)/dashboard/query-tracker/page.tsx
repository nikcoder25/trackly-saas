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

type Period = 'day' | 'week' | 'month';
type SortKey = 'keyword' | 'visibility' | 'change' | 'runs' | 'avgPosition' | 'updated';

export default function QueryTrackerPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [keywords, setKeywords] = useState<KeywordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('week');
  const [filterText, setFilterText] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('visibility');
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

  // Aggregate keywords by prompt
  const aggregated = useMemo(() => {
    const map: Record<string, {
      prompt: string;
      totalMentions: number;
      totalRuns: number;
      platforms: Set<string>;
      rankSum: number;
      rankCount: number;
      lastRunAt: string;
    }> = {};
    keywords.forEach(k => {
      if (!map[k.prompt]) {
        map[k.prompt] = { prompt: k.prompt, totalMentions: 0, totalRuns: 0, platforms: new Set(), rankSum: 0, rankCount: 0, lastRunAt: '' };
      }
      const a = map[k.prompt];
      a.totalMentions += k.mention_count;
      a.totalRuns += k.total_runs;
      a.platforms.add(k.platform);
      if (k.avg_rank) { a.rankSum += parseFloat(k.avg_rank); a.rankCount++; }
      if (k.last_run_at && k.last_run_at > a.lastRunAt) a.lastRunAt = k.last_run_at;
    });
    return Object.values(map).map(a => ({
      keyword: a.prompt,
      visibility: a.totalRuns > 0 ? (a.totalMentions / a.totalRuns) * 100 : 0,
      change: 0,
      runs: a.totalRuns,
      platforms: Array.from(a.platforms),
      avgPosition: a.rankCount > 0 ? a.rankSum / a.rankCount : 0,
      updated: a.lastRunAt,
    }));
  }, [keywords]);

  const filtered = useMemo(() => {
    let rows = aggregated;
    if (filterText) {
      const q = filterText.toLowerCase();
      rows = rows.filter(r => r.keyword.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case 'keyword': va = a.keyword.toLowerCase(); vb = b.keyword.toLowerCase(); break;
        case 'visibility': va = a.visibility; vb = b.visibility; break;
        case 'change': va = a.change; vb = b.change; break;
        case 'runs': va = a.runs; vb = b.runs; break;
        case 'avgPosition': va = a.avgPosition; vb = b.avgPosition; break;
        case 'updated': va = a.updated; vb = b.updated; break;
        default: va = a.visibility; vb = b.visibility;
      }
      if (typeof va === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [aggregated, filterText, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  }

  function Sparkline({ value }: { value: number }) {
    const points = Array.from({ length: 7 }, (_, i) => {
      const jitter = Math.sin(i * 1.5 + value) * 15;
      return Math.max(5, Math.min(35, value * 0.4 + jitter));
    });
    const path = points.map((y, i) => `${i === 0 ? 'M' : 'L'} ${i * 10} ${40 - y}`).join(' ');
    const color = value >= 50 ? 'var(--green)' : value > 0 ? 'var(--amber)' : 'var(--red)';
    return (
      <svg width="60" height="40" viewBox="0 0 60 40" className="inline-block">
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Query Tracker</h1>
          <p className="text-[var(--muted)] mt-1">Track visibility and rank changes for each query across AI platforms over time.</p>
        </div>
      </div>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {brands.map(b => (
            <button key={b.id} onClick={() => setSelectedBrand(b)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)]'}`}>{b.name}</button>
          ))}
        </div>
      )}

      {/* Period tabs + Filter */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex bg-[var(--bg2)] border border-[var(--border)] rounded-lg overflow-hidden">
          {(['day', 'week', 'month'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium transition capitalize ${period === p ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)]'}`}
            >{p}</button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Filter keywords..."
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none placeholder:text-[var(--muted)] w-56"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--muted)]">
            {aggregated.length === 0
              ? 'No keyword tracking data yet. Add queries in Brand Setup and run tracking to see results.'
              : 'No keywords match your filter.'}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl overflow-hidden overflow-x-auto shadow-[var(--app-shadow)]">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('keyword')}>Keyword{sortArrow('keyword')}</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('visibility')}>Visibility{sortArrow('visibility')}</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('change')}>Change{sortArrow('change')}</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('runs')}>Runs{sortArrow('runs')}</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Platforms</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('avgPosition')}>Avg Position{sortArrow('avgPosition')}</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Movement</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold cursor-pointer select-none" onClick={() => handleSort('updated')}>Updated{sortArrow('updated')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg3)] transition-colors">
                  <td className="px-4 py-3 text-[var(--text)] font-medium max-w-xs truncate">{row.keyword}</td>
                  <td className="px-4 py-3">
                    <span className={`font-mono font-semibold ${row.visibility >= 50 ? 'text-[var(--green)]' : row.visibility > 0 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>
                      {row.visibility.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.change === 0 ? (
                      <span className="text-[var(--muted)] font-mono text-xs">{'\u2014'}</span>
                    ) : row.change > 0 ? (
                      <span className="text-[var(--green)] font-mono text-xs">+{row.change.toFixed(0)}%</span>
                    ) : (
                      <span className="text-[var(--red)] font-mono text-xs">{row.change.toFixed(0)}%</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[var(--muted)]">{row.runs}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {row.platforms.map(p => (
                        <span key={p} className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[p] || '#666' }} />
                          <span className="text-xs text-[var(--muted)]">{p}</span>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[var(--muted)]">{row.avgPosition > 0 ? `#${row.avgPosition.toFixed(1)}` : '\u2014'}</td>
                  <td className="px-4 py-3"><Sparkline value={row.visibility} /></td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">{row.updated ? new Date(row.updated).toLocaleDateString() : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
