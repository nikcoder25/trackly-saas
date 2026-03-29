'use client';

import { useState, useEffect, useMemo } from 'react';
import { PLATFORM_COLORS } from '@/lib/constants';

interface KTKeyword { keyword: string; mentionRate: number; change: number | null; totalRuns: number; platformCount: number; avgPosition: number | null; lastUpdated: string; sparkline?: number[]; platforms?: Record<string, number>; }
interface Brand { id: string; name: string; }

type SortField = 'keyword' | 'mentionRate' | 'change' | 'totalRuns' | 'platformCount' | 'avgPosition' | 'lastUpdated';

export default function QueryTrackerPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [keywords, setKeywords] = useState<KTKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('day');
  const [filterText, setFilterText] = useState('');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { const b = d.brands || []; setBrands(b); if (b.length) setBrand(b[0]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!brand) return;
    // Try API first, fall back to computing from brand runs
    fetch(`/api/brands/${brand.id}/keyword-tracker?period=${period}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.keywords && d.keywords.length > 0) {
          setKeywords(d.keywords);
        } else {
          // Compute from brand runs as fallback
          computeFromRuns();
        }
      })
      .catch(() => computeFromRuns());

    function computeFromRuns() {
      const runs = (brand as unknown as Record<string, unknown>).runs as Array<{ date?: string; time?: string; allResults?: Array<{ query: string; platform: string; mentioned: boolean; position?: number }> }> | undefined;
      if (!runs || !runs.length) { setKeywords([]); return; }
      const map: Record<string, { keyword: string; totalRuns: number; mentionCount: number; platforms: Set<string>; posSum: number; posCount: number; lastDate: string; history: number[] }> = {};
      runs.forEach(run => {
        const results = run.allResults || [];
        const queryMap: Record<string, { mentioned: number; total: number }> = {};
        results.forEach(r => {
          if (!queryMap[r.query]) queryMap[r.query] = { mentioned: 0, total: 0 };
          queryMap[r.query].total++;
          if (r.mentioned) queryMap[r.query].mentioned++;
          if (!map[r.query]) map[r.query] = { keyword: r.query, totalRuns: 0, mentionCount: 0, platforms: new Set(), posSum: 0, posCount: 0, lastDate: '', history: [] };
          map[r.query].platforms.add(r.platform);
          if (r.position) { map[r.query].posSum += r.position; map[r.query].posCount++; }
        });
        Object.entries(queryMap).forEach(([q, s]) => {
          if (!map[q]) return;
          map[q].totalRuns += s.total;
          map[q].mentionCount += s.mentioned;
          map[q].lastDate = run.date || run.time || map[q].lastDate;
          map[q].history.push(s.total > 0 ? Math.round(s.mentioned / s.total * 100) : 0);
        });
      });
      const computed: KTKeyword[] = Object.values(map).map(m => ({
        keyword: m.keyword,
        mentionRate: m.totalRuns > 0 ? Math.round(m.mentionCount / m.totalRuns * 100) : 0,
        change: m.history.length >= 2 ? m.history[m.history.length - 1] - m.history[m.history.length - 2] : null,
        totalRuns: m.totalRuns,
        platformCount: m.platforms.size,
        avgPosition: m.posCount > 0 ? Math.round(m.posSum / m.posCount) : null,
        lastUpdated: m.lastDate,
        sparkline: m.history.length > 1 ? m.history.slice(-7) : undefined,
      }));
      setKeywords(computed);
    }
  }, [brand, period]);

  const filtered = useMemo(() => {
    let rows = [...keywords];
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      rows = rows.filter(k => k.keyword.toLowerCase().includes(q));
    }
    if (sortField) {
      rows.sort((a, b) => {
        let va: number | string, vb: number | string;
        switch (sortField) {
          case 'keyword': va = a.keyword.toLowerCase(); vb = b.keyword.toLowerCase(); break;
          case 'mentionRate': va = a.mentionRate; vb = b.mentionRate; break;
          case 'change': va = a.change ?? -999; vb = b.change ?? -999; break;
          case 'totalRuns': va = a.totalRuns; vb = b.totalRuns; break;
          case 'platformCount': va = a.platformCount; vb = b.platformCount; break;
          case 'avgPosition': va = a.avgPosition ?? 999; vb = b.avgPosition ?? 999; break;
          case 'lastUpdated': va = a.lastUpdated || ''; vb = b.lastUpdated || ''; break;
          default: va = a.mentionRate; vb = b.mentionRate;
        }
        if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
        return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
      });
    }
    return rows;
  }, [keywords, filterText, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'keyword' ? 'asc' : 'desc'); }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  function formatDate(d: string) {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '-';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function sparklineSvg(data?: number[]) {
    if (!data || data.length < 2) return <span style={{ color: 'var(--muted)' }}>—</span>;
    const max = Math.max(...data, 1);
    const w = 80, h = 24;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
    const lastVal = data[data.length - 1];
    const color = lastVal >= 40 ? 'var(--green)' : lastVal > 0 ? 'var(--amber)' : 'var(--red)';
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><div style={{ width: 32, height: 32, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /></div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div>
          <div className="view-title">Query Tracker</div>
          <div className="view-sub">Track visibility and rank changes for each query across AI platforms over time.</div>
        </div>
      </div>

      {/* Period Tabs */}
      <div className="kt-period-tabs">
        {['day', 'week', 'month'].map(p => (
          <button key={p} className={`kt-period-tab ${period === p ? 'active' : ''}`}
            onClick={() => { setPeriod(p); setExpanded(null); setSortField(null); setFilterText(''); }}>
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Filter Input */}
      <div className="kt-filter-row">
        <input type="text" className="finp kt-filter-input" placeholder="Type to filter keywords"
          value={filterText} onChange={e => setFilterText(e.target.value)} />
      </div>

      {/* Empty State */}
      {keywords.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: .3 }}>◇</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No Keyword Data Yet</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, maxWidth: 340, margin: '0 auto' }}>
            Run queries from Brand Setup to start tracking keyword visibility over time.
          </div>
        </div>
      ) : (
        <>
          {/* Table Header */}
          <div className="kt-table-header">
            <div className="kt-col kt-col-kw kt-sortable" onClick={() => handleSort('keyword')}>Keyword{sortIcon('keyword')}</div>
            <div className="kt-col kt-col-vis kt-sortable" onClick={() => handleSort('mentionRate')}>Visibility{sortIcon('mentionRate')}</div>
            <div className="kt-col kt-col-change kt-sortable" onClick={() => handleSort('change')}>Change{sortIcon('change')}</div>
            <div className="kt-col kt-col-runs kt-sortable" onClick={() => handleSort('totalRuns')}>Runs{sortIcon('totalRuns')}</div>
            <div className="kt-col kt-col-plats kt-sortable" onClick={() => handleSort('platformCount')}>Platforms{sortIcon('platformCount')}</div>
            <div className="kt-col kt-col-pos kt-sortable" onClick={() => handleSort('avgPosition')}>Avg Position{sortIcon('avgPosition')}</div>
            <div className="kt-col kt-col-spark">Movement</div>
            <div className="kt-col kt-col-updated kt-sortable" onClick={() => handleSort('lastUpdated')}>Updated{sortIcon('lastUpdated')}</div>
          </div>

          {/* Keyword Rows */}
          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
              <p style={{ color: 'var(--muted)', fontSize: 12 }}>No keywords match your filter.</p>
            </div>
          ) : (
            <div>
              {filtered.map((kw, idx) => {
                const rateColor = kw.mentionRate >= 40 ? 'var(--green)' : kw.mentionRate > 0 ? 'var(--amber)' : 'var(--muted)';
                const changeStr = kw.change != null ? (kw.change > 0 ? '+' + kw.change : String(kw.change)) : '-';
                const changeColor = kw.change != null && kw.change > 0 ? 'var(--green)' : kw.change != null && kw.change < 0 ? 'var(--red)' : 'var(--muted)';
                const changeArrow = kw.change != null && kw.change > 0 ? '▲ ' : kw.change != null && kw.change < 0 ? '▼ ' : '';
                const posStr = kw.avgPosition != null ? '#' + kw.avgPosition : '-';
                const isExpanded = expanded === idx;

                return (
                  <div key={idx} className={`kt-row-wrap ${isExpanded ? 'kt-expanded' : ''}`}>
                    <div className="kt-row" onClick={() => setExpanded(isExpanded ? null : idx)} style={{ cursor: 'pointer' }}>
                      <div className="kt-col kt-col-kw">
                        <span className="kt-expand-icon">{isExpanded ? '▼' : '▶'}</span>
                        <span className="kt-kw-text">{kw.keyword}</span>
                      </div>
                      <div className="kt-col kt-col-vis"><span style={{ color: rateColor, fontWeight: 700 }}>{kw.mentionRate}%</span></div>
                      <div className="kt-col kt-col-change"><span style={{ color: changeColor, fontWeight: 600 }}>{changeArrow}{changeStr}</span></div>
                      <div className="kt-col kt-col-runs">{kw.totalRuns}</div>
                      <div className="kt-col kt-col-plats">{kw.platformCount}</div>
                      <div className="kt-col kt-col-pos" style={{ fontWeight: 700, color: 'var(--purple)' }}>{posStr}</div>
                      <div className="kt-col kt-col-spark">{sparklineSvg(kw.sparkline)}</div>
                      <div className="kt-col kt-col-updated">{formatDate(kw.lastUpdated)}</div>
                    </div>

                    {/* Expanded chart panel */}
                    {isExpanded && (
                      <div className="kt-graph-panel" style={{ display: 'block', padding: 20 }}>
                        {kw.platforms ? (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Per-Platform Visibility</div>
                            {Object.entries(kw.platforms).map(([plat, rate]) => (
                              <div key={plat} className="qperf-bar-row">
                                <div className="qperf-bar-label" style={{ color: PLATFORM_COLORS[plat] || 'var(--text)' }}>{plat}</div>
                                <div className="qperf-bar-track">
                                  <div className="qperf-bar-fill" style={{ width: `${rate}%`, background: rate > 40 ? 'var(--green)' : 'var(--amber)' }} />
                                </div>
                                <div className="qperf-bar-value" style={{ color: rate > 40 ? 'var(--green)' : 'var(--amber)' }}>{rate}%</div>
                              </div>
                            ))}
                          </div>
                        ) : kw.sparkline && kw.sparkline.length > 1 ? (
                          <div style={{ padding: '10px 0' }}>
                            <svg viewBox="0 0 600 200" style={{ width: '100%', maxHeight: 200 }}>
                              {/* Y-axis labels */}
                              {[0, 25, 50, 75, 100].map(v => {
                                const y = 180 - (v / 100) * 160;
                                return (
                                  <g key={v}>
                                    <line x1="40" y1={y} x2="580" y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4,4" />
                                    <text x="35" y={y + 3} textAnchor="end" style={{ fontSize: 9, fontFamily: 'var(--mono)', fill: 'var(--muted)' }}>{v}%</text>
                                  </g>
                                );
                              })}
                              {/* Line */}
                              <polyline
                                points={kw.sparkline.map((v, i) => `${40 + (i / (kw.sparkline!.length - 1)) * 540},${180 - (v / 100) * 160}`).join(' ')}
                                fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                              />
                              {/* Data dots */}
                              {kw.sparkline.map((v, i) => (
                                <circle key={i} cx={40 + (i / (kw.sparkline!.length - 1)) * 540} cy={180 - (v / 100) * 160} r="3" fill="var(--bg2)" stroke="var(--green)" strokeWidth="2" />
                              ))}
                            </svg>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, fontSize: 10 }}>
                              {Object.keys(PLATFORM_COLORS).map(p => (
                                <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: PLATFORM_COLORS[p] }} /> {p}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 12 }}>No historical data available for chart.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
