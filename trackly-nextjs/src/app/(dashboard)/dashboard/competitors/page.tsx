'use client';

import { useState, useEffect } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';

interface CompetitorRow { competitor_name: string; platform: string; total_appearances: string; avg_position: string; last_seen: string; }
interface Brand { id: string; name: string; }

export default function CompetitorsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' }).then(r => r.json()).then(d => {
      const b = d.brands || []; setBrands(b); if (b.length) setSelectedBrand(b[0]); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBrand) return;
    fetch(`/api/brands/${selectedBrand.id}/competitor-analysis`, { credentials: 'include' })
      .then(r => r.json()).then(d => setCompetitors(d.competitors || []))
      .catch(() => setCompetitors([]));
  }, [selectedBrand]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  // Group by competitor name
  const grouped: Record<string, CompetitorRow[]> = {};
  competitors.forEach(c => { (grouped[c.competitor_name] ??= []).push(c); });

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Competitors</h1>
      <p className="text-[var(--text-muted)] mb-6">Monitor competitor mentions and co-occurrence</p>
      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">{brands.map(b => (
          <button key={b.id} onClick={() => setSelectedBrand(b)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)]'}`}>{b.name}</button>
        ))}</div>
      )}
      {Object.keys(grouped).length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center"><p className="text-[var(--text-muted)]">No competitor data yet. Add competitors in Brand Setup and run queries to see analysis.</p></div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).sort((a, b) => b[1].reduce((s, r) => s + parseInt(r.total_appearances), 0) - a[1].reduce((s, r) => s + parseInt(r.total_appearances), 0)).map(([name, rows]) => {
            const total = rows.reduce((s, r) => s + parseInt(r.total_appearances), 0);
            const avgPos = rows.reduce((s, r) => s + parseFloat(r.avg_position || '0'), 0) / rows.length;
            return (
              <div key={name} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white">{name}</h3>
                  <span className="text-sm text-[var(--text-muted)]">{total} appearances</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {rows.map((r, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 bg-[var(--bg)] px-3 py-1 rounded-lg text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[r.platform] || '#666' }} />
                      <span className="text-[var(--text-muted)]">{r.platform}</span>
                      <span className="text-white font-medium">{r.total_appearances}x</span>
                      {r.avg_position && <span className="text-[var(--text-muted)]">avg #{parseFloat(r.avg_position).toFixed(1)}</span>}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
