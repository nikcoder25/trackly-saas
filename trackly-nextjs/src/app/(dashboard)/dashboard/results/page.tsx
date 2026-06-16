'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PLATFORM_COLORS } from '@/lib/constants';
import { useBrandData } from '@/hooks/useBrandData';
import { TableSkeleton } from '@/components/dashboard/Skeleton';
import { PLATFORMS, type Platform, PlatformTile, Card, Pill, Filter, PageHead } from '@/app/dashboard-v2/ui';

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
  response: string;
}

type MentionedFilter = 'all' | 'yes' | 'no';

const PAGE_SIZE = 25;

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

function MentionedBadge({ mentioned }: { mentioned: boolean }) {
  return mentioned
    ? <span className="status-found">FOUND</span>
    : <span className="status-notfound">NOT FOUND</span>;
}

function dateOnly(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
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
      rows.push({
        id: `${run.id ?? 'run'}-${i}`,
        timestamp: ts,
        prompt: r.query || '',
        model: platform,
        mentioned: !!r.mentioned,
        response,
      });
    });
  }
  return rows;
}

export default function ResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { brand: rawBrand, loading } = useBrandData({ fullData: true });
  const brand = rawBrand as Brand | null;

  const allRows = useMemo(() => flattenRuns(brand), [brand]);
  const allModels = useMemo(() => Array.from(new Set(allRows.map(r => r.model))).sort(), [allRows]);
  const allPrompts = useMemo(() => Array.from(new Set(allRows.map(r => r.prompt).filter(Boolean))).sort(), [allRows]);

  // Filters live in the URL querystring so links are shareable.
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const model = searchParams.get('model') || 'all';
  const prompt = searchParams.get('prompt') || 'all';
  const mentionedRaw = searchParams.get('mentioned');
  const mentioned: MentionedFilter = mentionedRaw === 'yes' || mentionedRaw === 'no' ? mentionedRaw : 'all';

  const [page, setPage] = useState(0);
  // Which row is expanded to show its full response (collapsed by default).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tableScrolled, setTableScrolled] = useState(false);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  function clearFilters() {
    router.replace('?', { scroll: false });
  }

  const filtered = useMemo(() => {
    return allRows.filter(r => {
      if (model !== 'all' && r.model !== model) return false;
      if (prompt !== 'all' && r.prompt !== prompt) return false;
      if (mentioned === 'yes' && !r.mentioned) return false;
      if (mentioned === 'no' && r.mentioned) return false;
      if (from && dateOnly(r.timestamp) < from) return false;
      if (to && dateOnly(r.timestamp) > to) return false;
      return true;
    });
  }, [allRows, model, prompt, mentioned, from, to]);

  // Reset to first page when filter inputs change.
  useEffect(() => { setPage(0); }, [model, prompt, mentioned, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = page * PAGE_SIZE;
  const slice = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const hasFilters = !!(from || to || model !== 'all' || prompt !== 'all' || mentioned !== 'all');

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
                <option value="no">Not mentioned</option>
              </select>
              <input type="date" className="sel" aria-label="From"
                value={from} onChange={e => setParam('from', e.target.value)} />
              <input type="date" className="sel" aria-label="To"
                value={to} onChange={e => setParam('to', e.target.value)} />
              <Pill>{filtered.length === 0 ? 'No matches' : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`}</Pill>
              {totalPages > 1 && (
                <Pill>Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}</Pill>
              )}
              <span style={{ flex: 1 }} />
              {totalPages > 1 && (
                <>
                  <button type="button" className="btn-d" disabled={page === 0} onClick={() => setPage(p => p - 1)}>◀ Prev</button>
                  <button type="button" className="btn-d" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next ▶</button>
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
              slice.map(r => {
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
                      <MentionedBadge mentioned={r.mentioned} />
                      <span className="mono" style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span className="dim">QUERY ›</span> &ldquo;{r.prompt}&rdquo;
                      </span>
                      <span className="mono dim" style={{ fontSize: 11, flexShrink: 0 }}>{formatTimestamp(r.timestamp)}</span>
                    </div>
                    {/* Expanded: full response + MODEL/RESULT footer */}
                    {expanded && (
                      <div className="proof-body" style={{ padding: '0 14px 12px 38px', borderTop: '1px solid var(--border)' }}>
                        <div className="proof-answer" style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>
                          {r.response || <span className="dim">Engine returned no usable answer.</span>}
                        </div>
                        <div className="proof-meta mono" style={{ marginTop: 10 }}>
                          <span><span className="dim">MODEL:</span> {r.model}</span>
                          <span className="dim">·</span>
                          <span><span className="dim">RESULT:</span> {r.mentioned ? 'mentioned' : 'not mentioned'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
