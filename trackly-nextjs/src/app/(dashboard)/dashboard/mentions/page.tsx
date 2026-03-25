'use client';

import { useState, useEffect } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';

interface Mention {
  query: string;
  platform: string;
  mentioned: boolean;
  sentiment?: string;
  position?: number;
  model?: string;
  date?: string;
  snippet?: string;
}

interface Brand {
  id: string;
  name: string;
  mentions?: Mention[];
  runs?: Array<{ allResults?: Mention[]; date?: string }>;
}

export default function MentionsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mentioned' | 'not_mentioned'>('all');

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

  // Get mentions from latest run
  const latestRun = selectedBrand?.runs?.length ? selectedBrand.runs[selectedBrand.runs.length - 1] : null;
  const results: Mention[] = latestRun?.allResults || selectedBrand?.mentions || [];
  const filtered = results.filter(m => {
    if (filter === 'mentioned') return m.mentioned;
    if (filter === 'not_mentioned') return !m.mentioned;
    return true;
  });

  const mentionRate = results.length ? Math.round((results.filter(m => m.mentioned).length / results.length) * 100) : 0;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Mentions</h1>
          <p className="text-[var(--text-muted)] mt-1">Track AI mentions across all platforms</p>
        </div>
      </div>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {brands.map(b => (
            <button key={b.id} onClick={() => setSelectedBrand(b)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-[var(--text)]' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)]'}`}>{b.name}</button>
          ))}
        </div>
      )}

      {results.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--text-muted)]">No mention data yet. Run queries from Brand Setup to see results here.</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs text-[var(--text-muted)]">Total Results</p>
              <p className="text-xl font-bold text-[var(--text)]">{results.length}</p>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs text-[var(--text-muted)]">Mentioned</p>
              <p className="text-xl font-bold text-[var(--green)]">{results.filter(m => m.mentioned).length}</p>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs text-[var(--text-muted)]">Not Mentioned</p>
              <p className="text-xl font-bold text-[var(--red)]">{results.filter(m => !m.mentioned).length}</p>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4">
              <p className="text-xs text-[var(--text-muted)]">Mention Rate</p>
              <p className="text-xl font-bold" style={{ color: mentionRate >= 50 ? 'var(--green)' : mentionRate > 0 ? 'var(--amber)' : 'var(--red)' }}>{mentionRate}%</p>
            </div>
          </div>

          {/* Filter */}
          <div className="flex gap-2 mb-4">
            {(['all', 'mentioned', 'not_mentioned'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filter === f ? 'bg-[var(--primary)] text-[var(--text)]' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)]'}`}>
                {f === 'all' ? 'All' : f === 'mentioned' ? 'Mentioned' : 'Not Mentioned'}
              </button>
            ))}
          </div>

          {/* Results list */}
          <div className="space-y-2">
            {filtered.map((m, i) => (
              <div key={i} className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg p-4 flex items-center gap-4">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.mentioned ? 'bg-[var(--green)]' : 'bg-[var(--red)]'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--text)] truncate">{m.query}</p>
                  <div className="flex gap-3 mt-1 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[m.platform] || '#666' }} />
                      {m.platform}
                    </span>
                    {m.position && <span>Rank #{m.position}</span>}
                    {m.sentiment && <span className={m.sentiment === 'positive' ? 'text-[var(--green)]' : m.sentiment === 'negative' ? 'text-[var(--red)]' : ''}>{m.sentiment}</span>}
                    {m.model && <span>{m.model}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
