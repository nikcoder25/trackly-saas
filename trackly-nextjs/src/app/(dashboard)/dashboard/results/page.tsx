'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PLATFORM_COLORS } from '@/lib/constants';
import { useBrandData } from '@/hooks/useBrandData';
import { TableSkeleton } from '@/components/dashboard/Skeleton';

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
  // Platform/model identifier — matches PLATFORM_COLORS keys.
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

interface DetailPanelProps {
  row: ResultRow;
  onClose: () => void;
}

function DetailPanel({ row, onClose }: DetailPanelProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Result detail"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
        display: 'flex', justifyContent: 'flex-end',
      }}>
      <div onClick={e => e.stopPropagation()}
        className="card"
        style={{
          width: '100%', maxWidth: 560, height: '100%', borderRadius: 0,
          padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Result</h2>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44 }}>×</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.8 }}>
          <div><strong style={{ color: 'var(--text)' }}>Timestamp:</strong> <span style={{ fontFamily: 'var(--mono)' }}>{formatTimestamp(row.timestamp)}</span></div>
          <div><strong style={{ color: 'var(--text)' }}>Model:</strong> <span style={{ color: PLATFORM_COLORS[row.model] || 'var(--text)', fontWeight: 700 }}>{row.model}</span></div>
          <div><strong style={{ color: 'var(--text)' }}>Mentioned:</strong> {row.mentioned ? 'Yes' : 'No'}</div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Prompt</div>
          <div style={{ background: 'var(--bg3)', padding: 12, borderRadius: 'var(--radius-xs)', fontSize: 13, color: 'var(--text)' }}>{row.prompt}</div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Raw response</div>
          <div style={{
            background: 'var(--bg3)', padding: 14, borderRadius: 'var(--radius-xs)',
            fontSize: 12, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
            borderLeft: `3px solid ${row.mentioned ? 'var(--green)' : 'var(--red)'}`,
          }}>{row.response}</div>
        </div>
      </div>
    </div>
  );
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
  const [activeRow, setActiveRow] = useState<ResultRow | null>(null);
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
      <div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 22, width: 140, borderRadius: 6, background: 'var(--bg3)', marginBottom: 8 }} />
          <div style={{ height: 13, width: 300, borderRadius: 4, background: 'var(--bg3)' }} />
        </div>
        <TableSkeleton rows={6} cols={5} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <div className="view-title">Results</div>
        <div className="view-sub">Every prompt × model × run, one row per result.</div>
      </div>

      {allRows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, opacity: .4, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No results yet</div>
          <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 360, margin: '0 auto 16px' }}>
            No results yet — add a tracked prompt to start collecting.
          </p>
          <a href="/dashboard/prompts"
            style={{
              display: 'inline-block', background: 'var(--primary)', color: '#fff',
              padding: '8px 20px', borderRadius: 'var(--radius-xs)', fontSize: 12, fontWeight: 700, textDecoration: 'none',
            }}>
            Manage tracked prompts
          </a>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="card" style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
                <label htmlFor="r-from" style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>From</label>
                <input id="r-from" type="date" className="brand-select" style={{ width: '100%', margin: 0 }}
                  value={from} onChange={e => setParam('from', e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
                <label htmlFor="r-to" style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>To</label>
                <input id="r-to" type="date" className="brand-select" style={{ width: '100%', margin: 0 }}
                  value={to} onChange={e => setParam('to', e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
                <label htmlFor="r-model" style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Model</label>
                <select id="r-model" className="brand-select" style={{ width: '100%', margin: 0 }}
                  value={model} onChange={e => setParam('model', e.target.value)}>
                  <option value="all">All models</option>
                  {allModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: 1 }}>
                <label htmlFor="r-prompt" style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Prompt</label>
                <select id="r-prompt" className="brand-select" style={{ width: '100%', margin: 0 }}
                  value={prompt} onChange={e => setParam('prompt', e.target.value)}>
                  <option value="all">All prompts</option>
                  {allPrompts.map(p => <option key={p} value={p}>{truncate(p, 60)}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
                <label htmlFor="r-mentioned" style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Mentioned</label>
                <select id="r-mentioned" className="brand-select" style={{ width: '100%', margin: 0 }}
                  value={mentioned} onChange={e => setParam('mentioned', e.target.value)}>
                  <option value="all">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              {hasFilters && (
                <button type="button" onClick={clearFilters} className="pbtn" style={{ minHeight: 44 }}>
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Results count */}
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
            {filtered.length === 0
              ? 'No results match filters'
              : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`}
          </div>

          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: 36, opacity: .4, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No matching results</div>
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Try adjusting your filters to see more results.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className={`scroll-fade-wrap${tableScrolled ? ' is-scrolled' : ''}`}>
                <div
                  style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
                  onScroll={(e) => {
                    const next = (e.currentTarget.scrollLeft || 0) > 0;
                    if (next !== tableScrolled) setTableScrolled(next);
                  }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg3)' }}>
                        <th className="th" style={{ width: '16%' }}>Timestamp</th>
                        <th className="th" style={{ width: '24%' }}>Prompt</th>
                        <th className="th" style={{ width: '12%' }}>Model</th>
                        <th className="th" style={{ width: '12%' }}>Mentioned</th>
                        <th className="th">Snippet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice.map(r => (
                        <tr key={r.id} className="trow" role="button" tabIndex={0}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setActiveRow(r)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setActiveRow(r);
                            }
                          }}>
                          <td className="td" style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{formatTimestamp(r.timestamp)}</td>
                          <td className="td">{truncate(r.prompt, 60)}</td>
                          <td className="td" style={{ color: PLATFORM_COLORS[r.model] || 'var(--text)', fontWeight: 700 }}>{r.model}</td>
                          <td className="td"><MentionedBadge mentioned={r.mentioned} /></td>
                          <td className="td" style={{ color: 'var(--muted)' }}>{truncate(r.response.replace(/\s+/g, ' '), 90)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
                Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {page > 0 && <button className="pbtn" onClick={() => setPage(p => p - 1)} style={{ minHeight: 44 }}>‹</button>}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const ps = Math.max(0, Math.min(page - 2, totalPages - 5));
                  const p = ps + i;
                  if (p >= totalPages) return null;
                  return (
                    <button key={p} className="pbtn"
                      style={{ minHeight: 44, ...(p === page ? { background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' } : {}) }}
                      onClick={() => setPage(p)}>{p + 1}</button>
                  );
                })}
                {page < totalPages - 1 && <button className="pbtn" onClick={() => setPage(p => p + 1)} style={{ minHeight: 44 }}>›</button>}
              </div>
            </div>
          )}
        </>
      )}

      {activeRow && <DetailPanel row={activeRow} onClose={() => setActiveRow(null)} />}
    </div>
  );
}
