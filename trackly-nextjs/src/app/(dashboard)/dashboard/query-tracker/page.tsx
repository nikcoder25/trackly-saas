'use client';

import { useState, useEffect } from 'react';

interface KWData { query: string; mentionRate: number; change: number; totalRuns: number; platformCount: number; avgPosition: number; lastUpdated: string; }

export default function QueryTrackerPage() {
  const [data, setData] = useState<KWData[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('day');
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState('keyword');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const b = d.brands?.[0];
        if (b) return fetch(`/api/brands/${b.id}/keyword-tracker?period=${period}`, { credentials: 'include' });
        setLoading(false);
      })
      .then(r => r?.json())
      .then(d => { if (d?.keywords) setData(d.keywords); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  const filtered = data.filter(d => d.query.toLowerCase().includes(filter.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[sortKey === 'keyword' ? 'query' : sortKey];
    const bVal = (b as unknown as Record<string, unknown>)[sortKey === 'keyword' ? 'query' : sortKey];
    if (typeof aVal === 'number' && typeof bVal === 'number') return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
  });

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Query Tracker</h1>
      <p className="text-[13px] text-[var(--muted)] mt-1 mb-4">Track visibility and rank changes for each query across AI platforms over time.</p>

      {/* Period tabs */}
      <div className="flex gap-0 mb-3">
        {['day', 'week', 'month'].map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-4 py-2 text-xs font-semibold border transition ${period === p ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'bg-[var(--bg2)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]'} ${p === 'day' ? 'rounded-l-md' : p === 'month' ? 'rounded-r-md' : ''}`}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Type to filter keywords"
        className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] text-sm px-3 py-2 rounded-md mb-3 focus:border-[var(--primary)] focus:outline-none transition" />

      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 text-[var(--muted)] text-sm">No keyword data yet.</div>
        ) : (
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="border-b-2 border-[var(--border)] bg-[var(--bg)]">
                {[['keyword','Keyword'],['mentionRate','Visibility'],['change','Change'],['totalRuns','Runs'],['platformCount','Platforms'],['avgPosition','Avg Position'],['lastUpdated','Updated']].map(([k,l]) => (
                  <th key={k} onClick={() => toggleSort(k)} className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--muted)] cursor-pointer hover:text-[var(--text)] text-left">
                    {l} {sortKey === k ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => (
                <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--bg3)] transition">
                  <td className="px-3 py-2.5 font-medium text-[var(--text)]">{d.query}</td>
                  <td className="px-3 py-2.5 font-mono font-bold" style={{ color: d.mentionRate >= 50 ? 'var(--green)' : d.mentionRate > 0 ? 'var(--amber)' : 'var(--muted)' }}>{d.mentionRate}%</td>
                  <td className="px-3 py-2.5 font-mono font-bold" style={{ color: d.change > 0 ? 'var(--green)' : d.change < 0 ? 'var(--red)' : 'var(--muted)' }}>{d.change > 0 ? '+' : ''}{d.change}%</td>
                  <td className="px-3 py-2.5 font-mono">{d.totalRuns}</td>
                  <td className="px-3 py-2.5 font-mono">{d.platformCount}</td>
                  <td className="px-3 py-2.5 font-mono">{d.avgPosition || '--'}</td>
                  <td className="px-3 py-2.5 text-[var(--muted)] text-xs">{d.lastUpdated ? new Date(d.lastUpdated).toLocaleDateString() : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
