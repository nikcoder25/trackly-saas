'use client';

import { useState, useEffect, useMemo } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { PLATFORM_COLORS } from '@/lib/constants';
import { csvSafe } from '@/lib/csv';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { KpiCardsSkeleton, CardsSkeleton } from '@/components/dashboard/Skeleton';
import { useBrandData } from '@/hooks/useBrandData';
import { useRun } from '@/contexts/RunContext';

interface Result { query: string; platform: string; model?: string; mentioned: boolean; sentiment?: string; position?: number; listPosition?: number; recommended?: boolean; response?: string; raw?: string; context?: string; snippet?: string; error?: string; errorMessage?: string; competitorMentions?: string[]; citations?: string[]; }
interface Run { id?: string; date?: string; time?: string; created_at?: string; sov?: number; durationMs?: number; queries?: string[]; allResults?: Result[]; results?: Result[]; }
interface Brand { id: string; name: string; queries?: string[]; runs?: Run[]; }

export default function ProofPage() {
  const { brand: rawBrand, loading } = useBrandData({ fullData: true });
  const brand = rawBrand as Brand | null;
  const { live, pct: runPct } = useRun();
  const [selectedRunId, setSelectedRunId] = useState('');
  const [platFilter, setPlatFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grouped'|'flat'>('grouped');
  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());

  const runs = useMemo(() => (brand?.runs || []).slice().reverse(), [brand]);
  useEffect(() => { if (runs.length && !selectedRunId) setSelectedRunId(runs[0].id || ''); }, [runs, selectedRunId]);

  const run = useMemo(() => {
    if (!selectedRunId) return runs[0] || null;
    return (brand?.runs || []).find(r => r.id === selectedRunId) || runs[0] || null;
  }, [selectedRunId, runs, brand]);

  // Show live run results in place of the stored "latest" run while a run is
  // active for this brand. Historical runs show their stored data unchanged.
  const viewingLatest = !selectedRunId || selectedRunId === (runs[0]?.id || '');
  const liveForThisBrand = live.running && live.brandId === brand?.id;
  const showLive = liveForThisBrand && viewingLatest && live.results.length > 0;
  const allResults: Result[] = showLive
    ? (live.results as Result[])
    : (run?.allResults || run?.results || []);
  const queries = useMemo(() => {
    const rq = run?.queries || [];
    const resultQs = [...new Set(allResults.map(r => r.query))];
    return rq.length ? rq : resultQs.length ? resultQs : (brand?.queries || []);
  }, [run, allResults, brand]);

  // Stats
  const totalResults = allResults.length;
  const foundCount = allResults.filter(r => r.mentioned).length;
  const notFoundCount = totalResults - foundCount;
  const uniquePlats = [...new Set(allResults.map(r => r.platform))];
  const foundPct = totalResults > 0 ? Math.round((foundCount / totalResults) * 100) : 0;
  // During a live run, the stored run.sov refers to the previous run — derive
  // SOV from in-progress results instead so the banner stays accurate.
  const sovPct = showLive ? foundPct : (run?.sov || 0);
  const sovColor = sovPct >= 70 ? '#10b981' : sovPct >= 40 ? '#f59e0b' : '#ef4444';
  const sentPos = allResults.filter(r => r.sentiment === 'positive').length;
  const sentNeg = allResults.filter(r => r.sentiment === 'negative').length;
  const sentNeu = totalResults - sentPos - sentNeg;

  // Per-query stats
  const qStats = useMemo(() => {
    const m: Record<string, { found: number; total: number }> = {};
    allResults.forEach(r => { if (!m[r.query]) m[r.query] = { found: 0, total: 0 }; m[r.query].total++; if (r.mentioned) m[r.query].found++; });
    return m;
  }, [allResults]);

  // Per-platform stats
  const platStats = useMemo(() => {
    const m: Record<string, { found: number; total: number }> = {};
    allResults.forEach(r => { if (!m[r.platform]) m[r.platform] = { found: 0, total: 0 }; m[r.platform].total++; if (r.mentioned) m[r.platform].found++; });
    return m;
  }, [allResults]);

  // Best/worst queries
  const bestQuery = useMemo(() => {
    let best = '', bestS = -1;
    Object.entries(qStats).forEach(([q, s]) => { const sv = s.total > 0 ? Math.round((s.found / s.total) * 100) : 0; if (sv > bestS) { bestS = sv; best = q; } });
    return { query: best, pct: bestS };
  }, [qStats]);
  const worstQuery = useMemo(() => {
    let worst = '', worstS = 101;
    Object.entries(qStats).forEach(([q, s]) => { const sv = s.total > 0 ? Math.round((s.found / s.total) * 100) : 0; if (sv < worstS) { worstS = sv; worst = q; } });
    return { query: worst, pct: worstS };
  }, [qStats]);

  // Filtered results
  const filtered = useMemo(() => allResults.filter(r => {
    if (platFilter && r.platform !== platFilter) return false;
    if (resultFilter === 'found' && !r.mentioned) return false;
    if (resultFilter === 'notfound' && (r.mentioned || r.error)) return false;
    return true;
  }), [allResults, platFilter, resultFilter]);

  // Grouped by query
  const grouped = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, Result[]> = {};
    filtered.forEach(r => { if (!map[r.query]) { map[r.query] = []; order.push(r.query); } map[r.query].push(r); });
    return { order, map };
  }, [filtered]);

  function escHtml(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function highlightBrand(text: string) {
    if (!brand || !text) return escHtml(text);
    const escaped = escHtml(brand.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escHtml(text).replace(new RegExp(`(${escaped})`, 'gi'),
      '<mark style="color:var(--green);background:rgba(16,185,129,.12);padding:0 3px;border-radius:3px;font-weight:700;">$1</mark>');
  }
  function renderMarkdown(text: string) {
    if (!text) return '';
    let html = escHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg);padding:1px 4px;border-radius:3px;font-family:var(--mono);font-size:11px;">$1</code>');
    html = html.replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>');
    html = html.replace(/^[-•]\s+(.+)$/gm, '&nbsp;&nbsp;• $1');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">$1</a>');
    if (brand) {
      const escaped = escHtml(brand.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp(`(${escaped})`, 'gi'),
        '<mark style="color:var(--green);background:rgba(16,185,129,.12);padding:0 3px;border-radius:3px;font-weight:700;">$1</mark>');
    }
    return html;
  }

  function exportCSV() {
    try {
      const rows = [['Platform', 'Query', 'Mentioned', 'Sentiment', 'Recommended', 'Response'].join(',')];
      allResults.forEach(r => rows.push([csvSafe(r.platform), csvSafe(r.query), r.mentioned ? 'Yes' : 'No', r.sentiment || '', r.recommended ? 'Yes' : 'No', csvSafe(r.response || r.raw || r.context || r.snippet || '')].join(',')));
      const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `livesov-proof-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* export failed silently */ }
  }

  function toggleQuery(q: string) {
    setExpandedQueries(prev => { const n = new Set(prev); n.has(q) ? n.delete(q) : n.add(q); return n; });
  }

  if (loading) return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ height: 22, width: 180, borderRadius: 6, background: 'var(--bg3)', marginBottom: 8 }} />
        <div style={{ height: 13, width: 320, borderRadius: 4, background: 'var(--bg3)' }} />
      </div>
      <KpiCardsSkeleton count={4} />
      <CardsSkeleton count={4} />
    </div>
  );

  return (
    <div>
      <LockedBrandBanner />
      {/* Header */}
      <div className="proof-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div className="view-title">Evidence &amp; Proof</div>
          <div className="view-sub">Every AI response about your brand — verified and organized.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {showLive && (
            <span title="A run is in progress — showing live results as they arrive" style={{ display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:999,background:'rgba(16,185,129,.08)',border:'1px solid rgba(16,185,129,.35)',fontFamily:'var(--mono)',fontSize:10,fontWeight:700,color:'var(--green)',letterSpacing:'.04em',animation:'pulseGlow 1.8s ease-in-out infinite' }}>
              <span style={{ width:6,height:6,borderRadius:'50%',background:'#10b981' }} />
              LIVE · {live.received}/{live.totalExpected || '…'}{runPct ? ` · ${runPct}%` : ''}
            </span>
          )}
          <button className="pbtn" onClick={exportCSV} style={{ borderRadius: 10 }}>↓ Export CSV</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="proof-toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Run</label>
          <select value={selectedRunId} onChange={e => setSelectedRunId(e.target.value)} aria-label="Select run" disabled={showLive} title={showLive ? 'Live run in progress — showing current run' : undefined}>
            {runs.map((r, i) => {
              const d = new Date(r.time || r.date || 0);
              const label = isNaN(d.getTime()) ? `Run ${i + 1}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} — SOV ${r.sov || 0}%`;
              return <option key={r.id || i} value={r.id || ''}>{label}</option>;
            })}
            {runs.length === 0 && <option value="">No runs yet</option>}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Platform</label>
          <select value={platFilter} onChange={e => setPlatFilter(e.target.value)} aria-label="Filter by platform">
            <option value="">All Platforms</option>
            {uniquePlats.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Result</label>
          <select value={resultFilter} onChange={e => setResultFilter(e.target.value)} aria-label="Filter by result">
            <option value="">All Results</option>
            <option value="found">Found Only</option>
            <option value="notfound">Not Found Only</option>
          </select>
        </div>
        <div className="proof-vtoggle">
          <button style={{ background: viewMode === 'grouped' ? 'var(--primary)' : 'var(--bg3)', color: viewMode === 'grouped' ? '#fff' : 'var(--muted)' }} onClick={() => setViewMode('grouped')}>By Query</button>
          <button style={{ background: viewMode === 'flat' ? 'var(--primary)' : 'var(--bg3)', color: viewMode === 'flat' ? '#fff' : 'var(--muted)' }} onClick={() => setViewMode('flat')}>All</button>
        </div>
      </div>

      {!run && !showLive ? (
        <div style={{ textAlign: 'center', padding: '70px 20px' }}>
          <div style={{ fontSize: 36, opacity: .25, marginBottom: 12 }}>◆</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>No runs yet</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Click <strong style={{ color: 'var(--primary)' }}>Run Queries</strong> to start.</div>
        </div>
      ) : (
        <>
          {/* Score Banner */}
          <div className="ep-banner">
            <div className="ep-banner-ring">
              <svg viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="var(--bg3)" strokeWidth="5" />
                <circle cx="40" cy="40" r="36" fill="none" stroke={sovColor} strokeWidth="5"
                  strokeDasharray="226.2" strokeDashoffset={226.2 - Math.round((sovPct / 100) * 226.2)} strokeLinecap="round"
                  transform="rotate(-90 40 40)" style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)' }} />
              </svg>
              <div className="ep-banner-ring-lbl">
                <span className="ep-banner-ring-pct" style={{ color: sovColor }}>{sovPct}%</span>
                <span className="ep-banner-ring-sub">SOV</span>
              </div>
            </div>
            <div className="ep-banner-metrics">
              <div className="ep-banner-metric"><div className="ep-banner-metric-val" style={{ color: 'var(--green)' }}>{foundCount}</div><div className="ep-banner-metric-lbl">Found</div><div className="ep-banner-metric-bar"><div style={{ width: `${foundPct}%`, background: 'var(--green)' }} /></div></div>
              <div className="ep-banner-metric"><div className="ep-banner-metric-val" style={{ color: 'var(--red)' }}>{notFoundCount}</div><div className="ep-banner-metric-lbl">Not Found</div></div>
              <div className="ep-banner-metric"><div className="ep-banner-metric-val">{queries.length}</div><div className="ep-banner-metric-lbl">Queries</div></div>
              <div className="ep-banner-metric"><div className="ep-banner-metric-val" style={{ color: 'var(--blue)' }}>{uniquePlats.length}</div><div className="ep-banner-metric-lbl">Platforms</div></div>
              <div className="ep-banner-metric"><div className="ep-banner-metric-val">{totalResults}</div><div className="ep-banner-metric-lbl">Total Checks</div></div>
              <div className="ep-banner-metric">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>{sentPos}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>{sentNeu}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 800, color: 'var(--red)' }}>{sentNeg}</span>
                </div>
                <div className="ep-banner-metric-lbl">Sentiment</div>
              </div>
              <div className="ep-banner-metric"><div className="ep-banner-metric-val" style={{ color: 'var(--green)' }}>{foundPct}%</div><div className="ep-banner-metric-lbl">Hit Rate</div></div>
              <div className="ep-banner-metric"><div className="ep-banner-metric-val" style={{ fontSize: 14 }}>{run.durationMs ? (run.durationMs / 1000).toFixed(1) + 's' : '—'}</div><div className="ep-banner-metric-lbl">Run Time</div></div>
            </div>
          </div>

          {/* Platform Cards Row */}
          <div className="ep-plat-row">
            {uniquePlats.map(p => {
              const ps = platStats[p] || { found: 0, total: 0 };
              const pPct = ps.total > 0 ? Math.round((ps.found / ps.total) * 100) : 0;
              const pColor = pPct >= 70 ? 'var(--green)' : pPct >= 40 ? 'var(--amber)' : 'var(--red)';
              const ringDash = Math.round((pPct / 100) * 62.8);
              return (
                <div key={p} className="ep-plat-card">
                  <span className="ep-plat-dot" style={{ background: PLATFORM_COLORS[p] || '#888' }} />
                  <div className="ep-plat-info">
                    <div className="ep-plat-name">{p}</div>
                    <div className="ep-plat-score" style={{ color: pColor }}>{ps.found}/{ps.total} Found</div>
                  </div>
                  <div className="ep-plat-minibar">
                    <svg viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="var(--bg3)" strokeWidth="2.5" />
                      <circle cx="12" cy="12" r="10" fill="none" stroke={pColor} strokeWidth="2.5"
                        strokeDasharray="62.8" strokeDashoffset={62.8 - ringDash} strokeLinecap="round" transform="rotate(-90 12 12)" />
                    </svg>
                    <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 800, color: pColor }}>{pPct}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Insights — Best & Worst Query */}
          {Object.keys(qStats).length > 1 && (
            <div className="ep-insights">
              <div className="ep-insight-card">
                <div className="ep-insight-badge" style={{ background: 'rgba(16,185,129,.08)', color: 'var(--green)' }}>▲</div>
                <div className="ep-insight-text">
                  <div className="ep-insight-label" style={{ color: 'var(--green)' }}>Best Query</div>
                  <div className="ep-insight-query">{bestQuery.query}</div>
                </div>
                <div className="ep-insight-pct" style={{ color: 'var(--green)' }}>{bestQuery.pct}%</div>
              </div>
              <div className="ep-insight-card">
                <div className="ep-insight-badge" style={{ background: 'rgba(239,68,68,.08)', color: 'var(--red)' }}>▼</div>
                <div className="ep-insight-text">
                  <div className="ep-insight-label" style={{ color: 'var(--red)' }}>Needs Work</div>
                  <div className="ep-insight-query">{worstQuery.query}</div>
                </div>
                <div className="ep-insight-pct" style={{ color: 'var(--red)' }}>{worstQuery.pct}%</div>
              </div>
            </div>
          )}

          {/* Results — Grouped by Query or Flat */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 28, opacity: .25, marginBottom: 10 }}>◇</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>No results match your filters.</div>
            </div>
          ) : viewMode === 'grouped' ? (
            <div>
              {grouped.order.map((q, gi) => {
                const res = grouped.map[q];
                const qF = res.filter(r => r.mentioned).length;
                const qT = res.length;
                const isOpen = expandedQueries.has(q);
                const foundOn = res.filter(r => r.mentioned).map(r => r.platform);

                return (
                  <div key={q} className="ep-qcard">
                    <button type="button" className={`ep-qcard-head ${isOpen ? '' : 'collapsed'}`} onClick={() => toggleQuery(q)} style={{ cursor: 'pointer', width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left', font: 'inherit', color: 'inherit', display: 'flex', alignItems: 'center' }} aria-expanded={isOpen} aria-label={`Toggle details for query: ${q}`}>
                      <div className="ep-qcard-idx">{gi + 1}</div>
                      <div className="ep-qcard-mid">
                        <div className="ep-qcard-title">{q}</div>
                        <div className="ep-qcard-sub">{foundOn.length ? foundOn.join(', ') : 'Not found on any platform'}</div>
                      </div>
                      <div className="ep-qcard-dots">
                        {res.map((r, ri) => {
                          const bg = r.error ? 'var(--amber)' : r.mentioned ? 'var(--green)' : 'var(--red)';
                          return <span key={ri} className="ep-qcard-dot" style={{ background: bg }} title={`${r.platform}: ${r.mentioned ? 'Found' : 'Not Found'}`}>{(r.platform || '?')[0]}</span>;
                        })}
                      </div>
                      <div className="ep-qcard-stat" style={{ color: qF > 0 ? 'var(--text)' : 'var(--muted)' }}>{qF}/{qT}</div>
                      <div className="ep-qcard-chevron">{isOpen ? '▲' : '▼'}</div>
                    </button>
                    {isOpen && (
                      <div className="ep-qcard-body">
                        {res.map((r, ri) => <ProofRow key={ri} r={r} highlightBrand={highlightBrand} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ep-flat">
              {filtered.map((r, i) => <ProofRow key={i} r={r} highlightBrand={highlightBrand} showQuery />)}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="ep-footer">Showing {filtered.length} of {totalResults} results across {uniquePlats.length} platform{uniquePlats.length !== 1 ? 's' : ''}</div>
          )}
        </>
      )}
    </div>
  );
}

function ProofRow({ r, highlightBrand, showQuery }: { r: { platform: string; model?: string; query: string; mentioned: boolean; error?: string; errorMessage?: string; response?: string; raw?: string; context?: string; snippet?: string; sentiment?: string; recommended?: boolean; listPosition?: number; position?: number; competitorMentions?: string[] }; highlightBrand: (t: string) => string; showQuery?: boolean }) {
  const txt = r.error ? '' : (r.raw || r.response || r.context || r.snippet || '');
  const excerpt = txt.replace(/[#*_~`]/g, '').replace(/\n/g, ' ').substring(0, 260);
  const sent = r.error ? '—' : (r.sentiment || 'neutral');
  const sentC = sent === 'positive' ? 'var(--green)' : sent === 'negative' ? 'var(--red)' : 'var(--muted)';
  const pos = r.mentioned && (r.listPosition || r.position) ? `#${r.listPosition || r.position}` : '';
  const statusLabel = r.error ? 'ERROR' : r.mentioned ? 'FOUND' : 'NOT FOUND';
  const statusClass = r.error ? 'error' : r.mentioned ? 'found' : 'notfound';

  return (
    <div className="ep-row">
      <div className="ep-row-left">
        <div className="ep-row-plat">
          <span className="ep-row-plat-dot" style={{ background: PLATFORM_COLORS[r.platform] || '#888' }} />
          <span className="ep-row-plat-name" style={{ color: PLATFORM_COLORS[r.platform] || '#888' }}>{r.platform}</span>
        </div>
      </div>
      <div className="ep-row-mid">
        {showQuery && <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 4, fontFamily: 'var(--mono)' }}>{r.query}</div>}
        <div className={`ep-row-excerpt ${statusClass}`}>
          {r.error ? <span style={{ color: 'var(--amber)' }}>{r.errorMessage || r.error}</span>
            : <span dangerouslySetInnerHTML={{ __html: sanitizeHtml('\u201c' + highlightBrand(excerpt) + (excerpt.length >= 260 ? '...' : '') + '\u201d') }} />}
        </div>
        <div className="ep-row-tags">
          {pos && <span className="ep-tag"><span className="ep-tag-dot" style={{ background: 'var(--blue)' }} />Rank {pos}</span>}
          <span className="ep-tag"><span className="ep-tag-dot" style={{ background: sentC }} />{sent.charAt(0).toUpperCase() + sent.slice(1)}</span>
          {r.recommended && <span className="ep-tag" style={{ color: 'var(--green)' }}><span className="ep-tag-dot" style={{ background: 'var(--green)' }} />Recommended</span>}
          {r.mentioned && r.competitorMentions && r.competitorMentions.length > 0 && <span className="ep-tag">{r.competitorMentions.length} competitor{r.competitorMentions.length > 1 ? 's' : ''}</span>}
        </div>
      </div>
      <div className="ep-row-right">
        <span className={`ep-row-status ${statusClass}`}>{statusLabel}</span>
      </div>
    </div>
  );
}
