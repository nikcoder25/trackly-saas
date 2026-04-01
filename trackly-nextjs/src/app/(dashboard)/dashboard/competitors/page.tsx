'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRun } from '@/contexts/RunContext';
import Link from 'next/link';
import { PLATFORM_COLORS } from '@/lib/constants';

interface Brand { id: string; name: string; competitors?: string[]; runs?: Array<{ allResults?: Array<{ query: string; platform: string; mentioned: boolean; competitorMentions?: string[] }> }>; }

export default function CompetitorsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [newComp, setNewComp] = useState('');
  const { startRun, live } = useRun();

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { const b = d.brands || []; setBrands(b); if (b.length) setBrand(b[0]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const competitors = brand?.competitors || [];
  const lastRun = brand?.runs?.length ? brand.runs[brand.runs.length - 1] : null;
  const allResults = lastRun?.allResults || [];

  function addComp() {
    if (!newComp.trim() || !brand) return;
    const updated = [...competitors, newComp.trim()];
    fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ competitors: updated }) })
      .then(() => { setNewComp(''); reload(); });
  }

  function removeComp(idx: number) {
    if (!brand) return;
    const updated = competitors.filter((_, i) => i !== idx);
    fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ competitors: updated }) })
      .then(() => reload());
  }

  function reload() {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { const b = d.brands || []; setBrands(b); if (b.length) setBrand(b.find((x: Brand) => x.id === brand?.id) || b[0]); });
  }

  // Competitor comparison data
  const compStats = useMemo(() => {
    const stats: Record<string, number> = {};
    competitors.forEach(c => { stats[c] = 0; });
    allResults.forEach(r => {
      (r.competitorMentions || []).forEach(c => { if (stats[c] !== undefined) stats[c]++; });
    });
    return stats;
  }, [competitors, allResults]);

  const brandMentions = allResults.filter(r => r.mentioned).length;
  const total = allResults.length;
  const brandPct = total ? Math.round((brandMentions / total) * 100) : 0;

  // Check if all data is 0%
  const allZero = useMemo(() => {
    if (!competitors.length || !allResults.length) return false;
    const allCompZero = competitors.every(c => (compStats[c] || 0) === 0);
    return allCompZero && brandPct === 0;
  }, [competitors, allResults, compStats, brandPct]);

  // Per-platform breakdown
  const platBreakdown = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    allResults.forEach(r => {
      if (!m[r.platform]) m[r.platform] = {};
      (r.competitorMentions || []).forEach(c => {
        if (competitors.includes(c)) m[r.platform][c] = (m[r.platform][c] || 0) + 1;
      });
    });
    return m;
  }, [allResults, competitors]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div className="view-title">Competitors</div>
          <div className="view-sub">Track mentions alongside your brand.</div>
        </div>
      </div>

      {/* Competitor Brands Card */}
      <div className="card">
        <div className="section-title">Competitor Brands</div>
        {competitors.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 12, padding: '4px 0', marginBottom: 12 }}>No competitors added yet. Add competitor names below to track.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {competitors.map((c, i) => (
              <span key={i} className="comp-chip">
                {c} <button onClick={() => removeComp(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, marginLeft: 4 }}>×</button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="finp" type="text" placeholder="Add competitor name..." style={{ flex: 1, margin: 0 }} value={newComp} onChange={e => setNewComp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComp(); }} />
          <button className="pbtn" onClick={addComp}>+ Add</button>
        </div>
      </div>

      {/* Empty state when all competitors show 0% */}
      {competitors.length > 0 && allZero && (
        <div className="card" style={{ marginTop: 14, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Competitor data will populate after your next query run</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 420, margin: '0 auto 20px' }}>
            Once you run queries, we&apos;ll track how often competitors appear in AI responses alongside your brand.
          </div>
          <button
            className="run-btn"
            onClick={() => startRun(false)}
            disabled={live.running}
            style={{ margin: '0 auto 12px', display: 'block', opacity: live.running ? 0.6 : 1, cursor: live.running ? 'not-allowed' : 'pointer' }}
          >
            {live.running ? '⏳ Running...' : '▶ Run Queries'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            💡 Tip: Add competitors in <Link href="/dashboard/setup" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Brand Setup</Link> for comprehensive tracking.
          </div>
        </div>
      )}

      {/* Empty state when no results at all */}
      {competitors.length > 0 && allResults.length === 0 && (
        <div className="card" style={{ marginTop: 14, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Competitor data will populate after your next query run</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 420, margin: '0 auto 20px' }}>
            Run your first query scan to see how competitors appear in AI responses.
          </div>
          <button
            className="run-btn"
            onClick={() => startRun(false)}
            disabled={live.running}
            style={{ margin: '0 auto 12px', display: 'block', opacity: live.running ? 0.6 : 1, cursor: live.running ? 'not-allowed' : 'pointer' }}
          >
            {live.running ? '⏳ Running...' : '▶ Run Queries'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            💡 Tip: Add competitors in <Link href="/dashboard/setup" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Brand Setup</Link> for comprehensive tracking.
          </div>
        </div>
      )}

      {/* Competitor Comparison — horizontal bar chart */}
      {competitors.length > 0 && allResults.length > 0 && !allZero && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="section-title">Competitor Comparison</div>
          {/* Brand row */}
          <div className="qperf-bar-row">
            <div className="qperf-bar-label" style={{ fontWeight: 700 }}>{brand?.name} <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(You)</span></div>
            <div className="qperf-bar-track"><div className="qperf-bar-fill" style={{ width: `${brandPct}%`, background: 'var(--primary)' }} /></div>
            <div className="qperf-bar-value" style={{ color: 'var(--primary)' }}>{brandPct}%</div>
          </div>
          {/* Competitor rows */}
          {competitors.map((c, i) => {
            const count = compStats[c] || 0;
            const pct = total ? Math.round((count / total) * 100) : 0;
            const colors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#14b8a6', '#6366f1', '#ef4444'];
            const clr = colors[i % colors.length];
            return (
              <div key={c} className="qperf-bar-row">
                <div className="qperf-bar-label">{c}</div>
                <div className="qperf-bar-track"><div className="qperf-bar-fill" style={{ width: `${pct}%`, background: clr }} /></div>
                <div className="qperf-bar-value" style={{ color: clr }}>{pct}%</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Co-occurrence (30 days) */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="section-title">Competitor Co-occurrence (30 days)</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>How often competitors appear in AI responses across all prompts and platforms.</div>
        {competitors.length === 0 || allResults.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>No co-occurrence data yet. Add competitors and run queries.</div>
        ) : (
          <div>
            {competitors.map((c, i) => {
              const count = compStats[c] || 0;
              const pct = total ? Math.round((count / total) * 100) : 0;
              const colors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#14b8a6'];
              const clr = colors[i % colors.length];
              return (
                <div key={c} className="qperf-bar-row">
                  <div className="qperf-bar-label">{c}</div>
                  <div className="qperf-bar-track"><div className="qperf-bar-fill" style={{ width: `${pct}%`, background: clr }} /></div>
                  <div className="qperf-bar-value" style={{ color: 'var(--text)' }}>{count}x</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-Platform Breakdown */}
      {Object.keys(platBreakdown).length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="section-title">Per-Platform Breakdown</div>
          {Object.entries(platBreakdown).map(([plat, compCounts]) => (
            <div key={plat} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: PLATFORM_COLORS[plat] || 'var(--text)', marginBottom: 6 }}>{plat}</div>
              {Object.entries(compCounts).map(([comp, count]) => {
                const platTotal = allResults.filter(r => r.platform === plat).length;
                const pct = platTotal ? Math.round((count / platTotal) * 100) : 0;
                return (
                  <div key={comp} className="qperf-bar-row">
                    <div className="qperf-bar-label">{comp}</div>
                    <div className="qperf-bar-track"><div className="qperf-bar-fill" style={{ width: `${pct}%`, background: PLATFORM_COLORS[plat] || 'var(--muted)' }} /></div>
                    <div className="qperf-bar-value">{count}x</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
