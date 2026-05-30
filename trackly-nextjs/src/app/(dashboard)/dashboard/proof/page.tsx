'use client';

import { useState, useEffect, useMemo } from 'react';
import { highlightBrand as highlightBrandText, sanitizeHtml } from '@/lib/sanitize';
import { csvSafe } from '@/lib/csv';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { KpiCardsSkeleton, CardsSkeleton } from '@/components/dashboard/Skeleton';
import { useBrandData } from '@/hooks/useBrandData';
import { useRun } from '@/contexts/RunContext';
import { Card, Badge, Pill, PlatformTile, Cit, Filter, Seg, PageHead, KPIRail, type Platform } from '@/app/dashboard-v2/ui';

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
  const uniquePlats = [...new Set(allResults.map(r => r.platform))];
  const foundPct = totalResults > 0 ? Math.round((foundCount / totalResults) * 100) : 0;
  // During a live run, the stored run.sov refers to the previous run - derive
  // SOV from in-progress results instead so the banner stays accurate.
  const sovPct = showLive ? foundPct : (run?.sov || 0);
  const sentPos = allResults.filter(r => r.sentiment === 'positive').length;
  const sentNeg = allResults.filter(r => r.sentiment === 'negative').length;
  const sentNeu = totalResults - sentPos - sentNeg;
  const posPct = totalResults > 0 ? Math.round((sentPos / totalResults) * 100) : 0;

  // Compare against the previous run (if any) for delta indicators.
  const prevRun = useMemo(() => {
    if (!run) return null;
    const idx = runs.findIndex(r => (r.id || '') === (run.id || ''));
    return idx >= 0 && runs[idx + 1] ? runs[idx + 1] : null;
  }, [run, runs]);
  const prevResults = prevRun?.allResults || prevRun?.results || [];
  const prevSov = prevRun?.sov ?? null;
  const prevFoundPct = prevResults.length
    ? Math.round((prevResults.filter(r => r.mentioned).length / prevResults.length) * 100)
    : null;
  const sovDelta = prevSov != null ? sovPct - prevSov : null;
  const foundDelta = prevFoundPct != null ? foundPct - prevFoundPct : null;

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

  // Filtered results
  const filtered = useMemo(() => allResults.filter(r => {
    if (platFilter && r.platform !== platFilter) return false;
    if (resultFilter === 'found' && !r.mentioned) return false;
    if (resultFilter === 'notfound' && (r.mentioned || r.error)) return false;
    return true;
  }), [allResults, platFilter, resultFilter]);

  // Grouped by query — sorted by coverage descending so wins lead.
  const grouped = useMemo(() => {
    const map: Record<string, Result[]> = {};
    filtered.forEach(r => { if (!map[r.query]) map[r.query] = []; map[r.query].push(r); });
    const order = Object.keys(map).sort((a, b) => {
      const ra = map[a], rb = map[b];
      const pa = ra.length ? ra.filter(r => r.mentioned).length / ra.length : 0;
      const pb = rb.length ? rb.filter(r => r.mentioned).length / rb.length : 0;
      return pb - pa;
    });
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

  if (loading) return (
    <div className="lvx">
      <PageHead title="Evidence & Proof" sub="Every AI response about your brand — verified, organized, exportable." />
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
        sub="Every AI response about your brand — verified, organized, exportable."
        actions={
          <>
            {showLive && (
              <Pill tone="acc"><span className="pulse" style={{ width: 5, height: 5 }} /> LIVE · {live.received}/{live.totalExpected || '…'}{runPct ? ` · ${runPct}%` : ''}</Pill>
            )}
            <button className="btn-d" onClick={exportCSV} disabled={!totalResults}>⇣ Export CSV</button>
          </>
        }
      />
      <div className="page-body">
        <Filter>
          <select className="sel" value={selectedRunId} onChange={e => setSelectedRunId(e.target.value)} aria-label="Select run" disabled={showLive} title={showLive ? 'Live run in progress - showing current run' : undefined}>
            {runs.map((r, i) => {
              const d = new Date(r.time || r.date || 0);
              const label = isNaN(d.getTime()) ? `Run ${i + 1}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} — SOV ${r.sov || 0}%`;
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
          <span style={{ flex: 1 }} />
          <Seg
            value={viewMode}
            onChange={v => setViewMode(v as 'grouped' | 'flat')}
            options={[{ value: 'grouped', label: 'BY QUERY' }, { value: 'flat', label: 'ALL ROWS' }]}
          />
        </Filter>

        {!run && !showLive ? (
          <Card title="No runs yet">
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--mute)' }}>
              <div style={{ fontSize: 32, opacity: .35, marginBottom: 14 }}>◆</div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No evidence collected yet</div>
              <div style={{ fontSize: 12.5 }}>Click <b style={{ color: 'var(--primary)' }}>Run Queries</b> to capture proof of your AI mentions.</div>
            </div>
          </Card>
        ) : (
          <>
            <KPIRail items={[
              { k: 'SHARE OF VOICE', term: 'sov', v: sovPct, suffix: '%', d: sovDelta, info: prevSov != null ? `vs ${prevSov}% prev` : undefined },
              { k: 'MENTIONS FOUND', term: 'mention', v: `${foundCount}`, info: `of ${totalResults}`, d: foundDelta, suffix: '' },
              { k: 'ENGINES COVERED', term: 'engine', v: `${uniquePlats.length}`, info: `${queries.length || 0} queries` },
              { k: 'POSITIVE SENTIMENT', term: 'sentiment', v: posPct, suffix: '%', info: `${sentPos}↑ ${sentNeu}· ${sentNeg}↓` },
            ]} />

            {filtered.length === 0 ? (
              <Card title="No matching results">
                <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--mute)' }}>
                  <div style={{ fontSize: 26, opacity: .35, marginBottom: 10 }}>◇</div>
                  <div style={{ fontSize: 12.5 }}>No results match your filters. Try clearing the engine or result filter.</div>
                </div>
              </Card>
            ) : (
              <div className="g2">
                {proof && (
                  <Card
                    title="Verbatim model output"
                    lede="The featured AI answer — your evidence, exactly as the model wrote it."
                    right={<Badge tone={proofTone}>{proof.error ? 'ERROR' : proof.mentioned ? `FOUND${proofPos ? ' · #' + proofPos : ''}` : 'NOT FOUND'}</Badge>}
                    style={{ gridColumn: 'span 2' }}
                  >
                    <div className="proof-hero">
                      <div className="proof-hero-engine">
                        <PlatformTile p={platformFor(proof.platform)} size={44} />
                        <div className="proof-hero-engine-meta">
                          <div className="proof-hero-engine-name">{proof.platform}</div>
                          {proof.model && <div className="proof-hero-engine-model mono">{proof.model}</div>}
                        </div>
                      </div>
                      <div className="proof-hero-content">
                        <div className="proof-q-new mono">
                          <span className="proof-q-label">QUERY</span>
                          <span className="proof-q-text">&ldquo;{proof.query}&rdquo;</span>
                        </div>
                        <blockquote className="proof-quote">
                          <span className="proof-quote-mark" aria-hidden="true">&ldquo;</span>
                          {proof.error
                            ? <span style={{ color: 'var(--warn)' }}>{proof.errorMessage || proof.error}</span>
                            : proofExcerpt
                              ? <span className="proof-quote-text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(highlightBrand(proofExcerpt)) }} />
                              : <span className="dim">No response text captured for this result.</span>}
                        </blockquote>
                        <div className="proof-stat-row">
                          <span className="proof-stat">
                            <span className="proof-stat-label mono">ENGINE</span>
                            <span className="proof-stat-val">{proof.platform}</span>
                          </span>
                          <span className="proof-stat-div" />
                          <span className="proof-stat">
                            <span className="proof-stat-label mono">POSITION</span>
                            <span className="proof-stat-val">{proofPos ? `#${proofPos}` : '—'}</span>
                          </span>
                          <span className="proof-stat-div" />
                          <span className="proof-stat">
                            <span className="proof-stat-label mono">SENTIMENT</span>
                            <span className={`proof-stat-val proof-sent-${proofSent}`}>{proofSent}</span>
                          </span>
                          {proof.citations && proof.citations.length > 0 && (
                            <>
                              <span className="proof-stat-div" />
                              <span className="proof-stat proof-stat-cites">
                                <span className="proof-stat-label mono">CITED · {proof.citations.length}</span>
                                <span className="proof-cite-chips">
                                  {proof.citations.slice(0, 4).map((c, i) => (
                                    <Cit key={i} url={c} />
                                  ))}
                                </span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {sameQuery.length > 0 && (
                  <Card
                    title="Same query across engines"
                    lede="How every engine answered the same question."
                    right={<Pill>{sameQuery.filter(r => r.mentioned).length}/{sameQuery.length} found</Pill>}
                    padding={false}
                  >
                    <ul className="eng-list">
                      {sameQuery.map((r, i) => {
                        const tone = r.error ? 'warn' : r.mentioned ? 'pos' : 'neg';
                        const label = r.error ? 'ERROR' : r.mentioned ? `FOUND${r.listPosition || r.position ? ' · #' + (r.listPosition || r.position) : ''}` : 'MISS';
                        const dotCls = r.error ? 'warn' : r.mentioned ? 'pos' : 'neg';
                        return (
                          <li key={i} className="eng-row">
                            <span className={`eng-dot eng-dot-${dotCls}`} aria-hidden="true" />
                            <PlatformTile p={platformFor(r.platform)} size={26} />
                            <span className="eng-name">{r.platform}{r.model && <span className="mono dim eng-model"> · {r.model}</span>}</span>
                            <Badge tone={tone}>{label}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}

                {proof && proof.mentioned && proof.competitorMentions && proof.competitorMentions.length > 0 ? (
                  <Card
                    title="Who else got named"
                    lede="Brands mentioned alongside you in this answer."
                    padding={false}
                  >
                    <table className="tbl">
                      <thead><tr><th>BRAND</th><th>ROLE</th></tr></thead>
                      <tbody>
                        <tr>
                          <td><b style={{ color: 'var(--accent)' }}>{brand?.name || 'Your brand'}</b> <Badge tone="acc">YOU</Badge></td>
                          <td><Badge tone={proofTone}>{proof.mentioned ? `MENTIONED${proofPos ? ' · #' + proofPos : ''}` : 'NOT MENTIONED'}</Badge></td>
                        </tr>
                        {proof.competitorMentions.map((c, i) => (
                          <tr key={i}><td><b>{c}</b></td><td><span className="mono dim" style={{ fontSize: 11 }}>competitor</span></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                ) : (
                  Object.keys(platStats).length > 0 && (
                    <Card
                      title="Coverage by engine"
                      lede="Where you’re visible — and where you have room to grow."
                      right={<Pill>{uniquePlats.length} engines</Pill>}
                    >
                      <ul className="eng-cov-list">
                        {Object.entries(platStats)
                          .sort((a, b) => (b[1].found / b[1].total) - (a[1].found / a[1].total))
                          .map(([p, s]) => {
                            const pct = s.total > 0 ? Math.round((s.found / s.total) * 100) : 0;
                            const tone = pct >= 70 ? 'pos' : pct >= 40 ? 'warn' : 'neg';
                            const barColor = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warn)' : 'var(--danger)';
                            return (
                              <li key={p} className="eng-cov-row">
                                <PlatformTile p={platformFor(p)} size={22} />
                                <span className="eng-cov-name">{p}</span>
                                <span className="eng-cov-bar"><i style={{ width: `${pct}%`, background: barColor }} /></span>
                                <span className="mono eng-cov-pct">{pct}%</span>
                                <Badge tone={tone}>{s.found}/{s.total}</Badge>
                              </li>
                            );
                          })}
                      </ul>
                    </Card>
                  )
                )}

                {viewMode === 'grouped' ? (
                  <Card
                    title="Coverage by query"
                    lede="Sorted from strongest to weakest. Bars show the share of engines where you appeared."
                    right={<Pill>{grouped.order.length} queries</Pill>}
                    padding={false}
                    style={{ gridColumn: 'span 2' }}
                  >
                    <ul className="q-cov-list">
                      {grouped.order.map(q => {
                        const res = grouped.map[q];
                        const qF = res.filter(r => r.mentioned).length;
                        const qT = res.length;
                        const pct = qT > 0 ? Math.round((qF / qT) * 100) : 0;
                        const tone = qF === 0 ? 'neg' : qF === qT ? 'pos' : 'warn';
                        const barColor = pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warn)' : 'var(--danger)';
                        const foundOn = res.filter(r => r.mentioned).map(r => r.platform);
                        const missedOn = res.filter(r => !r.mentioned && !r.error).map(r => r.platform);
                        return (
                          <li key={q} className="q-cov-row">
                            <div className="q-cov-head">
                              <span className="q-cov-q">&ldquo;{q}&rdquo;</span>
                              <Badge tone={tone}>{qF}/{qT} FOUND</Badge>
                              <span className="mono q-cov-pct">{pct}%</span>
                            </div>
                            <span className="q-cov-bar"><i style={{ width: `${pct}%`, background: barColor }} /></span>
                            <div className="q-cov-engines">
                              {foundOn.length > 0 && (
                                <span className="q-cov-eng-group">
                                  <span className="mono dim">FOUND ON</span>
                                  <span className="q-cov-eng-tiles">
                                    {foundOn.map((p, i) => <PlatformTile key={i} p={platformFor(p)} size={18} />)}
                                  </span>
                                </span>
                              )}
                              {missedOn.length > 0 && (
                                <span className="q-cov-eng-group q-cov-eng-miss">
                                  <span className="mono dim">MISSED</span>
                                  <span className="q-cov-eng-tiles">
                                    {missedOn.map((p, i) => <PlatformTile key={i} p={platformFor(p)} size={18} />)}
                                  </span>
                                </span>
                              )}
                              {foundOn.length === 0 && missedOn.length === 0 && (
                                <span className="mono dim">no engine data</span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                ) : (
                  <Card
                    title="All results"
                    lede="Every AI response in this run — one row per engine × query."
                    right={<Pill>{filtered.length} rows</Pill>}
                    padding={false}
                    style={{ gridColumn: 'span 2' }}
                  >
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
                  <Card
                    title="Run history"
                    lede="Each run is a fresh snapshot. Click into one above to inspect its evidence."
                    right={<Pill>{runs.length} runs</Pill>}
                    padding={false}
                    style={{ gridColumn: 'span 2' }}
                  >
                    <ul className="run-list">
                      {runs.map((r, i) => {
                        const d = new Date(r.time || r.date || r.created_at || 0);
                        const t = isNaN(d.getTime()) ? `Run ${runs.length - i}` : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        const sv = r.sov || 0;
                        const tone = sv >= 70 ? 'pos' : sv >= 40 ? 'warn' : 'neg';
                        const barColor = sv >= 70 ? 'var(--success)' : sv >= 40 ? 'var(--warn)' : 'var(--danger)';
                        const rc = (r.allResults || r.results || []).length;
                        const isActive = (r.id || '') === (run?.id || '');
                        return (
                          <li
                            key={r.id || i}
                            className={`run-row ${isActive ? 'run-row-active' : ''}`}
                            onClick={() => !showLive && setSelectedRunId(r.id || '')}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => { if (e.key === 'Enter' && !showLive) setSelectedRunId(r.id || ''); }}
                            aria-current={isActive ? 'true' : undefined}
                          >
                            <span className="run-idx mono">#{runs.length - i}</span>
                            <span className="run-time mono">{t}</span>
                            <Badge tone={tone}>SOV {sv}%</Badge>
                            <span className="run-bar"><i style={{ width: `${sv}%`, background: barColor }} /></span>
                            <span className="run-meta mono dim">
                              {rc} result{rc !== 1 ? 's' : ''}
                              {r.queries?.length ? ` · ${r.queries.length}Q` : ''}
                              {r.durationMs ? ` · ${(r.durationMs / 1000).toFixed(1)}s` : ''}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
