'use client';

import { useState, useEffect } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';

interface Brand {
  id: string;
  name: string;
  runs?: Array<{ platforms?: Record<string, { sov?: number; queries?: number; mentions?: number; errors?: number }> }>;
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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-2">Platforms</h1>
      <p className="text-[var(--text-muted)] mb-6">Platform status and share of voice breakdown</p>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {brands.map(b => (
            <button key={b.id} onClick={() => setSelectedBrand(b)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-[var(--text)]' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)]'}`}>{b.name}</button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(PLATFORM_COLORS).map(([name, color]) => {
          const pd = platformData[name] || {};
          const sov = pd.sov;
          const hasData = sov !== undefined;
          return (
            <div key={name} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-4 h-4 rounded-full" style={{ background: color }} />
                <h3 className="font-semibold text-[var(--text)]">{name}</h3>
                {hasData && (
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded ${sov >= 50 ? 'bg-[var(--success-light)] text-[var(--success)]' : sov > 0 ? 'bg-[var(--warning-light)] text-[var(--amber)]' : 'bg-[var(--danger-light)] text-[var(--danger)]'}`}>
                    {sov}% SOV
                  </span>
                )}
              </div>
              {hasData ? (
                <div className="space-y-2 text-sm">
                  <div className="w-full bg-[var(--bg)] rounded-full h-2"><div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(sov, 100)}%`, background: color }} /></div>
                  <div className="flex justify-between text-xs text-[var(--text-muted)]">
                    <span>{pd.mentions || 0} mentions</span>
                    <span>{pd.queries || 0} queries</span>
                    {pd.errors ? <span className="text-[var(--danger)]">{pd.errors} errors</span> : null}
                  </div>
                </div>
              ) : (
                <><p className="text-2xl font-bold text-[var(--text)]">—</p><p className="text-xs text-[var(--text-muted)] mt-1">No data yet</p></>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
