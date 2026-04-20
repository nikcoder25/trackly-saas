'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRun } from '@/contexts/RunContext';
import Link from 'next/link';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { PLATFORM_COLORS } from '@/lib/constants';
import { useBrandData } from '@/hooks/useBrandData';
import { friendlyCompetitorName as friendlyName } from '@/lib/parser';

interface Brand { id: string; name: string; website?: string; competitors?: string[]; runs?: Array<{ allResults?: Array<{ query: string; platform: string; mentioned: boolean; competitorMentions?: string[] }> }>; }
interface CitationRow { domain: string; domain_type: string; is_brand: boolean; is_competitor: boolean; total: string; avg_position: string; last_seen: string; }
interface CompetitorStat { name: string; mentions: number; percentage: number; }
interface CompetitorStatsData {
  competitors: CompetitorStat[];
  platforms: Record<string, { total: number; competitors: Record<string, number> }>;
  totalQueries: number;
  brandMentions: number;
  brandPercentage: number;
  hasData: boolean;
}

export default function CompetitorsPage() {
  const { brand: rawBrand, loading, reload } = useBrandData({ fullData: true });
  const brand = rawBrand as Brand | null;
  const [newComp, setNewComp] = useState('');
  const { startRun, live } = useRun();
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessMsg, setReprocessMsg] = useState('');

  // Citation-based competitor discovery
  const [citations, setCitations] = useState<CitationRow[]>([]);
  const [citLoading, setCitLoading] = useState(false);

  // Competitor stats from dedicated API (aggregated from prompt_runs)
  const [compStatsData, setCompStatsData] = useState<CompetitorStatsData | null>(null);
  const [compStatsLoading, setCompStatsLoading] = useState(false);

  const fetchCompetitorStats = useCallback(async (brandId: string) => {
    setCompStatsLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/competitor-stats`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCompStatsData(data);
      }
    } catch { /* fetch failed */ }
    setCompStatsLoading(false);
  }, []);

  const fetchCitations = useCallback(async (brandId: string) => {
    setCitLoading(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/citation-analysis`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCitations(data.citations || []);
      }
    } catch { /* fetch failed */ }
    setCitLoading(false);
  }, []);

  useEffect(() => {
    if (brand?.id) {
      fetchCitations(brand.id);
      fetchCompetitorStats(brand.id);
    }
  }, [brand?.id, fetchCitations, fetchCompetitorStats]);

  // Refresh aggregated competitor/citation stats when a run finishes so the
  // page reflects the new mentions in real time (matches the toast behaviour).
  useEffect(() => {
    if (!brand?.id) return;
    const handler = () => {
      fetchCitations(brand.id);
      fetchCompetitorStats(brand.id);
    };
    window.addEventListener('livesov:run-complete', handler);
    return () => window.removeEventListener('livesov:run-complete', handler);
  }, [brand?.id, fetchCitations, fetchCompetitorStats]);

  const competitors = brand?.competitors || [];

  // Use API data for stats (aggregated across all runs in last 30 days)
  const totalQueries = compStatsData?.totalQueries || 0;
  const brandPct = compStatsData?.brandPercentage || 0;
  const hasData = compStatsData?.hasData || false;

  // Build compStats map from API data
  const compStats = useMemo(() => {
    const stats: Record<string, number> = {};
    competitors.forEach(c => { stats[c] = 0; });
    if (compStatsData?.competitors) {
      for (const cs of compStatsData.competitors) {
        stats[cs.name] = cs.mentions;
      }
    }
    return stats;
  }, [competitors, compStatsData]);

  // Check if all competitor data is 0 (regardless of brand percentage)
  const allCompZero = useMemo(() => {
    if (!competitors.length || !hasData) return false;
    return competitors.every(c => (compStats[c] || 0) === 0);
  }, [competitors, hasData, compStats]);

  // Auto-reprocess when all competitors show 0% but data exists
  // (handles the common case of competitors added after query runs)
  const autoReprocessed = useRef(false);
  useEffect(() => {
    if (allCompZero && brand?.id && !reprocessing && !autoReprocessed.current) {
      autoReprocessed.current = true;
      triggerReprocess(brand.id);
    }
  }, [allCompZero, brand?.id, reprocessing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Platform breakdown from API
  const platBreakdown = compStatsData?.platforms || {};

  async function addComp() {
    if (!newComp.trim() || !brand) return;
    const updated = [...competitors, newComp.trim()];
    try {
      await fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ competitors: updated }) });
      setNewComp('');
      await reload();
      // Auto-reprocess existing data for the new competitor
      await triggerReprocess(brand.id);
    } catch { /* failed to add */ }
  }

  async function addDiscoveredComp(domain: string) {
    if (!brand) return;
    if (competitors.some(c => c.toLowerCase() === domain.toLowerCase())) return;
    const updated = [...competitors, domain];
    try {
      await fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ competitors: updated }) });
      await reload();
      await triggerReprocess(brand.id);
    } catch { /* failed to add */ }
  }

  async function triggerReprocess(brandId: string) {
    setReprocessing(true);
    setReprocessMsg('Reprocessing existing data for new competitors...');
    try {
      const res = await fetch(`/api/brands/${brandId}/reprocess-competitors`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setReprocessMsg(`Reprocessed ${data.runsProcessed} results. Refreshing...`);
        await reload();
        await fetchCompetitorStats(brandId);
        setReprocessMsg('');
      } else {
        setReprocessMsg(data.error || 'Reprocessing failed');
      }
    } catch {
      setReprocessMsg('Reprocessing failed');
    }
    setReprocessing(false);
  }

  async function reprocessCompetitors() {
    if (!brand || reprocessing) return;
    await triggerReprocess(brand.id);
  }

  function removeComp(idx: number) {
    if (!brand) return;
    const updated = competitors.filter((_, i) => i !== idx);
    fetch(`/api/brands/${brand.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ competitors: updated }) })
      .then(async () => {
        await reload();
        await fetchCompetitorStats(brand.id);
      });
  }

  // Discovered competitors from citations
  const discoveredCompetitors = useMemo(() => {
    if (!citations.length) return [];
    const brandDomain = brand?.website
      ? brand.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase()
      : '';
    const competitorLower = new Set(competitors.map(c => c.toLowerCase()));
    return citations
      .filter((c: CitationRow) => {
        if (c.is_brand) return false;
        const domLower = c.domain.toLowerCase();
        if (brandDomain && domLower.includes(brandDomain)) return false;
        if (competitorLower.has(domLower)) return false;
        if (['social', 'encyclopedia', 'government', 'academic'].includes(c.domain_type)) return false;
        return true;
      })
      .sort((a: CitationRow, b: CitationRow) => Number(b.total) - Number(a.total))
      .slice(0, 15);
  }, [citations, brand?.website, competitors]);

  if (loading || compStatsLoading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      <LockedBrandBanner />
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
              <span key={i} className="comp-chip" title={c}>
                {friendlyName(c)} <button onClick={() => removeComp(i)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, marginLeft: 4 }}>x</button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="finp" type="text" placeholder="Add competitor name..." style={{ flex: 1, margin: 0 }} value={newComp} onChange={e => setNewComp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComp(); }} />
          <button className="pbtn" onClick={addComp}>+ Add</button>
        </div>
      </div>

      {/* Discovered in AI Responses */}
      {discoveredCompetitors.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="section-title">Discovered in AI Responses</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Domains that AI platforms cite alongside your brand. These may be competitors worth tracking.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {discoveredCompetitors.map((c: CitationRow) => {
              const maxTotal = Math.max(...discoveredCompetitors.map((d: CitationRow) => Number(d.total)), 1);
              const pct = (Number(c.total) / maxTotal) * 100;
              const alreadyTracked = competitors.some(comp => comp.toLowerCase() === c.domain.toLowerCase());
              return (
                <div key={c.domain} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="qperf-bar-row" style={{ margin: 0 }}>
                      <div className="qperf-bar-label" style={{ fontSize: 12 }}>
                        {c.domain}
                        {c.is_competitor && <span style={{ fontSize: 9, color: 'var(--primary)', marginLeft: 6, fontWeight: 600 }}>TRACKED</span>}
                        <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>{c.domain_type === 'review_site' ? 'Review' : c.domain_type === 'news' ? 'News' : ''}</span>
                      </div>
                      <div className="qperf-bar-track"><div className="qperf-bar-fill" style={{ width: `${pct}%`, background: c.is_competitor ? 'var(--primary)' : '#6366f1' }} /></div>
                      <div className="qperf-bar-value" style={{ color: 'var(--text)', minWidth: 50, textAlign: 'right' }}>
                        {c.total}x
                        {c.avg_position && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>#{Math.round(Number(c.avg_position))}</span>}
                      </div>
                    </div>
                  </div>
                  {!alreadyTracked && !c.is_competitor && (
                    <button
                      onClick={() => addDiscoveredComp(c.domain)}
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: 'var(--primary)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      + Track
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {citLoading && !discoveredCompetitors.length && (
        <div className="card" style={{ marginTop: 14, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading citation data...</div>
        </div>
      )}

      {/* Empty state: competitors added but no query data at all */}
      {competitors.length > 0 && !hasData && (
        <div className="card" style={{ marginTop: 14, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>&#128202;</div>
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
            {live.running ? 'Running...' : 'Run Queries'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            Tip: Add competitors in <Link href="/dashboard/setup" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>Brand Setup</Link> for comprehensive tracking.
          </div>
        </div>
      )}

      {/* Competitor Comparison - horizontal bar chart */}
      {competitors.length > 0 && hasData && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Competitor Comparison</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Last 30 days &middot; {totalQueries} queries</div>
          </div>
          {/* Brand row */}
          <div className="qperf-bar-row">
            <div className="qperf-bar-label" style={{ fontWeight: 700 }}>{brand?.name} <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>(You)</span></div>
            <div className="qperf-bar-track"><div className="qperf-bar-fill" style={{ width: `${brandPct}%`, background: 'var(--primary)' }} /></div>
            <div className="qperf-bar-value" style={{ color: 'var(--primary)' }}>{brandPct}%</div>
          </div>
          {/* Competitor rows */}
          {competitors.map((c, i) => {
            const count = compStats[c] || 0;
            const pct = totalQueries ? Math.round((count / totalQueries) * 100) : 0;
            const colors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#14b8a6', '#6366f1', '#ef4444'];
            const clr = colors[i % colors.length];
            return (
              <div key={c} className="qperf-bar-row">
                <div className="qperf-bar-label" title={c}>{friendlyName(c)}</div>
                <div className="qperf-bar-track"><div className="qperf-bar-fill" style={{ width: `${pct}%`, background: clr }} /></div>
                <div className="qperf-bar-value" style={{ color: clr }}>{pct}%</div>
              </div>
            );
          })}

          {allCompZero && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 6, fontSize: 12, color: 'var(--muted)' }}>
              No competitor mentions detected yet. This can happen if competitors were added after your last query run.
              Try reprocessing existing data or running new queries.
            </div>
          )}

          {/* Reprocess button inline */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={reprocessCompetitors}
              disabled={reprocessing}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 10px', fontSize: 11, color: 'var(--muted)', cursor: reprocessing ? 'not-allowed' : 'pointer' }}
            >
              {reprocessing ? 'Reprocessing...' : 'Reprocess Data'}
            </button>
            {reprocessMsg && <span style={{ fontSize: 11, color: 'var(--primary)' }}>{reprocessMsg}</span>}
          </div>
        </div>
      )}

      {/* Co-occurrence (30 days) */}
      {competitors.length > 0 && hasData && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="section-title">Competitor Co-occurrence (30 days)</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>How often competitors appear in AI responses across all prompts and platforms.</div>
          <div>
            {competitors.map((c, i) => {
              const count = compStats[c] || 0;
              const maxCount = Math.max(...competitors.map(comp => compStats[comp] || 0), 1);
              const barPct = maxCount ? Math.round((count / maxCount) * 100) : 0;
              const colors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#14b8a6'];
              const clr = colors[i % colors.length];
              return (
                <div key={c} className="qperf-bar-row">
                  <div className="qperf-bar-label" title={c}>{friendlyName(c)}</div>
                  <div className="qperf-bar-track"><div className="qperf-bar-fill" style={{ width: `${barPct}%`, background: clr }} /></div>
                  <div className="qperf-bar-value" style={{ color: 'var(--text)' }}>{count}x</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-Platform Breakdown */}
      {competitors.length > 0 && hasData && Object.keys(platBreakdown).length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="section-title" style={{ marginBottom: 4 }}>Per-Platform Breakdown</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Competitor mentions broken down by AI platform.</div>
          <div className="plat-breakdown-grid">
            {(Object.entries(platBreakdown) as [string, { total: number; competitors: Record<string, number> }][]).map(([plat, platData]) => {
              const platColor = PLATFORM_COLORS[plat] || 'var(--muted)';
              const platTotal = platData.total;
              const compCounts = platData.competitors;
              const maxCount = Math.max(...Object.values(compCounts), 1);
              return (
                <div key={plat} className="plat-breakdown-card">
                  <div className="plat-breakdown-header" style={{ borderColor: platColor }}>
                    <span className="plat-breakdown-dot" style={{ background: platColor }} />
                    <span className="plat-breakdown-name" style={{ color: platColor }}>{plat}</span>
                    <span className="plat-breakdown-count">{platTotal} {platTotal === 1 ? 'query' : 'queries'}</span>
                  </div>
                  <div className="plat-breakdown-body">
                    {Object.entries(compCounts).map(([comp, count]) => {
                      const pct = maxCount ? Math.round((count / maxCount) * 100) : 0;
                      const ratePct = platTotal ? Math.round((count / platTotal) * 100) : 0;
                      return (
                        <div key={comp} className="plat-breakdown-row">
                          <div className="plat-breakdown-comp" title={comp}>{friendlyName(comp)}</div>
                          <div className="plat-breakdown-bar">
                            <div className="plat-breakdown-bar-fill" style={{ width: `${pct}%`, background: platColor }} />
                          </div>
                          <div className="plat-breakdown-val">{count}<span className="plat-breakdown-rate">{ratePct}%</span></div>
                        </div>
                      );
                    })}
                    {Object.keys(compCounts).length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 0', textAlign: 'center' }}>No data</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
