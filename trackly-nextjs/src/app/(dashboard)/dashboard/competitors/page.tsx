'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useRun } from '@/contexts/RunContext';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { PLATFORM_COLORS } from '@/lib/constants';
import { useBrandData } from '@/hooks/useBrandData';
import { friendlyCompetitorName as friendlyName } from '@/lib/parser';
import { Card, PageHead, Badge, Bar, StackBar, Spark } from '@/app/dashboard-v2/ui';

const COMP_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#14b8a6', '#6366f1', '#ef4444'];

interface Brand { id: string; name: string; website?: string; competitors?: string[]; runs?: Array<{ allResults?: Array<{ query: string; platform: string; mentioned: boolean; competitorMentions?: string[] }> }>; }
interface CitationRow { domain: string; domain_type: string; is_brand: boolean; is_competitor: boolean; total: string; avg_position: string; last_seen: string; }
interface CompetitorStat { name: string; mentions: number; percentage: number; trend?: number[]; }
interface CompetitorStatsData {
  competitors: CompetitorStat[];
  platforms: Record<string, { total: number; competitors: Record<string, number> }>;
  totalQueries: number;
  brandMentions: number;
  brandPercentage: number;
  brandTrend?: number[];
  hasData: boolean;
}

export default function CompetitorsPage() {
  const { brand: rawBrand, loading, reload } = useBrandData({ fullData: true });
  const brand = rawBrand as Brand | null;
  const [newComp, setNewComp] = useState('');
  const { startRun, live } = useRun();
  const { user } = useAuth();
  const isAdmin = user?.plan === 'owner' || user?.role === 'admin';
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

  // Real per-competitor SOV-over-time trend (daily) from the stats API, keyed
  // by competitor name for quick lookup when building the leaderboard.
  const compTrends = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const cs of compStatsData?.competitors || []) {
      if (cs.trend && cs.trend.length) map[cs.name] = cs.trend;
    }
    return map;
  }, [compStatsData]);

  // Build the ranked leaderboard from real data: brand + tracked competitors,
  // sorted by share of voice (SOV = mentions / totalQueries).
  const leaderboard = useMemo(() => {
    const rows = [
      {
        name: brand?.name || 'Your brand',
        mentions: compStatsData?.brandMentions || 0,
        sov: brandPct,
        color: 'var(--primary)',
        me: true,
        trend: compStatsData?.brandTrend || [],
      },
      ...competitors.map((c, i) => {
        const count = compStats[c] || 0;
        const sov = totalQueries ? Math.round((count / totalQueries) * 100) : 0;
        return {
          name: friendlyName(c),
          mentions: count,
          sov,
          color: COMP_COLORS[i % COMP_COLORS.length],
          me: false,
          trend: compTrends[c] || [],
        };
      }),
    ];
    return rows.sort((a, b) => b.sov - a.sov);
  }, [brand?.name, competitors, compStats, compStatsData, brandPct, totalQueries, compTrends]);

  if (loading || compStatsLoading) return (
    <div className="lvx">
      <div className="page-body" style={{ paddingTop: 28 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
            <div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'lvx-spin 1s linear infinite' }} />
          </div>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="lvx">
      <LockedBrandBanner />
      <PageHead
        title="Competitors"
        sub="Track mentions alongside your brand across every AI engine and question."
        actions={isAdmin ? (
          <button className="btn-g" onClick={reprocessCompetitors} disabled={reprocessing}>
            {reprocessing ? 'Reprocessing…' : '↻ Reprocess data'}
          </button>
        ) : undefined}
      />

      <div className="page-body">
        {/* Competitor Brands */}
        <Card title="Competitor brands" lede="The brands tracked alongside yours in AI answers.">
          {competitors.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '4px 0', marginBottom: 12 }}>No competitors added yet. Add competitor names below to track.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {competitors.map((c, i) => (
                <span key={i} className="pill pill-neu" title={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {friendlyName(c)}
                  <button onClick={() => removeComp(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="search-box" style={{ flex: 1, minWidth: 0 }}>
              <input
                type="text"
                placeholder="Add competitor name…"
                value={newComp}
                onChange={e => setNewComp(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addComp(); }}
              />
            </div>
            <button className="btn-p" onClick={addComp}>+ Add</button>
          </div>
        </Card>

        {/* Discovered in AI Responses */}
        {discoveredCompetitors.length > 0 && (
          <Card title="Discovered in AI responses" lede="Domains that AI platforms cite alongside your brand. These may be competitors worth tracking.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {discoveredCompetitors.map((c: CitationRow) => {
                const maxTotal = Math.max(...discoveredCompetitors.map((d: CitationRow) => Number(d.total)), 1);
                const alreadyTracked = competitors.some(comp => comp.toLowerCase() === c.domain.toLowerCase());
                return (
                  <div key={c.domain} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 70px', gap: 12, alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span className="mono" style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.domain}</span>
                      {c.is_competitor && <Badge tone="acc">TRACKED</Badge>}
                      {c.domain_type === 'review_site' && <Badge tone="info">REVIEW</Badge>}
                      {c.domain_type === 'news' && <Badge tone="warn">NEWS</Badge>}
                    </span>
                    <Bar value={Number(c.total)} max={maxTotal} color={c.is_competitor ? 'var(--primary)' : 'var(--info)'} />
                    <span className="mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--text)' }}>
                      {c.total}×
                      {!alreadyTracked && !c.is_competitor && (
                        <button onClick={() => addDiscoveredComp(c.domain)} className="btn-d" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}>+ Track</button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {citLoading && !discoveredCompetitors.length && (
          <Card>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', padding: 24 }}>Loading citation data…</div>
          </Card>
        )}

        {/* Empty state: competitors added but no query data at all */}
        {competitors.length > 0 && !hasData && (
          <Card>
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>&#128202;</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Competitor data will populate after your next query run</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 420, margin: '0 auto 20px' }}>
                {isAdmin ? 'Run your first query scan to see how competitors appear in AI responses.' : 'Competitor data will appear after your next scheduled query run.'}
              </div>
              {isAdmin && (
                <button className="btn-p" onClick={() => startRun(false)} disabled={live.running} style={{ margin: '0 auto 12px' }}>
                  {live.running ? 'Running…' : 'Run Queries'}
                </button>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Tip: Add competitors in <Link href="/dashboard/setup" style={{ color: 'var(--primary)', fontWeight: 600 }}>Brand Setup</Link> for comprehensive tracking.
              </div>
            </div>
          </Card>
        )}

        {/* Share of Voice */}
        {competitors.length > 0 && hasData && (
          <Card
            title="Share of Voice"
            info="sov"
            lede="Everyone's slice of the AI conversation, across all engines. Your bar is highlighted."
            right={<span className="mono dim" style={{ fontSize: 11 }}>30D · {totalQueries} QUERIES</span>}
          >
            <StackBar items={leaderboard.filter(c => c.sov > 0).map(c => ({ label: c.name, value: c.sov, color: c.color }))} height={32} />
            <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--mute)' }}>
              {leaderboard.map(c => (
                <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i style={{ width: 8, height: 8, background: c.color, borderRadius: 1, display: 'inline-block' }} />
                  <b style={{ color: c.me ? 'var(--primary)' : 'var(--text)' }}>{c.name}</b> {c.sov}%
                </span>
              ))}
            </div>
            {allCompZero && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 6, fontSize: 12, color: 'var(--text-3)' }}>
                No competitor mentions detected yet. This can happen if competitors were added after your last query run. Try reprocessing existing data or running new queries.
              </div>
            )}
            {reprocessMsg && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--primary)', fontFamily: 'var(--mono)' }}>{reprocessMsg}</div>
            )}
          </Card>
        )}

        {/* Competitor leaderboard */}
        {competitors.length > 0 && hasData && (
          <Card
            title="Competitor leaderboard"
            info="sov"
            lede="Every brand you track, ranked by Share of Voice. Green = gaining, red = slipping."
            padding={false}
          >
            <table className="tbl">
              <thead><tr>
                <th>RANK</th><th>BRAND</th><th>SOV</th><th>MENTIONS</th><th>SOV TREND</th>
              </tr></thead>
              <tbody>
                {leaderboard.map((c, i) => (
                  <tr key={c.name}>
                    <td className="num"><b>{(i + 1).toString().padStart(2, '0')}</b></td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, background: c.color, borderRadius: 2, display: 'inline-block' }} />
                        <b style={{ color: c.me ? 'var(--primary)' : 'var(--text)' }}>{c.name}</b>
                        {c.me && <Badge tone="acc">YOU</Badge>}
                      </span>
                    </td>
                    <td className="num"><b>{c.sov}%</b></td>
                    <td className="num">{c.mentions.toLocaleString()}{!c.me && '×'}</td>
                    <td>
                      {c.trend && c.trend.length >= 2
                        ? <Spark data={c.trend} width={120} height={24} color={c.me ? 'var(--primary)' : c.color} />
                        : <span className="mono dim" style={{ fontSize: 11 }}>-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Per-Platform Breakdown */}
        {competitors.length > 0 && hasData && Object.keys(platBreakdown).length > 0 && (
          <Card title="Per-platform breakdown" lede="Competitor mentions broken down by AI platform.">
            <div className="g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {(Object.entries(platBreakdown) as [string, { total: number; competitors: Record<string, number> }][]).map(([plat, platData]) => {
                const platColor = PLATFORM_COLORS[plat] || 'var(--mute)';
                const platTotal = platData.total;
                const compCounts = platData.competitors;
                const maxCount = Math.max(...Object.values(compCounts), 1);
                return (
                  <div key={plat} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `2px solid ${platColor}`, background: 'var(--surface-2)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: platColor, display: 'inline-block' }} />
                      <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: platColor }}>{plat}</span>
                      <span className="mono dim" style={{ marginLeft: 'auto', fontSize: 11 }}>{platTotal} {platTotal === 1 ? 'query' : 'queries'}</span>
                    </div>
                    <div style={{ padding: '10px 12px', display: 'grid', gap: 8 }}>
                      {Object.entries(compCounts).map(([comp, count]) => {
                        const ratePct = platTotal ? Math.round((count / platTotal) * 100) : 0;
                        return (
                          <div key={comp} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 56px', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontSize: 12.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comp}>{friendlyName(comp)}</span>
                            <Bar value={count} max={maxCount} color={platColor} />
                            <span className="mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--text)' }}>{count}<span className="dim" style={{ marginLeft: 4 }}>{ratePct}%</span></span>
                          </div>
                        );
                      })}
                      {Object.keys(compCounts).length === 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '8px 0', textAlign: 'center' }}>No data</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
