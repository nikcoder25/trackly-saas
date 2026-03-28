'use client';

import { useState, useEffect, useMemo } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';

interface Brand {
  id: string;
  name: string;
}

interface PromptResult {
  query: string;
  platform: string;
  model?: string;
  mentioned: boolean;
  sentiment?: string;
  position?: number;
  response?: string;
  snippet?: string;
  date?: string;
  search_intent?: string;
  funnel_stage?: string;
  tags?: string[];
}

interface PromptRun {
  id?: string;
  date?: string;
  created_at?: string;
  allResults?: PromptResult[];
  results?: PromptResult[];
}

type PeriodDays = 7 | 14 | 30 | 60 | 90;

export default function PromptDetailsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [runs, setRuns] = useState<PromptRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuery, setSelectedQuery] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const b = d.brands || [];
        setBrands(b);
        if (b.length) setSelectedBrand(b[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBrand) return;
    fetch(`/api/brands/${selectedBrand.id}/prompt-runs`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const r = d.runs || d.promptRuns || [];
        setRuns(r);
      })
      .catch(() => setRuns([]));
  }, [selectedBrand]);

  // All results across all runs
  const allResults = useMemo(() => {
    const results: PromptResult[] = [];
    runs.forEach(run => {
      const items = run.allResults || run.results || [];
      items.forEach(item => {
        results.push({
          ...item,
          date: item.date || run.date || run.created_at,
        });
      });
    });
    return results;
  }, [runs]);

  // Filter by period
  const periodFiltered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    return allResults.filter(r => {
      if (!r.date) return true;
      return new Date(r.date) >= cutoff;
    });
  }, [allResults, periodDays]);

  // Available queries
  const queries = useMemo(() => {
    const set = new Set<string>();
    periodFiltered.forEach(r => { if (r.query) set.add(r.query); });
    return Array.from(set);
  }, [periodFiltered]);

  // Auto-select first query
  useEffect(() => {
    if (queries.length > 0 && (!selectedQuery || !queries.includes(selectedQuery))) {
      setSelectedQuery(queries[0]);
    }
  }, [queries, selectedQuery]);

  // Available platforms for selected query
  const platforms = useMemo(() => {
    const set = new Set<string>();
    periodFiltered.forEach(r => {
      if (r.query === selectedQuery && r.platform) set.add(r.platform);
    });
    return Array.from(set);
  }, [periodFiltered, selectedQuery]);

  // Filtered results for selected query
  const queryResults = useMemo(() => {
    return periodFiltered.filter(r => {
      if (r.query !== selectedQuery) return false;
      if (platformFilter !== 'all' && r.platform !== platformFilter) return false;
      return true;
    });
  }, [periodFiltered, selectedQuery, platformFilter]);

  // KPI metrics
  const totalResponses = queryResults.length;
  const mentionedCount = queryResults.filter(r => r.mentioned).length;
  const mentionRate = totalResponses > 0 ? (mentionedCount / totalResponses) * 100 : 0;
  const avgPosition = (() => {
    const positions = queryResults.filter(r => r.position).map(r => r.position!);
    return positions.length > 0 ? positions.reduce((s, p) => s + p, 0) / positions.length : 0;
  })();
  const sentiments = queryResults.filter(r => r.sentiment);
  const positiveSentiment = sentiments.filter(r => r.sentiment === 'positive').length;
  const sentimentRate = sentiments.length > 0 ? (positiveSentiment / sentiments.length) * 100 : 0;

  // Prompt Classification from first result with metadata
  const classificationResult = queryResults.find(r => r.search_intent || r.funnel_stage || r.tags);

  // Per-platform performance
  const platformPerf = useMemo(() => {
    const map: Record<string, { platform: string; total: number; mentioned: number; posSum: number; posCount: number; sentPos: number; sentTotal: number }> = {};
    queryResults.forEach(r => {
      if (!map[r.platform]) {
        map[r.platform] = { platform: r.platform, total: 0, mentioned: 0, posSum: 0, posCount: 0, sentPos: 0, sentTotal: 0 };
      }
      const p = map[r.platform];
      p.total++;
      if (r.mentioned) p.mentioned++;
      if (r.position) { p.posSum += r.position; p.posCount++; }
      if (r.sentiment) { p.sentTotal++; if (r.sentiment === 'positive') p.sentPos++; }
    });
    return Object.values(map);
  }, [queryResults]);

  // Recent runs (last 5)
  const recentRuns = useMemo(() => {
    return [...runs].reverse().slice(0, 5);
  }, [runs]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Prompt Details</h1>
          <p className="text-[var(--muted)] mt-1">Deep analytics for each tracked query &mdash; visibility, sentiment, competitors, and trends per platform.</p>
        </div>
      </div>

      {brands.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {brands.map(b => (
            <button key={b.id} onClick={() => setSelectedBrand(b)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm ${selectedBrand?.id === b.id ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg2)] text-[var(--muted)] border border-[var(--border)]'}`}>{b.name}</button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <select
          value={selectedQuery}
          onChange={e => setSelectedQuery(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none max-w-xs"
        >
          {queries.length === 0 && <option value="">No queries</option>}
          {queries.map(q => <option key={q} value={q}>{q}</option>)}
        </select>

        <select
          value={platformFilter}
          onChange={e => setPlatformFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm bg-[var(--bg2)] text-[var(--text)] border border-[var(--border)] outline-none"
        >
          <option value="all">All Platforms</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select
          value={periodDays}
          onChange={e => setPeriodDays(Number(e.target.value) as PeriodDays)}
          style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: 'var(--bg2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', outline: 'none', cursor: 'pointer', fontFamily: 'var(--font)', marginLeft: 'auto' }}
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {queryResults.length === 0 ? (
        <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--muted)]">No data available for this query. Run tracking queries from Brand Setup to collect data.</p>
        </div>
      ) : (
        <>
          {/* KPI Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Total Responses</p>
              <p className="text-2xl font-bold font-mono text-[var(--text)]">{totalResponses}</p>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Mentioned</p>
              <p className="text-2xl font-bold font-mono text-[var(--green)]">{mentionedCount}</p>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Mention Rate</p>
              <p className={`text-2xl font-bold font-mono ${mentionRate >= 50 ? 'text-[var(--green)]' : mentionRate > 0 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>
                {mentionRate.toFixed(0)}%
              </p>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Avg Position</p>
              <p className="text-2xl font-bold font-mono text-[var(--text)]">{avgPosition > 0 ? `#${avgPosition.toFixed(1)}` : '\u2014'}</p>
            </div>
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Positive Sentiment</p>
              <p className={`text-2xl font-bold font-mono ${sentimentRate >= 50 ? 'text-[var(--green)]' : sentimentRate > 0 ? 'text-[var(--amber)]' : 'text-[var(--muted)]'}`}>
                {sentiments.length > 0 ? `${sentimentRate.toFixed(0)}%` : '\u2014'}
              </p>
            </div>
          </div>

          {/* Prompt Classification Card */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)] mb-6">
            <h3 className="text-sm font-semibold text-[var(--text)] mb-3 uppercase tracking-wide">Prompt Classification</h3>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-[var(--muted)] mb-1">Search Intent</p>
                <p className="text-sm font-medium text-[var(--text)]">
                  {classificationResult?.search_intent || 'Informational'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)] mb-1">Funnel Stage</p>
                <p className="text-sm font-medium text-[var(--text)]">
                  {classificationResult?.funnel_stage || 'Awareness'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)] mb-1">Tags</p>
                <div className="flex gap-1.5 flex-wrap mt-0.5">
                  {(classificationResult?.tags || ['general']).map(tag => (
                    <span key={tag} className="px-2 py-0.5 rounded text-xs bg-[var(--primary-light)] text-[var(--primary)] font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Visibility Over Time + Sentiment Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Visibility Bar Chart */}
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
              <h3 className="text-sm font-semibold text-[var(--text)] mb-3 uppercase tracking-wide">Visibility Over Time</h3>
              {(() => {
                // Build per-run visibility for selected query
                const runVis = runs.slice(-10).map(run => {
                  const items = (run.allResults || run.results || []).filter(r => r.query === selectedQuery);
                  const mentioned = items.filter(r => r.mentioned).length;
                  const rate = items.length > 0 ? Math.round((mentioned / items.length) * 100) : 0;
                  return { date: run.date || run.created_at || '', rate };
                }).filter(rv => rv.date);

                if (runVis.length === 0) return <p className="text-[var(--muted)] text-xs py-8 text-center">No visibility data yet.</p>;

                return (
                  <div className="flex items-end gap-1 h-[120px]">
                    {runVis.map((rv, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-[8px] font-mono text-[var(--muted)]">{rv.rate}%</span>
                        <div className="w-full rounded-t transition-all" style={{
                          height: `${Math.max(4, rv.rate)}%`,
                          background: rv.rate >= 50 ? 'var(--green)' : rv.rate > 0 ? 'var(--amber)' : 'var(--bg4)',
                          minHeight: 4
                        }} />
                        <span className="text-[7px] text-[var(--muted)] truncate max-w-full">{rv.date ? new Date(rv.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Sentiment Breakdown */}
            <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
              <h3 className="text-sm font-semibold text-[var(--text)] mb-3 uppercase tracking-wide">Sentiment Distribution</h3>
              {(() => {
                const pos = queryResults.filter(r => r.sentiment === 'positive').length;
                const neu = queryResults.filter(r => r.sentiment === 'neutral').length;
                const neg = queryResults.filter(r => r.sentiment === 'negative').length;
                const total = pos + neu + neg;
                if (total === 0) return <p className="text-[var(--muted)] text-xs py-8 text-center">No sentiment data yet.</p>;
                const posPct = Math.round((pos / total) * 100);
                const neuPct = Math.round((neu / total) * 100);
                const negPct = Math.round((neg / total) * 100);
                return (
                  <div>
                    {/* Stacked bar */}
                    <div className="flex gap-0.5 h-8 rounded-lg overflow-hidden bg-[var(--bg3)] mb-4">
                      {posPct > 0 && <div className="bg-[var(--green)] h-full transition-all flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${posPct}%` }}>{posPct}%</div>}
                      {neuPct > 0 && <div className="bg-[var(--muted)] h-full transition-all flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${neuPct}%` }}>{neuPct}%</div>}
                      {negPct > 0 && <div className="bg-[var(--red)] h-full transition-all flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${negPct}%` }}>{negPct}%</div>}
                    </div>
                    {/* Legend */}
                    <div className="flex gap-6 text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[var(--green)]" /> Positive <strong className="font-mono">{pos}</strong></span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[var(--muted)]" /> Neutral <strong className="font-mono">{neu}</strong></span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[var(--red)]" /> Negative <strong className="font-mono">{neg}</strong></span>
                    </div>
                    {/* Per-platform sentiment */}
                    <div className="mt-4 space-y-1.5">
                      {platformPerf.filter(p => p.sentTotal > 0).map(p => {
                        const pPosPct = Math.round((p.sentPos / p.sentTotal) * 100);
                        return (
                          <div key={p.platform} className="flex items-center gap-2 text-[11px]">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PLATFORM_COLORS[p.platform] || '#666' }} />
                            <span className="text-[var(--muted)] w-20 truncate">{p.platform}</span>
                            <div className="flex-1 h-[4px] bg-[var(--bg3)] rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pPosPct}%`, background: pPosPct >= 50 ? 'var(--green)' : 'var(--amber)' }} />
                            </div>
                            <span className="font-mono text-[var(--muted)] w-10 text-right">{pPosPct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Per-Platform Performance Table */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl overflow-hidden overflow-x-auto shadow-[var(--app-shadow)] mb-6">
            <div className="px-5 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wide">Per-Platform Performance</h3>
            </div>
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Platform</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Total</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Mentioned</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Rate</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Avg Position</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">Sentiment</th>
                </tr>
              </thead>
              <tbody>
                {platformPerf.map((p, i) => {
                  const rate = p.total > 0 ? (p.mentioned / p.total) * 100 : 0;
                  const sentRate = p.sentTotal > 0 ? (p.sentPos / p.sentTotal) * 100 : 0;
                  return (
                    <tr key={i} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg3)] transition-colors">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[p.platform] || '#666' }} />
                          <span className="text-[var(--text)] font-medium">{p.platform}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--muted)]">{p.total}</td>
                      <td className="px-4 py-3 font-mono text-[var(--green)]">{p.mentioned}</td>
                      <td className="px-4 py-3">
                        <span className={`font-mono font-semibold ${rate >= 50 ? 'text-[var(--green)]' : rate > 0 ? 'text-[var(--amber)]' : 'text-[var(--red)]'}`}>
                          {rate.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[var(--muted)]">{p.posCount > 0 ? `#${(p.posSum / p.posCount).toFixed(1)}` : '\u2014'}</td>
                      <td className="px-4 py-3">
                        {p.sentTotal > 0 ? (
                          <span className={`font-mono text-xs ${sentRate >= 50 ? 'text-[var(--green)]' : 'text-[var(--amber)]'}`}>
                            {sentRate.toFixed(0)}% pos
                          </span>
                        ) : (
                          <span className="text-[var(--muted)] text-xs">{'\u2014'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {platformPerf.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-[var(--muted)]">No platform data</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Recent Query Runs */}
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-5 shadow-[var(--app-shadow)]">
            <h3 className="text-sm font-semibold text-[var(--text)] mb-3 uppercase tracking-wide">Recent Query Runs</h3>
            {recentRuns.length === 0 ? (
              <p className="text-[var(--muted)] text-sm">No recent runs.</p>
            ) : (
              <div className="space-y-2">
                {recentRuns.map((run, i) => {
                  const results = (run.allResults || run.results || []).filter(r => r.query === selectedQuery);
                  const mentioned = results.filter(r => r.mentioned).length;
                  const runDate = run.date || run.created_at;
                  return (
                    <div key={i} className="flex items-center gap-4 p-3 border border-[var(--border)] rounded-lg bg-[var(--bg)] hover:bg-[var(--bg3)] transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text)] font-medium">
                          {runDate ? new Date(runDate).toLocaleString() : `Run ${runs.length - i}`}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {results.length} results for this query
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className="font-mono text-[var(--green)]">{mentioned} mentioned</span>
                        <span className="font-mono text-[var(--red)]">{results.length - mentioned} missed</span>
                        {results.length > 0 && (
                          <span className={`font-mono font-semibold ${(mentioned / results.length) * 100 >= 50 ? 'text-[var(--green)]' : 'text-[var(--amber)]'}`}>
                            {((mentioned / results.length) * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
