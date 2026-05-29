'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { renderInlineMarkdown, sanitizeHtml } from '@/lib/sanitize';
import { getPlanPlatforms } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { csvSafe } from '@/lib/csv';
import LockedBrandBanner from '@/components/dashboard/LockedBrandBanner';
import { KpiCardsSkeleton, TableSkeleton } from '@/components/dashboard/Skeleton';
import { useBrandData } from '@/hooks/useBrandData';
import { useRun } from '@/contexts/RunContext';
import { useToast } from '@/components/dashboard/Toast';
import { PLATFORMS, type Platform, PlatformTile, Badge, Card, PageHead, Filter, Seg, Pill, KPIRail, Info } from '@/app/dashboard-v2/ui';

interface Mention { query: string; platform: string; mentioned: boolean; recommended?: boolean; sentiment?: string; position?: number; model?: string; date?: string; snippet?: string; response?: string; error?: string; raw?: string; context?: string; listPosition?: number; errorMessage?: string; }
interface Run { id?: string; date?: string; created_at?: string; time?: string; sov?: number; allResults?: Mention[]; results?: Mention[]; }
interface Brand { id: string; name: string; mentions?: Mention[]; runs?: Run[]; }
type FilterMode = 'all' | 'mentioned' | 'not_mentioned' | 'recommended' | 'errors';

// Map a real platform name (e.g. "ChatGPT") to the design's Platform tile descriptor.
function platformFor(name: string): Platform {
  const lc = (name || '').toLowerCase();
  return PLATFORMS.find(p => p.name.toLowerCase() === lc || p.id === lc)
    || { id: lc || 'unknown', name: name || 'Unknown', short: (name || '?').slice(0, 3).toUpperCase(), sov: 0, delta: 0, ok: true, ms: 0 };
}

export default function MentionsPage() {
  const { user } = useAuth();
  const planPlatforms = getPlanPlatforms(user?.plan || 'free');
  const { brand: rawBrand, loading } = useBrandData({ fullData: true });
  const selectedBrand = rawBrand as Brand | null;
  const { live, pct: runPct } = useRun();
  const { toast } = useToast();
  // Fire a one-shot toast when a 409 ("concurrent") run lands while the
  // user is on this page. RunContext surfaces 409 as
  // status='error' + errorMsg='concurrent'; without this hook the user
  // would see the LIVE badge disappear with no explanation. Keyed off
  // statusText so successive 409s each get their own toast, but
  // re-renders while the same error is active don't duplicate.
  const lastConcurrentMsgRef = useRef<string | null>(null);
  useEffect(() => {
    const isConcurrent = live.status === 'error' && live.errorMsg === 'concurrent';
    if (isConcurrent && live.statusText && live.statusText !== lastConcurrentMsgRef.current) {
      lastConcurrentMsgRef.current = live.statusText;
      toast(live.statusText, 'error');
    } else if (!isConcurrent) {
      lastConcurrentMsgRef.current = null;
    }
  }, [live.status, live.errorMsg, live.statusText, toast]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(15);

  const runs = useMemo(() => (selectedBrand?.runs || []).slice().reverse(), [selectedBrand]);
  useEffect(() => { if (runs.length && !selectedRunId) setSelectedRunId(runs[0].id || '0'); }, [runs, selectedRunId]);

  const currentRun = useMemo(() => {
    if (!selectedRunId) return runs[0] || null;
    return (selectedBrand?.runs || []).find(r => r.id === selectedRunId) || runs[0] || null;
  }, [selectedRunId, runs, selectedBrand]);

  // Show live run results in place of the stored "latest" run while a run is
  // active for this brand. Historical runs (user picked a non-latest run from
  // the dropdown) always show their stored data.
  const viewingLatest = !selectedRunId || selectedRunId === (runs[0]?.id || '0');
  const liveForThisBrand = live.running && live.brandId === selectedBrand?.id;
  const showLive = liveForThisBrand && viewingLatest && live.results.length > 0;
  const all: Mention[] = showLive
    ? (live.results as Mention[])
    : (currentRun?.allResults || currentRun?.results || []);

  const platformCounts = useMemo(() => {
    const pc: Record<string, { t: number; f: number }> = {};
    all.forEach(r => { if (!pc[r.platform]) pc[r.platform] = { t: 0, f: 0 }; pc[r.platform].t++; if (r.mentioned) pc[r.platform].f++; });
    return pc;
  }, [all]);

  const filtered = useMemo(() => {
    return all.filter(r => {
      if (platformFilter !== 'all' && r.platform !== platformFilter) return false;
      if (filter === 'mentioned' && !r.mentioned) return false;
      if (filter === 'not_mentioned' && (r.mentioned || r.error)) return false;
      if (filter === 'recommended' && !r.recommended) return false;
      if (filter === 'errors' && !r.error) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${r.platform} ${r.query} ${r.response || r.raw || r.context || r.snippet || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, platformFilter, filter, searchQuery]);

  useEffect(() => { setPage(0); setExpandedRow(null); }, [filter, platformFilter, searchQuery, selectedRunId]);

  // Stats based on filtered results so they update when filters change
  const statsSource = platformFilter !== 'all' || filter !== 'all' || searchQuery.trim() ? filtered : all;
  const ok = statsSource.filter(r => !r.error);
  const found = statsSource.filter(r => r.mentioned);
  const rec = statsSource.filter(r => r.recommended);
  const sovPct = ok.length ? Math.round(found.length / ok.length * 100) : 0;
  const recPct = ok.length ? Math.round(rec.length / ok.length * 100) : 0;

  const effectivePerPage = perPage === 0 ? filtered.length : perPage;
  const totalPages = effectivePerPage > 0 ? Math.ceil(filtered.length / effectivePerPage) : 1;
  const from = page * effectivePerPage;
  const slice = filtered.slice(from, from + effectivePerPage);

  const renderMarkdown = (text: string) => renderInlineMarkdown(text, { brand: selectedBrand?.name });

  function exportCSV() {
    if (!filtered.length) return;
    const rows = [['Platform','Query','Status','Sentiment','Recommended','Response Preview'].join(',')];
    filtered.forEach(m => {
      const preview = (m.response || m.raw || m.context || m.snippet || '').replace(/[\n\r]/g,' ').substring(0, 300);
      rows.push([csvSafe(m.platform), csvSafe(m.query), m.error?'ERROR':m.mentioned?'Found':'Not Found', m.error?'N/A':(m.sentiment||'neutral'), m.error?'N/A':(m.recommended?'Yes':'No'), csvSafe(preview)].join(','));
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = `livesov-mentions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  if (loading) return (
    <div className="lvx">
      <PageHead title="Mentions" sub="Track how AI platforms mention your brand across all queries." />
      <div className="page-body">
        <KpiCardsSkeleton count={4} />
        <Card padding={false}><TableSkeleton rows={6} cols={5} /></Card>
      </div>
    </div>
  );

  return (
    <div className="lvx">
      <LockedBrandBanner />
      <PageHead
        title="Mentions"
        sub="Track how AI platforms mention your brand across all queries."
        actions={
          <>
            {showLive && (
              <Pill tone="acc">
                <span className="pulse" style={{ width: 5, height: 5 }} /> LIVE · {live.received}/{live.totalExpected || '…'}{runPct ? ` · ${runPct}%` : ''}
              </Pill>
            )}
            <select
              className="sel"
              style={{ minWidth: 210 }}
              value={selectedRunId}
              onChange={e => setSelectedRunId(e.target.value)}
              disabled={showLive}
              title={showLive ? 'Live run in progress - showing current run' : undefined}
            >
              {runs.map((r, i) => {
                const d = new Date(r.time || r.date || 0);
                const label = isNaN(d.getTime()) ? `Run ${i + 1}` : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · SOV`;
                return <option key={r.id || i} value={r.id || String(i)}>{label}</option>;
              })}
              {runs.length === 0 && <option value="">No runs yet</option>}
            </select>
            <button className="btn-d" onClick={exportCSV} disabled={!filtered.length}>⇣ Export CSV</button>
          </>
        }
      />

      <div className="page-body">
        {all.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <div style={{ fontSize: 36, color: 'var(--mute)', marginBottom: 12 }}>◎</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No mentions yet</div>
              <p className="dim" style={{ fontSize: 13, maxWidth: 360, margin: '0 auto 16px' }}>Run queries to start tracking how AI platforms mention your brand.</p>
              <a href="/dashboard" className="btn-p" style={{ textDecoration: 'none' }}>Go to Overview</a>
            </div>
          </Card>
        ) : (
          <>
            <KPIRail items={[
              { k: 'MENTION RATE', term: 'mention', v: `${sovPct}%`, info: 'excludes errored queries' },
              { k: 'FOUND / TOTAL', v: `${found.length}/${statsSource.length}` },
              { k: 'PLATFORMS', v: Object.keys(platformCounts).length },
              { k: 'RECOMMENDED', v: `${recPct}%` },
            ]} />

            <Filter>
              <div className="search-box">
                <span className="dim mono">⌕</span>
                <input placeholder="Filter mentions, queries, sources…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <Seg value={filter} onChange={v => setFilter(v as FilterMode)} options={[
                { value: 'all', label: 'ALL' },
                { value: 'mentioned', label: 'MENTIONED' },
                { value: 'not_mentioned', label: 'NOT MENTIONED' },
                { value: 'recommended', label: 'RECOMMENDED' },
                { value: 'errors', label: 'ERRORS' },
              ]} />
              <select className="sel" value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}>
                <option value="all">All engines</option>
                {planPlatforms.map(p => <option key={p} value={p}>{p}{platformCounts[p]?.t ? '' : ' (0)'}</option>)}
              </select>
            </Filter>

            {filtered.length === 0 ? (
              <Card>
                <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                  <div style={{ fontSize: 36, color: 'var(--mute)', marginBottom: 12 }}>⌕</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No matching results</div>
                  <p className="dim" style={{ fontSize: 13 }}>Try adjusting your filters to see more results.</p>
                </div>
              </Card>
            ) : (
              <Card
                title="All mentions"
                info="mention"
                lede="One row per AI answer. “Verdict” is how you showed up; “position” is where you ranked in the answer’s list."
                padding={false}
                foot={<><span>Showing {from + 1}–{Math.min(from + effectivePerPage, filtered.length)} of {filtered.length}</span>{showLive && <span>Auto-refreshing · live</span>}</>}
              >
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>ENGINE</th>
                        <th>QUERY</th>
                        <th>VERDICT <Info>How you showed up in this answer — found, not found, or an error.</Info></th>
                        <th>SENTIMENT <Info term="sentiment" /></th>
                        <th>POSITION <Info term="position" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice.map((r, i) => {
                        const globalIdx = from + i;
                        const isExpanded = expandedRow === globalIdx;
                        const responseText = r.response || r.raw || r.context || r.snippet || '';
                        const posLabel = r.mentioned && (r.listPosition || r.position) ? `#${r.listPosition || r.position}` : r.mentioned ? 'N/A' : '-';
                        const sentTone = r.sentiment === 'positive' ? 'pos' : r.sentiment === 'negative' ? 'neg' : 'dim';
                        const pl = platformFor(r.platform);

                        return (
                          <React.Fragment key={globalIdx}>
                            <tr role={responseText || r.error ? 'button' : undefined} tabIndex={responseText || r.error ? 0 : undefined} style={{ cursor: responseText || r.error ? 'pointer' : 'default' }} onClick={() => { if (responseText || r.error) setExpandedRow(isExpanded ? null : globalIdx); }} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && (responseText || r.error)) { e.preventDefault(); setExpandedRow(isExpanded ? null : globalIdx); } }}>
                              <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><PlatformTile p={pl} size={22} /> <b>{r.platform}</b></span></td>
                              <td><span style={{ color: 'var(--text)' }}>{r.query}</span></td>
                              <td>{r.error ? <Badge tone="warn">ERROR</Badge> : r.mentioned ? <Badge tone="pos">FOUND</Badge> : <Badge tone="miss">NOT FOUND</Badge>}{!r.error && r.recommended && <Badge tone="acc" style={{ marginLeft: 6 }}>REC</Badge>}</td>
                              <td>{r.error || !r.mentioned ? <span className="dim">-</span> : <span className={sentTone}>{r.sentiment ? r.sentiment.charAt(0).toUpperCase() + r.sentiment.slice(1) : '-'}</span>}</td>
                              <td className="num">{posLabel === 'N/A' ? <span title="No numbered list detected in this response" className="dim" style={{ cursor: 'help', borderBottom: '1px dotted var(--mute)' }}>N/A</span> : posLabel}</td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={5} style={{ padding: 0 }}>
                                  <div style={{ padding: 16, background: 'var(--surface-2)', borderTop: '1px solid var(--line)' }}>
                                    {r.error ? (
                                      <div style={{ fontSize: 12, color: 'var(--danger)', padding: 12, background: 'var(--danger-50)', borderRadius: 8, border: '1px solid var(--danger-100)' }}>
                                        {r.errorMessage || r.error}
                                      </div>
                                    ) : (
                                      <div className="proof-answer" style={{ background: 'var(--surface)', padding: 14, borderRadius: 8, fontSize: 13, lineHeight: 1.7, borderLeft: `3px solid ${r.mentioned ? 'var(--success)' : 'var(--danger)'}`, whiteSpace: 'pre-wrap', maxWidth: 'none' }}
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdown(responseText)) }} />
                                    )}
                                    <div className="mono dim" style={{ marginTop: 8, fontSize: 10 }}>
                                      Position: {posLabel} · Sentiment: {r.error ? '-' : (r.sentiment || 'neutral')} · Recommended: {r.error ? '-' : (r.recommended ? 'Yes' : 'No')}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div className="mono dim" style={{ fontSize: 11 }}>
                Showing {from + 1}–{Math.min(from + effectivePerPage, filtered.length)} of {filtered.length} results
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="dim" style={{ fontSize: 11 }}>Show:</span>
                {[15, 25, 50, 100].map(n => (
                  <button key={n} className={perPage === n ? 'btn-p' : 'btn-g'} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setPerPage(n); setPage(0); setExpandedRow(null); }}>{n}</button>
                ))}
              </div>
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                {page > 0 && <button className="btn-g" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setPage(p => p - 1); setExpandedRow(null); }}>‹</button>}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const ps = Math.max(0, Math.min(page - 2, totalPages - 5));
                  const p = ps + i;
                  if (p >= totalPages) return null;
                  return <button key={p} className={p === page ? 'btn-p' : 'btn-g'} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setPage(p); setExpandedRow(null); }}>{p + 1}</button>;
                })}
                {page < totalPages - 1 && <button className="btn-g" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setPage(p => p + 1); setExpandedRow(null); }}>›</button>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
