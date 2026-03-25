'use client';

import { useState, useEffect } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';

interface KeywordRow { prompt: string; platform: string; total_runs: number; mention_count: number; mention_rate: string; avg_rank: string; last_run_at: string; }
interface Brand { id: string; name: string; }

export default function AnalyticsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [keywords, setKeywords] = useState<KeywordRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-2">Analytics</h1>
      <p className="text-[var(--text-muted)] mb-6">Query performance and keyword tracking</p>
      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">{brands.map(b => (
          <button key={b.id} onClick={() => setSelectedBrand(b)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-[var(--text)]' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)]'}`}>{b.name}</button>
        ))}</div>
      )}
      {keywords.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center"><p className="text-[var(--text-muted)]">Analytics will populate after your first brand tracking run.</p></div>
      ) : (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead><tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium">Query</th>
              <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium">Platform</th>
              <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium">Runs</th>
              <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium">Mentions</th>
              <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium">Mention Rate</th>
              <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium">Avg Rank</th>
            </tr></thead>
            <tbody>
              {keywords.map((k, i) => {
                const rate = parseFloat(k.mention_rate) * 100;
                return (
                  <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg3)]">
                    <td className="px-4 py-2.5 text-[var(--text)] max-w-xs truncate">{k.prompt}</td>
                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[k.platform] || '#666' }} /><span className="text-[var(--text-muted)]">{k.platform}</span></span></td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{k.total_runs}</td>
                    <td className="px-4 py-2.5 text-[var(--text)] font-medium">{k.mention_count}</td>
                    <td className="px-4 py-2.5"><span className={`font-medium ${rate >= 50 ? 'text-[var(--green)]' : rate > 0 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>{rate.toFixed(0)}%</span></td>
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{k.avg_rank ? `#${parseFloat(k.avg_rank).toFixed(1)}` : '—'}</td>
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
