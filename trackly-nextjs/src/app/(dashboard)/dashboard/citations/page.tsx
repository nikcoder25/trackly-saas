'use client';

import { useState, useEffect } from 'react';

interface Brand { id: string; name: string; }
interface CitationDomain { domain: string; count: number; percentage: number; }
interface CitationData { total_citations: number; unique_domains: number; brand_domain_citations: number; top_domains: CitationDomain[]; }

export default function CitationsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [data, setData] = useState<CitationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' }).then(r => r.json()).then(d => {
      const b = d.brands || []; setBrands(b); if (b.length) setSelectedBrand(b[0]); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBrand) return;
    setLoading(true);
    fetch(`/api/brands/${selectedBrand.id}/citation-analysis`, { credentials: 'include' })
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => { setData(null); setLoading(false); });
  }, [selectedBrand]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  const kpis = [
    { label: 'Total Citations', value: data?.total_citations ?? 0, color: 'var(--primary)' },
    { label: 'Unique Domains', value: data?.unique_domains ?? 0, color: 'var(--amber)' },
    { label: 'Brand Domain Citations', value: data?.brand_domain_citations ?? 0, color: 'var(--green)' },
  ];

  const topDomains = data?.top_domains || [];
  const maxCount = topDomains.length > 0 ? Math.max(...topDomains.map(d => d.count)) : 1;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-2">Citation Analysis</h1>
      <p className="text-[var(--muted)] mb-6">Which domains AI platforms cite when answering queries about your industry.</p>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">{brands.map(b => (
          <button key={b.id} onClick={() => setSelectedBrand(b)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)]'}`}>{b.name}</button>
        ))}</div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {kpis.map(k => (
          <div key={k.label} className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] p-5">
            <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)] mb-1">{k.label}</p>
            <p className="text-3xl font-bold" style={{ color: k.color }}>{k.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Top Cited Domains */}
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] p-5">
        <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--muted)] mb-4">Top Cited Domains</p>
        {topDomains.length === 0 ? (
          <p className="text-[var(--muted)] text-sm text-center py-6">No citation data available yet. Run queries to start collecting citation data.</p>
        ) : (
          <div className="space-y-3">
            {topDomains.map((d, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-sm font-medium text-[var(--text)] w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[var(--text)] truncate">{d.domain}</span>
                    <span className="text-xs text-[var(--muted)] ml-2 shrink-0">{d.count} ({d.percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-[var(--bg3)] rounded-full h-2">
                    <div className="h-2 rounded-full bg-[var(--primary)]" style={{ width: `${(d.count / maxCount) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
