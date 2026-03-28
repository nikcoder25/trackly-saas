'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface Brand {
  id: string;
  name: string;
  queries?: string[];
  queryStats?: Record<string, { runs: number; mentions: number }>;
  runs?: Array<{ allResults?: Array<{ query: string; platform: string; mentioned: boolean }> }>;
}

export default function QueryPerformancePage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { const b = d.brands || []; setBrands(b); if (b.length) setBrand(b[0]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const queries = brand?.queries || [];
  const qs = brand?.queryStats || {};

  // Build stats from last run if queryStats not available
  const computedStats = useMemo(() => {
    if (Object.keys(qs).length > 0) return qs;
    const lastRun = brand?.runs?.length ? brand.runs[brand.runs.length - 1] : null;
    if (!lastRun?.allResults) return {};
    const stats: Record<string, { runs: number; mentions: number }> = {};
    lastRun.allResults.forEach(r => {
      if (!stats[r.query]) stats[r.query] = { runs: 0, mentions: 0 };
      stats[r.query].runs++;
      if (r.mentioned) stats[r.query].mentions++;
    });
    return stats;
  }, [qs, brand]);

  // Sort queries by mention rate descending
  const sorted = useMemo(() => {
    return [...queries].sort((a, b) => {
      const ra = computedStats[a]?.runs ? (computedStats[a].mentions / computedStats[a].runs) : 0;
      const rb = computedStats[b]?.runs ? (computedStats[b].mentions / computedStats[b].runs) : 0;
      return rb - ra;
    });
  }, [queries, computedStats]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div className="view-title">Query Performance</div>
          <div className="view-sub">Monitor mention rates and performance for every tracked keyword across AI platforms.</div>
        </div>
        <Link href="/dashboard/setup" className="pbtn" style={{ textDecoration: 'none' }}>Manage Queries</Link>
      </div>

      {/* Content */}
      {!queries.length ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>◻</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>No Queries Configured</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>Add queries in Brand Setup to start tracking performance.</div>
          <Link href="/dashboard/setup" className="pbtn" style={{ textDecoration: 'none' }}>Go to Brand Setup</Link>
        </div>
      ) : (
        <div className="card" style={{ padding: '20px 24px' }}>
          {sorted.map((q, idx) => {
            const stat = computedStats[q] || { runs: 0, mentions: 0 };
            const rate = stat.runs ? Math.round((stat.mentions / stat.runs) * 100) : 0;
            const barColor = rate > 40 ? 'var(--green)' : 'var(--amber)';

            return (
              <div key={q} className="qperf-bar-row" style={{ animationDelay: `${Math.min(idx * 0.04, 0.5)}s` }}>
                <div className="qperf-bar-label" title={q}>{q}</div>
                <div className="qperf-bar-track">
                  <div className="qperf-bar-fill" style={{ width: `${rate}%`, background: barColor }} />
                </div>
                <div className="qperf-bar-value" style={{ color: barColor }}>{rate}%</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
