'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PLATFORM_COLORS } from '@/lib/constants';
import { useBrandData } from '@/hooks/useBrandData';
import { useRun } from '@/contexts/RunContext';
import { useToast } from '@/components/dashboard/Toast';
import { TableSkeleton } from '@/components/dashboard/Skeleton';
import { PLATFORMS, type Platform, PlatformTile, Card, Pill, Filter, PageHead } from '@/app/dashboard-v2/ui';

// Three-way per-query outcome. A delivery failure is distinct from a
// legitimate "not mentioned" so the UI can offer a retry and so failed
// queries can be excluded from share-of-voice math upstream.
type ResultStatus = 'mentioned' | 'not_found' | 'failed';

// Map a real platform/model name to the design's Platform tile descriptor.
function platformFor(name: string): Platform {
  const lc = (name || '').toLowerCase();
  return PLATFORMS.find(p => p.name.toLowerCase() === lc || p.id === lc)
    || { id: lc || 'unknown', name: name || 'Unknown', short: (name || '?').slice(0, 3).toUpperCase(), sov: 0, delta: 0, ok: true, ms: 0 };
}

interface Mention {
  query: string;
  platform: string;
  mentioned: boolean;
  model?: string;
  response?: string;
  raw?: string;
  context?: string;
  snippet?: string;
  // Failure signal persisted on each run result. `status` is authoritative
  // when present; `error`/`errorMessage` are the legacy fallback for runs
  // recorded before the status field existed.
  status?: string;
  error?: boolean | string;
  errorMessage?: string;
}
interface Run {
  id?: string;
  date?: string;
  created_at?: string;
  time?: string;
  allResults?: Mention[];
  results?: Mention[];
}
interface Brand { id: string; name: string; runs?: Run[]; }

interface ResultRow {
  id: string;
  timestamp: string;
  prompt: string;
  // Platform/model identifier - matches PLATFORM_COLORS keys.
  model: string;
  mentioned: boolean;
  status: ResultStatus;
  errorMessage?: string;
  response: string;
}

type MentionedFilter = 'all' | 'yes' | 'no' | 'failed';

type PageSize = '25' | '50' | '100' | 'all';

// Per-page selector, rendered in BOTH the top and footer control bars so the
// two bars share one source of truth for size (the ?size= URL param).
function PageSizeSelect({ value, onChange }: { value: PageSize; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="dim" style={{ fontSize: 11 }}>Per page</span>
      <select className="sel" aria-label="Results per page" value={value} onChange={e => onChange(e.target.value)}>
        <option value="25">25</option>
        <option value="50">50</option>
        <option value="100">100</option>
        <option value="all">All</option>
      </select>
    </label>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

// Derive the three-way status from a stored result. Prefer the explicit
// `status` field; fall back to error/mentioned flags for runs recorded before
// the field existed.
function deriveStatus(r: Mention): ResultStatus {
  const s = typeof r.status === 'string' ? r.status : '';
  if (s === 'failed' || s === 'mentioned' || s === 'not_mentioned') {
    return s === 'not_mentioned' ? 'not_found' : s;
  }
  if (r.error) return 'failed';
  return r.mentioned ? 'mentioned' : 'not_found';
}

function StatusBadge({ status }: { status: ResultStatus }) {
  if (status === 'mentioned') return <span className="status-found">FOUND</span>;
  if (status === 'failed') {
    return (
      <span className="status-notfound" style={{ color: 'var(--danger, #ef4444)', borderColor: 'rgba(239,68,68,.35)' }}>
        FAILED
      </span>
    );
  }
  return <span className="status-notfound">NOT FOUND</span>;
}

function dateOnly(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Format a Date to a local YYYY-MM-DD string. Matches dateOnly's output so
// preset bounds compare cleanly against a row's dateOnly(timestamp).
function fmtLocalDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// A Date `n` days before today (n=0 is today), at local midnight.
function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

type DatePreset = 'all' | 'today' | 'yesterday' | 'last7' | 'last15' | 'last30' | 'older' | 'custom';

// Cut-off (in days back from today) that separates "recent" from "older" for
// the Older-than-15-days preset.
const OLDER_THAN_DAYS = 15;

// Translate a preset into concrete from/to bounds (local YYYY-MM-DD).
// 'all' clears both; 'older' sets only an upper bound; 'custom' is a no-op
// (the user drives the raw date inputs directly).
function presetRange(preset: DatePreset): { from: string; to: string } | null {
  const today = fmtLocalDate(daysAgo(0));
  switch (preset) {
    case 'all': return { from: '', to: '' };
    case 'today': return { from: today, to: today };
    case 'yesterday': { const y = fmtLocalDate(daysAgo(1)); return { from: y, to: y }; }
    case 'last7': return { from: fmtLocalDate(daysAgo(6)), to: today };
    case 'last15': return { from: fmtLocalDate(daysAgo(14)), to: today };
    case 'last30': return { from: fmtLocalDate(daysAgo(29)), to: today };
    case 'older': return { from: '', to: fmtLocalDate(daysAgo(OLDER_THAN_DAYS + 1)) };
    case 'custom': return null;
  }
}

// Infer which preset the current from/to bounds correspond to, so the
// dropdown reflects the active range (and falls back to 'custom').
function presetFor(from: string, to: string): DatePreset {
  if (!from && !to) return 'all';
  for (const p of ['today', 'yesterday', 'last7', 'last15', 'last30', 'older'] as DatePreset[]) {
    const r = presetRange(p);
    if (r && r.from === from && r.to === to) return p;
  }
  return 'custom';
}

function flattenRuns(brand: Brand | null): ResultRow[] {
  if (!brand?.runs?.length) return [];
  const rows: ResultRow[] = [];
  for (const run of brand.runs) {
    const ts = run.time || run.created_at || run.date || '';
    const list = run.allResults || run.results || [];
    list.forEach((r, i) => {
      // Use platform as the model identifier so PLATFORM_COLORS lights up,
      // mirroring how the Mentions page colors that column.
      const platform = r.platform || r.model || 'Unknown';
      const response = r.response || r.raw || r.context || r.snippet || '';
      const status = deriveStatus(r);
      rows.push({
        id: `${run.id ?? 'run'}-${i}`,
        timestamp: ts,
        prompt: r.query || '',
        model: platform,
        mentioned: status === 'mentioned',
        status,
        errorMessage: typeof r.errorMessage === 'string' ? r.errorMessage : (typeof r.error === 'string' ? r.error : undefined),
        response,
      });
    });
  }
  // Newest results first: the runs array isn't guaranteed to be ordered, so
  // sort by timestamp descending. Rows with an unparseable timestamp sink to
  // the bottom rather than jumping to the top.
  rows.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    const va = isNaN(ta) ? -Infinity : ta;
    const vb = isNaN(tb) ? -Infinity : tb;
    return vb - va;
  });
  return rows;
}

export default function ResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { brand: rawBrand, loading } = useBrandData({ fullData: true });
  const brand = rawBrand as Brand | null;
  const { startRun, live } = useRun();
  const { toast } = useToast();

  // Re-run a single failed prompt against ONLY the platform that failed - not
  // every engine. A failed Perplexity row retries on Perplexity alone, so the
  // cost is 1 scan instead of one-per-engine. Goes through the normal run path
  // (and its credit pre-flight) so the retry is costed and tracked like any
  // other run; failed responses won't be charged thanks to the refund path.
  const retryPrompt = (prompt: string, platform?: string) => {
    if (!prompt) return;
    startRun(false, { queries: [prompt], ...(platform ? { platforms: [platform] } : {}) });
    // While another run is active the retry is queued (its platform scope
    // isn't preserved in the queue), so keep that toast generic. The
    // immediate path is correctly scoped to the single platform.
    if (live.running) {
      toast('Run in progress - this prompt is queued to retry next.');
    } else {
      toast(platform ? `Retrying this prompt on ${platform}…` : 'Retrying this prompt across all engines…');
    }
  };

  const allRows = useMemo(() => flattenRuns(brand), [brand]);
  const allModels = useMemo(() => Array.from(new Set(allRows.map(r => r.model))).sort(), [allRows]);
  const allPrompts = useMemo(() => Array.from(new Set(allRows.map(r => r.prompt).filter(Boolean))).sort(), [allRows]);

  // Filters live in the URL querystring so links are shareable.
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const model = searchParams.get('model') || 'all';
  const prompt = searchParams.get('prompt') || 'all';
  const mentionedRaw = searchParams.get('mentioned');
  const mentioned: MentionedFilter = mentionedRaw === 'yes' || mentionedRaw === 'no' || mentionedRaw === 'failed' ? mentionedRaw : 'all';
  const sizeRaw = searchParams.get('size');
  const size: PageSize = sizeRaw === '50' || sizeRaw === '100' || sizeRaw === 'all' ? sizeRaw : '25';
  const isAll = size === 'all';

  const [page, setPage] = useState(0);
  // Which row is expanded to show its full response (collapsed by default).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tableScrolled, setTableScrolled] = useState(false);
  // Sticky "Custom range" selection. Without it, choosing Custom before
  // entering any dates would snap the dropdown back to "All time" (empty
  // bounds infer as 'all'), hiding the date inputs the user just asked for.
  const [customMode, setCustomMode] = useState(false);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  // Set the from/to date bounds together in a single navigation so a preset
  // (which touches both) doesn't trigger two router.replace calls.
  function setRange(fromVal: string, toVal: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (fromVal) next.set('from', fromVal); else next.delete('from');
    if (toVal) next.set('to', toVal); else next.delete('to');
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  // Which preset the current bounds map to, and the handler that applies one.
  // 'custom' leaves the bounds untouched and reveals the raw date inputs;
  // customMode keeps it selected even while both bounds are still empty.
  const datePreset: DatePreset = customMode ? 'custom' : presetFor(from, to);
  function applyPreset(preset: string) {
    if (preset === 'custom') { setCustomMode(true); return; }
    setCustomMode(false);
    const r = presetRange(preset as DatePreset);
    if (r) setRange(r.from, r.to);
  }

  // Dedicated handler for ?size= - same router.replace pattern as setParam, but
  // the deletable default is '25' (NOT 'all', which is a real page-size value).
  function setSize(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === '25') next.delete('size');
    else next.set('size', value);
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  function clearFilters() {
    setCustomMode(false);
    router.replace('?', { scroll: false });
  }

  const filtered = useMemo(() => {
    return allRows.filter(r => {
      if (model !== 'all' && r.model !== model) return false;
      if (prompt !== 'all' && r.prompt !== prompt) return false;
      if (mentioned === 'yes' && r.status !== 'mentioned') return false;
      if (mentioned === 'no' && r.status !== 'not_found') return false;
      if (mentioned === 'failed' && r.status !== 'failed') return false;
      if (from && dateOnly(r.timestamp) < from) return false;
      if (to && dateOnly(r.timestamp) > to) return false;
      return true;
    });
  }, [allRows, model, prompt, mentioned, from, to]);

  // Reset to first page when filter inputs or page size change.
  useEffect(() => { setPage(0); }, [model, prompt, mentioned, from, to, size]);

  // size === 'all' shows every filtered row on a single page (no slicing).
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(filtered.length / Number(size)));
  const currentPage = Math.min(page, totalPages - 1); // clamp so a size bump can't strand us past the last page
  const pageStart = isAll ? 0 : currentPage * Number(size);
  const slice = isAll ? filtered : filtered.slice(pageStart, pageStart + Number(size));

  const hasFilters = !!(from || to || model !== 'all' || prompt !== 'all' || mentioned !== 'all' || size !== '25');

  if (loading) {
    return (
      <div className="lvx">
        <PageHead title="Results" sub="The full text of every model response - drill into a single query across all engines." />
        <div className="page-body">
          <Card padding={false}><TableSkeleton rows={6} cols={5} /></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="lvx">
      <PageHead title="Results" sub="The full text of every model response - drill into a single query across all engines."
        actions={hasFilters ? <button type="button" className="btn-d" onClick={clearFilters}>Clear filters</button> : undefined} />

      <div className="page-body">
        {allRows.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: 28 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No results yet</div>
              <p style={{ color: 'var(--text-2)', fontSize: 13, maxWidth: 360, margin: '0 auto 16px' }}>
                No results yet - add a tracked prompt to start collecting.
              </p>
              <a href="/dashboard/prompts" className="btn-p" style={{ textDecoration: 'none' }}>
                Manage tracked prompts
              </a>
            </div>
          </Card>
        ) : (
          <>
            {/* Filter row: query selector + meta pills + prev/next */}
            <Filter>
              <select className="sel" style={{ minWidth: 380 }}
                value={prompt} onChange={e => setParam('prompt', e.target.value)}>
                <option value="all">All prompts</option>
                {allPrompts.map(p => <option key={p} value={p}>{truncate(p, 60)}</option>)}
              </select>
              <select className="sel"
                value={model} onChange={e => setParam('model', e.target.value)}>
                <option value="all">All models</option>
                {allModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select className="sel"
                value={mentioned} onChange={e => setParam('mentioned', e.target.value)}>
                <option value="all">All</option>
                <option value="yes">Mentioned</option>
                <option value="no">Not found</option>
                <option value="failed">Failed</option>
              </select>
              <select className="sel" aria-label="Date range"
                value={datePreset} onChange={e => applyPreset(e.target.value)}>
                <option value="all">All time</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last7">Last 7 days</option>
                <option value="last15">Last 15 days</option>
                <option value="last30">Last 30 days</option>
                <option value="older">Older than 15 days</option>
                <option value="custom">Custom range…</option>
              </select>
              {datePreset === 'custom' && (
                <>
                  <input type="date" className="sel" aria-label="From"
                    value={from} onChange={e => setParam('from', e.target.value)} />
                  <input type="date" className="sel" aria-label="To"
                    value={to} onChange={e => setParam('to', e.target.value)} />
                </>
              )}
              <PageSizeSelect value={size} onChange={setSize} />
              <Pill>{filtered.length === 0 ? 'No matches' : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`}</Pill>
              {!isAll && totalPages > 1 && (
                <Pill>Showing {pageStart + 1}–{Math.min(pageStart + Number(size), filtered.length)} of {filtered.length}</Pill>
              )}
              <span style={{ flex: 1 }} />
              {!isAll && totalPages > 1 && (
                <>
                  <button type="button" className="btn-d" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>◀ Prev</button>
                  <button type="button" className="btn-d" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>Next ▶</button>
                </>
              )}
            </Filter>

            {filtered.length === 0 ? (
              <Card>
                <div style={{ textAlign: 'center', padding: 28 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No matching results</div>
                  <p style={{ color: 'var(--text-2)', fontSize: 13 }}>Try adjusting your filters to see more results.</p>
                </div>
              </Card>
            ) : (
              <>
              {slice.map(r => {
                const p = platformFor(r.model);
                const expanded = expandedId === r.id;
                const toggle = () => setExpandedId(expanded ? null : r.id);
                return (
                  <div key={r.id} className="card" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
                    {/* Collapsed one-line row: platform + status + query + timestamp */}
                    <div
                      role="button" tabIndex={0} aria-expanded={expanded}
                      onClick={toggle}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer' }}
                    >
                      <span aria-hidden="true" style={{ color: 'var(--muted)', fontSize: 10, width: 12, flexShrink: 0 }}>{expanded ? '▾' : '▸'}</span>
                      <PlatformTile p={p} size={22} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: PLATFORM_COLORS[r.model] || 'var(--text)', minWidth: 84, flexShrink: 0 }}>{p.name}</span>
                      <StatusBadge status={r.status} />
                      <span className="mono" style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span className="dim">QUERY ›</span> &ldquo;{r.prompt}&rdquo;
                      </span>
                      {r.status === 'failed' && (
                        <button
                          type="button"
                          className="btn-d"
                          onClick={e => { e.stopPropagation(); retryPrompt(r.prompt, r.model); }}
                          style={{ flexShrink: 0, fontSize: 11, padding: '3px 10px' }}
                          title="Re-run this prompt across all engines"
                        >
                          ↻ Retry
                        </button>
                      )}
                      <span className="mono dim" style={{ fontSize: 11, flexShrink: 0 }}>{formatTimestamp(r.timestamp)}</span>
                    </div>
                    {/* Expanded: full response + MODEL/RESULT footer */}
                    {expanded && (
                      <div className="proof-body" style={{ padding: '0 14px 12px 38px', borderTop: '1px solid var(--border)' }}>
                        <div className="proof-answer" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>
                          {r.status === 'failed'
                            ? <span style={{ color: 'var(--danger, #ef4444)' }}>This query failed to get a response{r.errorMessage ? `: ${r.errorMessage}` : '.'} It was not counted in your Share of Voice or against your scans. Use Retry to run it again.</span>
                            : (r.response || <span className="dim">Engine returned no usable answer.</span>)}
                        </div>
                        <div className="proof-meta mono" style={{ marginTop: 10 }}>
                          <span><span className="dim">MODEL:</span> {r.model}</span>
                          <span className="dim">·</span>
                          <span><span className="dim">RESULT:</span> {r.status === 'failed' ? 'failed' : r.status === 'mentioned' ? 'mentioned' : 'not found'}</span>
                          {r.status === 'failed' && (
                            <>
                              <span className="dim">·</span>
                              <button
                                type="button"
                                className="btn-d"
                                onClick={() => retryPrompt(r.prompt, r.model)}
                                style={{ fontSize: 11, padding: '2px 10px' }}
                              >
                                ↻ Retry this prompt
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Footer controls - mirror the top bar; shared page/size state. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                <span className="mono dim" style={{ fontSize: 11 }}>
                  {isAll
                    ? `Showing all ${filtered.length}`
                    : `Showing ${pageStart + 1}–${Math.min(pageStart + Number(size), filtered.length)} of ${filtered.length}`}
                </span>
                <span style={{ flex: 1 }} />
                <PageSizeSelect value={size} onChange={setSize} />
                {!isAll && totalPages > 1 && (
                  <>
                    <button type="button" className="btn-d" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>◀ Prev</button>
                    <button type="button" className="btn-d" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>Next ▶</button>
                  </>
                )}
              </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
