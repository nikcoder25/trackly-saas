'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { PLATFORM_COLORS } from '@/lib/constants';

const SovChart = dynamic(() => import('@/components/dashboard/SovChart'), { ssr: false });

interface Brand {
  id: string; name: string;
  sovHistory?: Array<{ date: string; sov: number; platforms?: Record<string, number> }>;
  runs?: Array<{ date?: string; sov?: number; platforms?: Record<string, { sov?: number }> }>;
}

export default function TrendsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' }).then(r => r.json()).then(d => {
      const b = d.brands || []; setBrands(b); if (b.length) setSelectedBrand(b[0]); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const sovHistory = selectedBrand?.sovHistory || [];
  const trendData = sovHistory.length > 0 ? sovHistory
    : (selectedBrand?.runs || []).filter(r => r.date && r.sov !== undefined).map(r => ({
        date: r.date!, sov: r.sov!,
        platforms: r.platforms ? Object.fromEntries(Object.entries(r.platforms).map(([k, v]) => [k, v.sov || 0])) : {},
      }));

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)] mb-1">SOV Trends</h1>
      <p className="text-[13px] text-[var(--muted)] mb-4">Share of Voice over time &mdash; overall and per platform.</p>
      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">{brands.map(b => (
          <button key={b.id} onClick={() => setSelectedBrand(b)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-[var(--text)]' : 'bg-[var(--bg2)] text-[var(--text-muted)] border border-[var(--border)]'}`}>{b.name}</button>
        ))}</div>
      )}
      {trendData.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center"><p className="text-[var(--text-muted)]">Trend data will appear after multiple query runs.</p></div>
      ) : (
        <div className="space-y-6">
          {/* Chart */}
          <SovChart data={trendData} />

          {/* Table */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium">Date</th>
                <th className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium">Overall SOV</th>
                {Object.keys(PLATFORM_COLORS).map(p => <th key={p} className="text-left px-4 py-3 text-xs text-[var(--text-muted)] font-medium">{p}</th>)}
              </tr></thead>
              <tbody>
                {trendData.slice(-20).reverse().map((point, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg3)]">
                    <td className="px-4 py-2.5 text-[var(--text)]">{new Date(point.date).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5"><span className={`font-medium ${point.sov >= 50 ? 'text-[var(--green)]' : point.sov > 0 ? 'text-[var(--amber)]' : 'text-[var(--text-muted)]'}`}>{point.sov}%</span></td>
                    {Object.keys(PLATFORM_COLORS).map(p => {
                      const val = point.platforms?.[p];
                      return <td key={p} className="px-4 py-2.5 text-[var(--text-muted)]">{val !== undefined ? `${val}%` : '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
