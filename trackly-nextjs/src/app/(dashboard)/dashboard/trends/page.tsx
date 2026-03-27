'use client';

import { useState, useEffect, useMemo } from 'react';
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

  // Trend KPIs
  const currentSov = trendData.length > 0 ? trendData[trendData.length - 1].sov : 0;
  const prevSov = trendData.length >= 2 ? trendData[trendData.length - 2].sov : null;
  const sovChange = prevSov !== null ? currentSov - prevSov : null;
  const peakSov = trendData.length > 0 ? Math.max(...trendData.map(d => d.sov)) : 0;
  const avgSov = trendData.length > 0 ? Math.round(trendData.reduce((s, d) => s + d.sov, 0) / trendData.length) : 0;

  // Per-platform trend direction
  const platformTrends = useMemo(() => {
    if (trendData.length < 2) return {};
    const latest = trendData[trendData.length - 1];
    const prev = trendData[trendData.length - 2];
    const trends: Record<string, number> = {};
    if (latest.platforms && prev.platforms) {
      Object.keys(latest.platforms).forEach(p => {
        const cur = latest.platforms?.[p] || 0;
        const pre = prev.platforms?.[p] || 0;
        trends[p] = cur - pre;
      });
    }
    return trends;
  }, [trendData]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)] mb-1">SOV Trends</h1>
      <p className="text-[13px] text-[var(--muted)] mb-4">Share of Voice over time &mdash; overall and per platform.</p>
      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">{brands.map(b => (
          <button key={b.id} onClick={() => setSelectedBrand(b)} className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)]'}`}>{b.name}</button>
        ))}</div>
      )}

      {trendData.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center"><p className="text-[var(--muted)]">Trend data will appear after multiple query runs.</p></div>
      ) : (
        <div className="space-y-4">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Current SOV</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-extrabold font-mono ${currentSov >= 50 ? 'text-[var(--green)]' : currentSov > 0 ? 'text-[var(--amber)]' : 'text-[var(--muted)]'}`}>{currentSov}%</span>
                {sovChange !== null && sovChange !== 0 && (
                  <span className={`text-xs font-mono font-bold ${sovChange > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                    {sovChange > 0 ? '▲' : '▼'} {Math.abs(sovChange)}%
                  </span>
                )}
              </div>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Peak SOV</p>
              <span className="text-2xl font-extrabold font-mono text-[var(--text)]">{peakSov}%</span>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Avg SOV</p>
              <span className="text-2xl font-extrabold font-mono text-[var(--text)]">{avgSov}%</span>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 shadow-[var(--app-shadow)]">
              <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">Data Points</p>
              <span className="text-2xl font-extrabold font-mono text-[var(--text)]">{trendData.length}</span>
            </div>
          </div>

          {/* Chart */}
          <SovChart data={trendData} />

          {/* Table */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl overflow-hidden shadow-[var(--app-shadow)]">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Date</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Overall SOV</th>
                <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Change</th>
                {Object.keys(PLATFORM_COLORS).map(p => <th key={p} className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">{p}</th>)}
              </tr></thead>
              <tbody>
                {trendData.slice(-20).reverse().map((point, i, arr) => {
                  const prevPoint = i < arr.length - 1 ? arr[i + 1] : null;
                  const change = prevPoint ? point.sov - prevPoint.sov : null;
                  return (
                    <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg3)]">
                      <td className="px-4 py-2.5 text-[var(--text)]">{new Date(point.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5"><span className={`font-mono font-semibold ${point.sov >= 50 ? 'text-[var(--green)]' : point.sov > 0 ? 'text-[var(--amber)]' : 'text-[var(--muted)]'}`}>{point.sov}%</span></td>
                      <td className="px-4 py-2.5">
                        {change !== null && change !== 0 ? (
                          <span className={`text-xs font-mono font-bold ${change > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                            {change > 0 ? '+' : ''}{change}%
                          </span>
                        ) : (
                          <span className="text-[var(--muted)] text-xs">—</span>
                        )}
                      </td>
                      {Object.keys(PLATFORM_COLORS).map(p => {
                        const val = point.platforms?.[p];
                        const trend = platformTrends[p];
                        return (
                          <td key={p} className="px-4 py-2.5 text-[var(--muted)]">
                            {val !== undefined ? (
                              <span className="inline-flex items-center gap-1">
                                {val}%
                                {i === 0 && trend !== undefined && trend !== 0 && (
                                  <span className={`text-[9px] ${trend > 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                                    {trend > 0 ? '▲' : '▼'}
                                  </span>
                                )}
                              </span>
                            ) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
