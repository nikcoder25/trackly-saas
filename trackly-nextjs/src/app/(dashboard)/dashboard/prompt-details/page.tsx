'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';
import { useBrandData } from '@/hooks/useBrandData';

interface Result { query: string; platform: string; model?: string; mentioned: boolean; sentiment?: string; position?: number; listPosition?: number; recommended?: boolean; response?: string; raw?: string; context?: string; snippet?: string; date?: string; }
interface Run { id?: string; date?: string; time?: string; sov?: number; allResults?: Result[]; results?: Result[]; }
interface Brand { id: string; name: string; queries?: string[]; runs?: Run[]; }

export default function PromptDetailsPage() {
  const { brand: rawBrand, loading } = useBrandData({ fullData: true });
  const brand = rawBrand as Brand | null;
  const [selectedQuery, setSelectedQuery] = useState('');
  const [platFilter, setPlatFilter] = useState('');
  const [periodDays, setPeriodDays] = useState(30);
  const [intentVal, setIntentVal] = useState('');
  const [funnelVal, setFunnelVal] = useState('');
  const [tagsVal, setTagsVal] = useState('');
  const [classSaved, setClassSaved] = useState(false);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);

  const queries = brand?.queries || [];
  const allRuns = brand?.runs || [];

  useEffect(() => { if (queries.length && !selectedQuery) setSelectedQuery(queries[0]); }, [queries, selectedQuery]);

  // Prompt classification (intent / funnel / tags) is a per-query annotation.
  // There is no server endpoint for it, so it is persisted locally per brand+query
  // and reloaded when the selected query changes - a real save, scoped to this device.
  const classKey = brand?.id && selectedQuery ? `pd-class:${brand.id}:${selectedQuery}` : '';
  useEffect(() => {
    if (!classKey) { setIntentVal(''); setFunnelVal(''); setTagsVal(''); return; }
    try {
      const c = JSON.parse(localStorage.getItem(classKey) || '{}');
      setIntentVal(c.intent || ''); setFunnelVal(c.funnel || ''); setTagsVal(c.tags || '');
    } catch { setIntentVal(''); setFunnelVal(''); setTagsVal(''); }
  }, [classKey]);
  function saveClassification() {
    if (!classKey) return;
    try {
      localStorage.setItem(classKey, JSON.stringify({ intent: intentVal, funnel: funnelVal, tags: tagsVal }));
      setClassSaved(true);
      setTimeout(() => setClassSaved(false), 2000);
    } catch { /* storage unavailable; non-fatal */ }
  }

  // All results for selected query across all runs within period
  const queryResults = useMemo(() => {
    const cutoff = Date.now() - periodDays * 86400000;
    const results: Result[] = [];
    allRuns.forEach(run => {
      if (run.date && new Date(run.date).getTime() < cutoff) return;
      (run.allResults || run.results || []).forEach(r => {
        if (r.query === selectedQuery) {
          if (!platFilter || r.platform === platFilter) {
            results.push({ ...r, date: r.date || run.date || run.time });
          }
        }
      });
    });
    return results;
  }, [allRuns, selectedQuery, platFilter, periodDays]);

  // Platforms for this query
  const platforms = useMemo(() => [...new Set(queryResults.map(r => r.platform))], [queryResults]);

  // KPIs
  const totalRuns = queryResults.length;
  const mentioned = queryResults.filter(r => r.mentioned).length;
  const visRate = totalRuns > 0 ? (mentioned / totalRuns * 100) : 0;
  const platFound = useMemo(() => {
    const m: Record<string, boolean> = {};
    queryResults.forEach(r => { if (r.mentioned) m[r.platform] = true; });
    return Object.keys(m).length;
  }, [queryResults]);
  const sentAgg = useMemo(() => {
    const s = { positive: 0, neutral: 0, negative: 0 };
    queryResults.forEach(r => { if (r.sentiment === 'positive') s.positive++; else if (r.sentiment === 'negative') s.negative++; else s.neutral++; });
    return s;
  }, [queryResults]);
  const domSent = sentAgg.positive >= sentAgg.negative ? 'Positive' : 'Negative';
  const domSentColor = domSent === 'Positive' ? 'var(--green)' : 'var(--red)';
  const ranked = queryResults.filter(r => r.position || r.listPosition);
  const avgPos = ranked.length > 0 ? (ranked.reduce((s, r) => s + (r.listPosition || r.position || 0), 0) / ranked.length) : 0;

  // Previous-period visibility (the equal-length window immediately before the
  // current one) → a *real* "vs prev period" delta instead of a hardcoded 0%.
  const prevVisRate = useMemo(() => {
    const now = Date.now();
    const curStart = now - periodDays * 86400000;
    const prevStart = now - periodDays * 2 * 86400000;
    let total = 0, found = 0;
    allRuns.forEach(run => {
      const t = run.date ? new Date(run.date).getTime() : NaN;
      if (isNaN(t) || t < prevStart || t >= curStart) return;
      (run.allResults || run.results || []).forEach(r => {
        if (r.query === selectedQuery && (!platFilter || r.platform === platFilter)) {
          total++; if (r.mentioned) found++;
        }
      });
    });
    return total > 0 ? (found / total) * 100 : null;
  }, [allRuns, selectedQuery, platFilter, periodDays]);
  const visDelta = prevVisRate != null ? visRate - prevVisRate : null;

  // Per-run visibility series (oldest → newest) for this query - shared by the
  // "Visibility Over Time" chart and its trend badge so they always agree.
  const runVis = useMemo(() => {
    return allRuns.slice(-10).map(run => {
      const items = (run.allResults || run.results || []).filter(r => r.query === selectedQuery);
      const m = items.filter(r => r.mentioned).length;
      return { date: run.date || run.time || '', rate: items.length > 0 ? Math.round((m / items.length) * 100) : 0 };
    }).filter(rv => rv.date);
  }, [allRuns, selectedQuery]);

  // Real trend direction from that series, replacing a permanently-"Stable" badge.
  const visTrend = useMemo(() => {
    if (runVis.length < 2) return { label: 'Not enough data', mod: 'flat' as const };
    const delta = runVis[runVis.length - 1].rate - runVis[0].rate;
    if (delta > 3) return { label: `Rising +${delta}%`, mod: 'up' as const };
    if (delta < -3) return { label: `Falling ${delta}%`, mod: 'down' as const };
    return { label: 'Stable', mod: 'flat' as const };
  }, [runVis]);

  // Per-platform performance
  const platPerf = useMemo(() => {
    const m: Record<string, { total: number; found: number; posSum: number; posCount: number; sentPos: number; sentTotal: number; recommended: number }> = {};
    queryResults.forEach(r => {
      if (!m[r.platform]) m[r.platform] = { total: 0, found: 0, posSum: 0, posCount: 0, sentPos: 0, sentTotal: 0, recommended: 0 };
      const p = m[r.platform]; p.total++;
      if (r.mentioned) p.found++;
      if (r.position || r.listPosition) { p.posSum += (r.listPosition || r.position || 0); p.posCount++; }
      if (r.sentiment) { p.sentTotal++; if (r.sentiment === 'positive') p.sentPos++; }
      if (r.recommended) p.recommended++;
    });
    return Object.entries(m).map(([name, s]) => ({ name, ...s, rate: s.total > 0 ? Math.round(s.found / s.total * 100) : 0 }));
  }, [queryResults]);

  // Recent runs (last 10)
  const recentRuns = useMemo(() => {
    const runs: Array<Result & { runDate: string }> = [];
    [...allRuns].reverse().forEach(run => {
      (run.allResults || run.results || []).forEach(r => {
        if (r.query === selectedQuery && (!platFilter || r.platform === platFilter)) {
          runs.push({ ...r, runDate: r.date || run.date || run.time || '' });
        }
      });
    });
    return runs.slice(0, 10);
  }, [allRuns, selectedQuery, platFilter]);

  function formatDate(d: string) {
    if (!d) return '-';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function exportCSV() {
    if (queryResults.length === 0) return;
    const headers = ['Date', 'Platform', 'Query', 'Mentioned', 'Sentiment', 'Position'];
    const rows = queryResults.map(r => [
      r.date || '', r.platform, r.query,
      r.mentioned ? 'Yes' : 'No', r.sentiment || '', String(r.listPosition || r.position || ''),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `prompt-details-${selectedQuery.slice(0, 30)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      {/* Header */}
      <div className="pd-header">
        <div className="pd-header-left">
          <div className="view-title">Prompt Details</div>
          <div className="view-sub">Deep analytics for each tracked query - visibility, sentiment, competitors, and trends per platform.</div>
        </div>
        <div className="pd-header-actions">
          <button className="pbtn pd-btn-outline" onClick={() => window.location.reload()}>↻ Refresh</button>
          <button className="pbtn pd-btn-primary" onClick={exportCSV}>↓ Export CSV</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="pd-toolbar">
        <div className="pd-toolbar-select-wrap">
          <label className="pd-toolbar-label" htmlFor="pd-query">Query</label>
          <select id="pd-query" className="finp pd-select" value={selectedQuery} onChange={e => setSelectedQuery(e.target.value)}>
            {queries.map(q => <option key={q} value={q}>{q}</option>)}
            {!queries.length && <option value="">No queries</option>}
          </select>
        </div>
        <div className="pd-toolbar-select-wrap pd-toolbar-plat">
          <label className="pd-toolbar-label" htmlFor="pd-platform">Platform</label>
          <select id="pd-platform" className="finp pd-select" value={platFilter} onChange={e => setPlatFilter(e.target.value)}>
            <option value="">All Platforms</option>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="pd-toolbar-select-wrap pd-toolbar-days">
          <label className="pd-toolbar-label" htmlFor="pd-period">Period</label>
          <select id="pd-period" className="finp pd-select" value={periodDays} onChange={e => setPeriodDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        <div className="pd-query-count">{queries.length} queries</div>
      </div>

      {/* KPI Metric Cards */}
      <div className="pd-metrics-grid">
        <div className="pd-metric-card pd-m-vis">
          <div className="pd-metric-top"><div className="pd-metric-label">Visibility Rate</div><div className="pd-metric-icon">◉</div></div>
          <div className="pd-metric-val" style={{ color: visRate >= 40 ? 'var(--green)' : visRate > 0 ? 'var(--amber)' : 'var(--red)' }}>{visRate.toFixed(1)}%</div>
          <div className="pd-metric-bar"><div className="pd-metric-bar-fill" style={{ width: `${Math.min(visRate, 100)}%`, background: visRate >= 40 ? 'var(--green)' : visRate > 0 ? 'var(--amber)' : 'var(--red)' }} /></div>
          <div className="pd-metric-sub">{visDelta != null ? `${visDelta >= 0 ? '+' : ''}${visDelta.toFixed(1)}% vs prev period` : 'no prior period to compare'}</div>
        </div>
        <div className="pd-metric-card pd-m-plat">
          <div className="pd-metric-top"><div className="pd-metric-label">Platforms Found</div><div className="pd-metric-icon">■</div></div>
          <div className="pd-metric-val" style={{ color: 'var(--blue)' }}>{platFound}<span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>/{platforms.length}</span></div>
          <div className="pd-metric-bar"><div className="pd-metric-bar-fill" style={{ width: `${platforms.length ? (platFound / platforms.length * 100) : 0}%`, background: 'var(--blue)' }} /></div>
          <div className="pd-metric-sub">{totalRuns} total runs across {platforms.length} platforms</div>
        </div>
        <div className="pd-metric-card pd-m-sent">
          <div className="pd-metric-top"><div className="pd-metric-label">Sentiment</div><div className="pd-metric-icon">♥</div></div>
          <div className="pd-metric-val" style={{ color: domSentColor }}>{domSent}</div>
          <div className="pd-metric-bar"><div className="pd-metric-bar-fill" style={{ width: `${sentAgg.positive + sentAgg.neutral + sentAgg.negative > 0 ? (sentAgg.positive / (sentAgg.positive + sentAgg.neutral + sentAgg.negative) * 100) : 0}%`, background: 'var(--green)' }} /></div>
          <div className="pd-metric-sub">{sentAgg.positive} pos / {sentAgg.neutral} neu / {sentAgg.negative} neg</div>
        </div>
        <div className="pd-metric-card pd-m-rank">
          <div className="pd-metric-top"><div className="pd-metric-label">Avg Position</div><div className="pd-metric-icon">★</div></div>
          <div className="pd-metric-val" style={{ color: 'var(--purple)' }}>{avgPos ? `#${avgPos.toFixed(1)}` : '-'}</div>
          <div className="pd-metric-bar"><div className="pd-metric-bar-fill" style={{ width: `${avgPos ? Math.max(5, 100 - avgPos * 10) : 0}%`, background: 'var(--purple)' }} /></div>
          <div className="pd-metric-sub">{ranked.length} platforms with ranking data</div>
        </div>
      </div>

      {/* Prompt Classification */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>Prompt Classification</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="pd-meta-label">Search Intent</label>
                <select className="finp" value={intentVal} onChange={e => setIntentVal(e.target.value)} style={{ width: '100%' }}>
                  <option value="">- Select -</option>
                  <option value="awareness">Awareness</option>
                  <option value="comparison">Comparison</option>
                  <option value="commercial">Commercial Investigation</option>
                  <option value="navigational">Navigational</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="pd-meta-label">Funnel Stage</label>
                <select className="finp" value={funnelVal} onChange={e => setFunnelVal(e.target.value)} style={{ width: '100%' }}>
                  <option value="">- Select -</option>
                  <option value="tofu">Awareness (TOFU)</option>
                  <option value="mofu">Consideration (MOFU)</option>
                  <option value="bofu">Decision (BOFU)</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="pd-meta-label">Tags</label>
                <input className="finp" type="text" placeholder="Comma-separated tags" value={tagsVal} onChange={e => setTagsVal(e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>
          </div>
          <button className="pbtn" onClick={saveClassification} disabled={!classKey} style={{ background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', fontWeight: 700, marginLeft: 18, marginTop: 24, flexShrink: 0, opacity: classKey ? 1 : 0.5 }}>{classSaved ? 'Saved ✓' : 'Save'}</button>
        </div>
      </div>

      {/* Charts Row - Visibility Over Time + Competitor Landscape */}
      <div className="ov-grid-2 pd-charts-row">
        <div className="card pd-chart-card">
          <div className="pd-chart-header">
            <div className="card-title" style={{ marginBottom: 0 }}>Visibility Over Time</div>
            <div className={`pd-trend-badge ${visTrend.mod}`}>{visTrend.label}</div>
          </div>
          <div className="pd-chart-wrap">
            {queryResults.length > 0 ? (() => {
              if (runVis.length < 2) return <div className="pd-chart-placeholder"><div className="pd-placeholder-icon">○</div><span>Need more runs for chart</span></div>;
              return (
                <svg viewBox="0 0 500 200" style={{ width: '100%', maxHeight: 200 }}>
                  {[0, 20, 40, 60, 80, 100].map(v => {
                    const y = 180 - (v / 100) * 160;
                    return <g key={v}><line x1="40" y1={y} x2="480" y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4,4" /><text x="35" y={y + 3} textAnchor="end" style={{ fontSize: 8, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>{v}</text></g>;
                  })}
                  <polyline points={runVis.map((rv, i) => `${40 + (i / (runVis.length - 1)) * 440},${180 - (rv.rate / 100) * 160}`).join(' ')} fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {runVis.map((rv, i) => <circle key={i} cx={40 + (i / (runVis.length - 1)) * 440} cy={180 - (rv.rate / 100) * 160} r="3" fill="var(--bg2)" stroke="var(--green)" strokeWidth="2" />)}
                  {runVis.filter((_, i) => i === 0 || i === runVis.length - 1).map((rv, i) => <text key={i} x={i === 0 ? 40 : 480} y={195} textAnchor={i === 0 ? 'start' : 'end'} style={{ fontSize: 7, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>{rv.date ? new Date(rv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</text>)}
                </svg>
              );
            })() : <div className="pd-chart-placeholder"><div className="pd-placeholder-icon">○</div><span>Run queries to see visibility trends</span></div>}
          </div>
        </div>
        <div className="card pd-chart-card">
          <div className="pd-chart-header">
            <div className="card-title" style={{ marginBottom: 0 }}>Competitor Landscape</div>
          </div>
          <div className="pd-chart-wrap">
            <div className="pd-chart-placeholder"><div className="pd-placeholder-icon">◉</div><span>No competitor data yet</span></div>
          </div>
        </div>
      </div>

      {/* Per-Platform Performance Table */}
      <div className="card pd-table-card">
        <div className="pd-table-title-row">
          <div className="card-title" style={{ marginBottom: 0 }}>Per-Platform Performance</div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{platPerf.length} platforms</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 14, minWidth: 720 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th className="th">Platform</th>
              <th className="th">Found</th>
              <th className="th">Mention Rate</th>
              <th className="th">Position</th>
              <th className="th">Sentiment</th>
              <th className="th">Runs</th>
              <th className="th">Recommended</th>
            </tr>
          </thead>
          <tbody>
            {platPerf.map(p => {
              const sentLabel = p.sentTotal > 0 && p.sentPos > 0 ? 'Positive' : p.sentTotal > 0 ? '-' : '-';
              const sentColor = sentLabel === 'Positive' ? 'var(--green)' : 'var(--muted)';
              return (
                <tr key={p.name} className="trow">
                  <td className="td"><span className="pd-plat-dot" style={{ background: PLATFORM_COLORS[p.name] || '#888' }} /> <strong>{p.name}</strong></td>
                  <td className="td"><span style={{ color: p.found > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 10 }}>{p.found > 0 ? 'YES' : 'NO'}</span></td>
                  <td className="td">
                    <span style={{ color: p.rate >= 40 ? 'var(--green)' : p.rate > 0 ? 'var(--amber)' : 'var(--red)', fontWeight: 700 }}>{p.rate}%</span>
                    <div className="pd-mention-rate-bar"><div className="pd-mention-rate-fill" style={{ width: `${p.rate}%`, background: p.rate >= 40 ? 'var(--green)' : p.rate > 0 ? 'var(--amber)' : 'var(--red)' }} /></div>
                  </td>
                  <td className="td" style={{ color: 'var(--muted)' }}>{p.posCount > 0 ? `#${(p.posSum / p.posCount).toFixed(1)}` : '-'}</td>
                  <td className="td"><span className="pd-plat-badge" style={{ color: sentColor, background: sentLabel === 'Positive' ? 'rgba(16,185,129,.08)' : 'var(--bg3)', border: `1px solid ${sentLabel === 'Positive' ? 'rgba(16,185,129,.2)' : 'var(--border)'}` }}>{sentLabel}</span></td>
                  <td className="td">{p.total}</td>
                  <td className="td">{p.recommended > 0 ? 'Yes' : '-'}</td>
                </tr>
              );
            })}
            {platPerf.length === 0 && <tr><td colSpan={7} className="td" style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No platform data</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {/* Recent Query Runs */}
      <div className="card pd-runs-card">
        <div className="pd-runs-header">
          <div className="card-title" style={{ marginBottom: 0 }}>Recent Query Runs</div>
          <span className="pd-runs-subtitle">Showing {recentRuns.length} of {queryResults.length} runs</span>
        </div>
        {recentRuns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 12 }}>No recent runs.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 14, minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th className="th">Platform</th>
                <th className="th">Date</th>
                <th className="th">Found</th>
                <th className="th">Sentiment</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r, i) => (
                <React.Fragment key={i}>
                <tr className="trow">
                  <td className="td"><span className="pd-run-plat" style={{ color: PLATFORM_COLORS[r.platform] || 'var(--text)' }}>{r.platform}</span></td>
                  <td className="td pd-run-date">{formatDate(r.runDate)}</td>
                  <td className="td pd-run-mentioned"><span style={{ color: r.mentioned ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.mentioned ? 'YES' : 'NO'}</span></td>
                  <td className="td pd-run-sent" style={{ color: r.sentiment === 'positive' ? 'var(--green)' : r.sentiment === 'negative' ? 'var(--red)' : 'var(--muted)' }}>{r.sentiment || 'neutral'}</td>
                  <td className="td pd-run-view"><span onClick={() => setExpandedRun(expandedRun === i ? null : i)} style={{ color: 'var(--primary)', cursor: 'pointer', fontSize: 11 }}>{expandedRun === i ? 'Hide ▲' : 'View details →'}</span></td>
                </tr>
                {expandedRun === i && (
                  <tr><td colSpan={5} style={{ padding: '12px 16px', background: 'var(--bg)', fontSize: 12, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', borderBottom: '1px solid var(--border)' }}>
                    {r.snippet || r.response || r.raw || r.context || <span style={{ color: 'var(--muted)' }}>No response text available.</span>}
                  </td></tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
