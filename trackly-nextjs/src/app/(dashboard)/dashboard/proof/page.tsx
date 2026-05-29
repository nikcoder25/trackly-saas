'use client';

import { useState, useEffect, useMemo } from 'react';
import { highlightBrand as highlightBrandText, sanitizeHtml } from '@/lib/sanitize';
import { csvSafe } from '@/lib/csv';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { KpiCardsSkeleton, CardsSkeleton } from '@/components/dashboard/Skeleton';
import { useBrandData } from '@/hooks/useBrandData';
import { useRun } from '@/contexts/RunContext';
import { Card, Badge, Pill, PlatformTile, Cit, Filter, Seg, PageHead, type Platform } from '@/app/dashboard-v2/ui';

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
  // During a live run, the stored run.sov refers to the previous run - derive
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

  const highlightBrand = useMemo(
    () => (text: string) => highlightBrandText(text, brand?.name),
    [brand],
  );

  // The single result featured in the "Verbatim model output" card: prefer the
  // first mentioned result in the current filter, else the first result.
  const proof = useMemo<Result | null>(() => {
    if (!filtered.length) return null;
    return filtered.find(r => r.mentioned && !r.error) || filtered[0];
  }, [filtered]);
  const proofQuery = proof?.query || '';
  // All engines that ran the same query as the featured result.
  const sameQuery = useMemo(
    () => (proofQuery ? allResults.filter(r => r.query === proofQuery) : []),
    [allResults, proofQuery],
  );
  // Resolve a v2 Platform descriptor for a given platform name (for PlatformTile).
  const platformFor = useMemo(
    () => (name: string): Platform => ({ id: (name || '').toLowerCase().replace(/[^a-z0-9]/g, ''), name, short: (name || '?').slice(0, 3).toUpperCase(), sov: 0, delta: 0, ok: true, ms: 0 }),
    [],
  );
  const proofText = proof && !proof.error ? (proof.raw || proof.response || proof.context || proof.snippet || '') : '';
  const proofExcerpt = proofText.replace(/[#*_~`]/g, '').replace(/\n/g, ' ').trim();
  const proofSent = proof?.error ? 'error' : (proof?.sentiment || 'neutral');
  const proofTone = proofSent === 'positive' ? 'pos' : proofSent === 'negative' ? 'neg' : proofSent === 'error' ? 'warn' : 'neu';
  const proofPos = proof?.mentioned && (proof.listPosition || proof.position) ? `${proof.listPosition || proof.position}` : '';

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
    <div className="lvx">
      <PageHead title="Evidence & Proof" sub="Every AI response about your brand — verified and organized." />
      <div className="page-body">
        <KpiCardsSkeleton count={4} />
        <CardsSkeleton count={4} />
      </div>
    </div>
  );

  return (
    <div className="lvx">
      <LockedBrandBanner />
      <PageHead
        title="Evidence & Proof"
        sub="Every AI response about your brand — verified and organized."
        actions={
          <>
            {showLive && (
              <Pill tone="acc"><span className="pulse" style={{ width: 5, height: 5 }} /> LIVE · {live.received}/{live.totalExpected || '…'}{runPct ? ` · ${runPct}%` : ''}</Pill>
            )}
            <button className="btn-d" onClick={exportCSV}>⇣ Export CSV</button>
          </>
        }
      />
      <div className="page-body">
        <Filter>
          <Seg
            value={viewMode}
            onChange={v => setViewMode(v as 'grouped' | 'flat')}
            options={[{ value: 'grouped', label: 'BY QUERY' }, { value: 'flat', label: 'ALL' }]}
          />
          <select className="sel" value={selectedRunId} onChange={e => setSelectedRunId(e.target.value)} aria-label="Select run" disabled={showLive} title={showLive ? 'Live run in progress - showing current run' : undefined}>
            {runs.map((r, i) => {
              const d = new Date(r.time || r.date || 0);
              const label = isNaN(d.getTime()) ? `Run ${i + 1}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - SOV ${r.sov || 0}%`;
              return <option key={r.id || i} value={r.id || ''}>{label}</option>;
            })}
            {runs.length === 0 && <option value="">No runs yet</option>}
          </select>
          <select className="sel" value={platFilter} onChange={e => setPlatFilter(e.target.value)} aria-label="Filter by platform">
            <option value="">All engines</option>
            {uniquePlats.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="sel" value={resultFilter} onChange={e => setResultFilter(e.target.value)} aria-label="Filter by result">
            <option value="">All results</option>
            <option value="found">Found only</option>
            <option value="notfound">Not found only</option>
          </select>
          {run && <Pill>SOV {sovPct}% · {foundCount}/{totalResults} found</Pill>}
          <span style={{ flex: 1 }} />
        </Filter>

        {!run && !showLive ? (
          <Card title="No runs yet">
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--mute)' }}>
              <div style={{ fontSize: 28, opacity: .35, marginBottom: 12 }}>◆</div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No runs yet</div>
              <div style={{ fontSize: 12.5 }}>Click <b style={{ color: 'var(--primary)' }}>Run Queries</b> to start.</div>
            </div>
          </Card>
        ) : filtered.length === 0 ? (
          <Card title="No matching results">
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--mute)' }}>
              <div style={{ fontSize: 26, opacity: .35, marginBottom: 10 }}>◇</div>
              <div style={{ fontSize: 12.5 }}>No results match your filters.</div>
            </div>
          </Card>
        ) : (
          <div className="g2">
            {proof && (
              <Card
                title="Verbatim model output"
                right={<>
                  <PlatformTile p={platformFor(proof.platform)} size={22} />
                  <Badge tone={proofTone}>{proof.error ? 'ERROR' : proof.mentioned ? `FOUND${proofPos ? ' · ' + proofPos : ''}` : 'NOT FOUND'}</Badge>
                </>}
                style={{ gridColumn: 'span 2' }}
              >
                <div className="proof-body">
                  <div className="proof-q mono"><span className="dim">QUERY ›</span> &ldquo;{proof.query}&rdquo;</div>
                  <div className="proof-answer">
                    {proof.error
                      ? <span style={{ color: 'var(--warn)' }}>{proof.errorMessage || proof.error}</span>
                      : proofExcerpt
                        ? <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(highlightBrand(proofExcerpt)) }} />
                        : <span className="dim">No response text captured for this result.</span>}
                  </div>
                  <div className="proof-meta mono">
                    <span><span className="dim">ENGINE:</span> {proof.platform}{proof.model ? ` · ${proof.model}` : ''}</span>
                    {proofPos && <><span className="dim">·</span><span><span className="dim">POSITION:</span> {proofPos}</span></>}
                    <span className="dim">·</span>
                    <span><span className="dim">SENTIMENT:</span> {proofSent}</span>
                    {proof.citations && proof.citations.length > 0 && (
                      <>
                        <span className="dim">·</span>
                        <span><span className="dim">CITED:</span> {proof.citations.slice(0, 4).map((c, i) => (
                          <span key={i}>{i > 0 && ' · '}<Cit url={c} /></span>
                        ))}</span>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {proof && proof.mentioned && proof.competitorMentions && proof.competitorMentions.length > 0 && (
              <Card title="Mentions in this answer" padding={false}>
                <table className="tbl">
                  <thead><tr><th>BRAND</th><th>ROLE</th></tr></thead>
                  <tbody>
                    <tr>
                      <td><b style={{ color: 'var(--accent)' }}>{brand?.name || 'Your brand'}</b> <Badge tone="acc">YOU</Badge></td>
                      <td><Badge tone={proofTone}>{proof.mentioned ? `MENTIONED${proofPos ? ' · ' + proofPos : ''}` : 'NOT MENTIONED'}</Badge></td>
                    </tr>
                    {proof.competitorMentions.map((c, i) => (
                      <tr key={i}><td><b>{c}</b></td><td><span className="mono dim" style={{ fontSize: 11 }}>competitor</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            {sameQuery.length > 0 && (
              <Card title="Same query across engines" padding={false}>
                <ul className="proof-eng">
                  {sameQuery.map((r, i) => {
                    const tone = r.error ? 'warn' : r.mentioned ? 'pos' : 'neg';
                    const label = r.error ? 'ERROR' : r.mentioned ? `FOUND${r.listPosition || r.position ? ' · ' + (r.listPosition || r.position) : ''}` : 'MISS';
                    return (
                      <li key={i}>
                        <PlatformTile p={platformFor(r.platform)} size={22} />
                        <span style={{ flex: 1, fontSize: 12.5 }}>{r.platform}</span>
                        <Badge tone={tone}>{label}</Badge>
                        {r.sentiment && !r.error && <span className="mono dim" style={{ fontSize: 11 }}>{r.sentiment}</span>}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            {viewMode === 'grouped' ? (
              <Card title="Coverage by query" right={<Pill>{grouped.order.length} queries</Pill>} padding={false} style={{ gridColumn: 'span 2' }}>
                <div style={{ display: 'grid', gap: 10, padding: 'var(--pad)' }}>
                  {grouped.order.map(q => {
                    const res = grouped.map[q];
                    const qF = res.filter(r => r.mentioned).length;
                    const qT = res.length;
                    const tone = qF === 0 ? 'neg' : qF === qT ? 'pos' : 'neu';
                    const foundOn = res.filter(r => r.mentioned).map(r => r.platform);
                    return (
                      <div key={q} className="hist-row" style={{ gridTemplateColumns: '1fr 90px 70px' }}>
                        <span style={{ color: 'var(--text-2)', fontSize: 12.5 }}>{q}<span className="mono dim" style={{ display: 'block', fontSize: 10.5, marginTop: 2 }}>{foundOn.length ? foundOn.join(', ') : 'not found on any engine'}</span></span>
                        <Badge tone={tone}>{qF}/{qT} FOUND</Badge>
                        <span className="mono num" style={{ textAlign: 'right' }}>{qT > 0 ? Math.round((qF / qT) * 100) : 0}%</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ) : (
              <Card title="All results" right={<Pill>{filtered.length} rows</Pill>} padding={false} style={{ gridColumn: 'span 2' }}>
                <table className="tbl">
                  <thead><tr><th>ENGINE</th><th>QUERY</th><th>VERDICT</th><th>POSITION</th><th>SENTIMENT</th></tr></thead>
                  <tbody>
                    {filtered.map((r, i) => {
                      const tone = r.error ? 'warn' : r.mentioned ? 'pos' : 'neg';
                      const verdict = r.error ? 'ERROR' : r.mentioned ? 'FOUND' : 'NOT FOUND';
                      const rp = r.mentioned && (r.listPosition || r.position) ? `${r.listPosition || r.position}` : '—';
                      return (
                        <tr key={i}>
                          <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><PlatformTile p={platformFor(r.platform)} size={20} /> <b>{r.platform}</b></span></td>
                          <td><span style={{ color: 'var(--text)' }}>&ldquo;{r.query}&rdquo;</span></td>
                          <td><Badge tone={tone}>{verdict}</Badge></td>
                          <td className="num">{rp}</td>
                          <td><span className="mono dim" style={{ fontSize: 11 }}>{r.error ? '—' : (r.sentiment || 'neutral')}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}

            {runs.length > 0 && (
              <Card title="Run history" right={<span className="mono dim" style={{ fontSize: 11 }}>{runs.length} RUNS</span>} style={{ gridColumn: 'span 2' }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  {runs.map((r, i) => {
                    const d = new Date(r.time || r.date || r.created_at || 0);
                    const t = isNaN(d.getTime()) ? `Run ${runs.length - i}` : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const sv = r.sov || 0;
                    const tone = sv >= 70 ? 'pos' : sv >= 40 ? 'warn' : 'neg';
                    const rc = (r.allResults || r.results || []).length;
                    return (
                      <div key={r.id || i} className="hist-row">
                        <span className="mono dim">{t}</span>
                        <Badge tone={tone}>SOV {sv}%</Badge>
                        <span style={{ color: 'var(--text-2)', fontSize: 12.5 }}>{rc} result{rc !== 1 ? 's' : ''}{r.queries?.length ? ` · ${r.queries.length} queries` : ''}{r.durationMs ? ` · ${(r.durationMs / 1000).toFixed(1)}s` : ''}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
