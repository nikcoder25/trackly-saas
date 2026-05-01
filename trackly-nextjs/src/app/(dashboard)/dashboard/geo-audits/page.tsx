'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRIES } from '@/lib/constants';
import { useBrands } from '@/contexts/BrandContext';

const MAX_REGIONS_PER_AUDIT = 5;
const POLL_INTERVAL_MS = 5_000;

type GeoAuditStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

interface GeoAuditRow {
  id: string;
  brandId: string;
  regions: string[];
  promptsCount: number;
  status: GeoAuditStatus;
  mentionsCount: number;
  totalExpected: number;
  received: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface GeoAuditResultRow {
  id: string;
  region: string;
  promptText: string;
  platform: string;
  model: string | null;
  response: string | null;
  mentioned: boolean;
  error: string | null;
  createdAt: string | null;
}

const STATUS_LABEL: Record<GeoAuditStatus, string> = {
  queued: 'QUEUED',
  running: 'RUNNING',
  done: 'DONE',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
};

const STATUS_COLOR: Record<GeoAuditStatus, string> = {
  queued: 'var(--muted)',
  running: 'var(--primary)',
  done: 'var(--green)',
  failed: 'var(--red)',
  cancelled: 'var(--muted)',
};

function StatusPill({ status }: { status: GeoAuditStatus }) {
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
      color: STATUS_COLOR[status],
      padding: '2px 8px',
      background: status === 'done' ? 'rgba(16,185,129,.08)'
        : status === 'failed' ? 'rgba(239,68,68,.08)'
        : status === 'running' ? 'rgba(99,102,241,.08)'
        : 'rgba(148,163,184,.10)',
      borderRadius: 100,
      whiteSpace: 'nowrap',
    }}>{STATUS_LABEL[status]}</span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

interface NewAuditModalProps {
  brandId: string | null;
  brandName: string | null;
  trackedPrompts: string[];
  onClose: () => void;
  onCreated: () => void;
}

function NewAuditModal({ brandId, brandName, trackedPrompts, onClose, onCreated }: NewAuditModalProps) {
  const [region, setRegion] = useState<string>(COUNTRIES[0]);
  const [extraRegions, setExtraRegions] = useState<string[]>([]);
  const [allPrompts, setAllPrompts] = useState(true);
  const [promptCount, setPromptCount] = useState<number>(trackedPrompts.length);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allRegions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of [region, ...extraRegions]) {
      if (!seen.has(r)) { seen.add(r); out.push(r); }
    }
    return out;
  }, [region, extraRegions]);

  const canAddMore = allRegions.length < MAX_REGIONS_PER_AUDIT && allRegions.length < COUNTRIES.length;

  function addExtraRegion() {
    if (!canAddMore) return;
    const remaining = COUNTRIES.find((c) => !allRegions.includes(c));
    if (!remaining) return;
    setExtraRegions([...extraRegions, remaining]);
  }

  function setExtraAt(idx: number, value: string) {
    const next = extraRegions.slice();
    next[idx] = value;
    setExtraRegions(next);
  }

  function removeExtra(idx: number) {
    setExtraRegions(extraRegions.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!brandId) {
      setError('Select a brand first.');
      return;
    }
    if (trackedPrompts.length === 0) {
      setError("This brand doesn't have any tracked prompts yet.");
      return;
    }
    const count = allPrompts
      ? trackedPrompts.length
      : Math.max(1, Math.min(trackedPrompts.length, promptCount));
    const prompts = trackedPrompts.slice(0, count);

    setSubmitting(true);
    try {
      const res = await fetch('/api/geo-audits', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, regions: allRegions, prompts }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          (typeof data?.error === 'string' && data.error) ||
          (typeof data?.message === 'string' && data.message) ||
          `Failed (HTTP ${res.status})`;
        setError(msg);
        setSubmitting(false);
        return;
      }
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Run new regional audit"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
      <div onClick={e => e.stopPropagation()}
        className="card"
        style={{ width: '100%', maxWidth: 480, padding: 20, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Run new regional audit</h2>
          <button onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0, minWidth: 44, minHeight: 44 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {brandName && (
            <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)' }}>
              Brand: <strong style={{ color: 'var(--text)' }}>{brandName}</strong>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="ga-primary-region" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
              Region
            </label>
            <select id="ga-primary-region" className="brand-select" style={{ width: '100%', margin: 0 }}
              value={region} onChange={e => setRegion(e.target.value)}>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {extraRegions.map((r, i) => (
            <div key={i} style={{ marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor={`ga-extra-${i}`} style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
                  Additional region
                </label>
                <select id={`ga-extra-${i}`} className="brand-select" style={{ width: '100%', margin: 0 }}
                  value={r} onChange={e => setExtraAt(i, e.target.value)}>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => removeExtra(i)} aria-label="Remove region"
                style={{ minWidth: 44, minHeight: 44, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          ))}

          {canAddMore && (
            <button type="button" onClick={addExtraRegion}
              style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--radius-xs)', color: 'var(--primary)', padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 18, width: '100%' }}>
              + Add another region (max {MAX_REGIONS_PER_AUDIT})
            </button>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
              Prompts to include
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', minHeight: 44 }}>
              <input type="radio" name="ga-prompts" checked={allPrompts} onChange={() => setAllPrompts(true)} />
              All tracked prompts ({trackedPrompts.length})
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', minHeight: 44 }}>
              <input type="radio" name="ga-prompts" checked={!allPrompts} onChange={() => setAllPrompts(false)} />
              Custom count
              {!allPrompts && (
                <input type="number" min={1} max={trackedPrompts.length} value={promptCount}
                  onChange={e => setPromptCount(Math.max(1, Math.min(trackedPrompts.length, Number(e.target.value) || 1)))}
                  className="brand-select" style={{ width: 80, margin: 0 }} />
              )}
            </label>
          </div>

          <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg3)', borderRadius: 'var(--radius-xs)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            Will run <strong style={{ color: 'var(--text)' }}>{(allPrompts ? trackedPrompts.length : promptCount) * allRegions.length * 5}</strong> calls
            ({allPrompts ? trackedPrompts.length : promptCount} prompts × {allRegions.length} region{allRegions.length === 1 ? '' : 's'} × 5 AI models) and reserve the same number of credits.
          </div>

          {error && (
            <div style={{ marginBottom: 12, padding: '8px 10px', background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius-xs)', color: 'var(--red)', fontSize: 12 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
            <button type="button" onClick={onClose} className="pbtn" style={{ minHeight: 44 }}>Cancel</button>
            <button type="submit" disabled={submitting || trackedPrompts.length === 0 || !brandId}
              style={{
                minHeight: 44, padding: '8px 18px', background: 'var(--primary)', color: '#fff',
                border: 'none', borderRadius: 'var(--radius-xs)', fontSize: 12, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting || trackedPrompts.length === 0 || !brandId ? 0.6 : 1,
              }}>
              {submitting ? 'Queuing…' : 'Run audit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function GeoAuditsPage() {
  const { selectedBrand } = useBrands();
  const [audits, setAudits] = useState<GeoAuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tableScrolled, setTableScrolled] = useState(false);
  const [resultsCache, setResultsCache] = useState<Record<string, GeoAuditResultRow[] | 'loading' | 'error'>>({});

  // Tracked prompts come from the currently-selected brand. Brand
  // shape carries `queries` as a string array on the client (same
  // source the brand-run page uses).
  const trackedPrompts = useMemo<string[]>(() => {
    const b = selectedBrand as { queries?: unknown } | null;
    if (!b || !Array.isArray(b.queries)) return [];
    return b.queries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0);
  }, [selectedBrand]);

  const brandId: string | null = selectedBrand?.id ?? null;
  const brandName: string | null = (selectedBrand?.name as string | undefined) ?? null;

  // Polling state — start a 5s interval while any audit is in
  // queued/running; clear it when all audits land in a terminal state.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);

  async function fetchAudits() {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch('/api/geo-audits', { credentials: 'include' });
      if (!res.ok) {
        if (audits === null) setError(`Failed to load (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data?.audits) ? (data.audits as GeoAuditRow[]) : [];
      setAudits(list);
      setError(null);
    } catch (e) {
      if (audits === null) setError((e as Error).message || 'Network error');
    } finally {
      inFlight.current = false;
    }
  }

  // Initial fetch + polling lifecycle
  useEffect(() => {
    fetchAudits();
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const anyActive = (audits ?? []).some(
      (a) => a.status === 'queued' || a.status === 'running',
    );
    if (anyActive && !pollRef.current) {
      pollRef.current = setInterval(fetchAudits, POLL_INTERVAL_MS);
    } else if (!anyActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audits]);

  async function loadResultsFor(id: string) {
    if (resultsCache[id] && resultsCache[id] !== 'error') return;
    setResultsCache((prev) => ({ ...prev, [id]: 'loading' }));
    try {
      const res = await fetch(`/api/geo-audits/${encodeURIComponent(id)}`, { credentials: 'include' });
      if (!res.ok) {
        setResultsCache((prev) => ({ ...prev, [id]: 'error' }));
        return;
      }
      const data = await res.json();
      const rows = Array.isArray(data?.results) ? (data.results as GeoAuditResultRow[]) : [];
      setResultsCache((prev) => ({ ...prev, [id]: rows }));
    } catch {
      setResultsCache((prev) => ({ ...prev, [id]: 'error' }));
    }
  }

  function handleExpand(id: string) {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) loadResultsFor(next);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="view-title">Regional Audits</div>
          <div className="view-sub">Run your tracked prompts through AI models from different regions.</div>
        </div>
        <button onClick={() => setModalOpen(true)}
          disabled={!brandId || trackedPrompts.length === 0}
          title={!brandId ? 'Select a brand first' : (trackedPrompts.length === 0 ? 'Add tracked prompts to your brand first' : '')}
          style={{
            minHeight: 44, padding: '8px 18px',
            background: !brandId || trackedPrompts.length === 0 ? 'var(--bg3)' : 'var(--primary)',
            color: !brandId || trackedPrompts.length === 0 ? 'var(--muted)' : '#fff',
            border: 'none', borderRadius: 'var(--radius-xs)', fontSize: 12, fontWeight: 700,
            cursor: !brandId || trackedPrompts.length === 0 ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}>
          + Run new audit
        </button>
      </div>

      {audits === null && !error ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', fontSize: 13 }}>
          Loading regional audits…
        </div>
      ) : error ? (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 4 }}>Couldn&apos;t load audits</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{error}</div>
          <button onClick={fetchAudits} className="pbtn" style={{ minHeight: 36 }}>Retry</button>
        </div>
      ) : (audits ?? []).length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, opacity: .4, marginBottom: 12 }}>🌍</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No regional audits yet</div>
          <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 360, margin: '0 auto 16px' }}>
            Run your tracked prompts from a chosen country or region to compare how your brand shows up across markets.
          </p>
          <button onClick={() => setModalOpen(true)}
            disabled={!brandId || trackedPrompts.length === 0}
            style={{
              display: 'inline-block',
              background: !brandId || trackedPrompts.length === 0 ? 'var(--bg3)' : 'var(--primary)',
              color: !brandId || trackedPrompts.length === 0 ? 'var(--muted)' : '#fff',
              padding: '8px 20px', borderRadius: 'var(--radius-xs)', fontSize: 12, fontWeight: 700,
              border: 'none', cursor: !brandId || trackedPrompts.length === 0 ? 'not-allowed' : 'pointer',
            }}>
            Run your first regional audit
          </button>
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
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--bg3)' }}>
                    <th className="th" style={{ width: '20%' }}>Date</th>
                    <th className="th">Region</th>
                    <th className="th" style={{ width: '14%' }}>Prompts</th>
                    <th className="th" style={{ width: '14%' }}>Mentions</th>
                    <th className="th" style={{ width: '14%' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(audits ?? []).map((a) => {
                    const isExpanded = expandedId === a.id;
                    const cache = resultsCache[a.id];
                    return (
                      <React.Fragment key={a.id}>
                        <tr className="trow" role="button" tabIndex={0}
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleExpand(a.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleExpand(a.id);
                            }
                          }}>
                          <td className="td" style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{formatDate(a.createdAt)}</td>
                          <td className="td">{a.regions.join(' · ')}</td>
                          <td className="td" style={{ fontFamily: 'var(--mono)' }}>{a.promptsCount}</td>
                          <td className="td" style={{ fontFamily: 'var(--mono)', color: a.mentionsCount > 0 ? 'var(--green)' : 'var(--muted)' }}>
                            {a.status === 'done' ? a.mentionsCount : '-'}
                          </td>
                          <td className="td"><StatusPill status={a.status} /></td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} style={{ padding: 0 }}>
                              <div style={{ padding: 16, background: 'var(--bg)', borderTop: '1px solid var(--bg3)', fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
                                <div><strong>Audit ID:</strong> <span style={{ fontFamily: 'var(--mono)' }}>{a.id}</span></div>
                                <div><strong>Regions:</strong> {a.regions.join(', ')}</div>
                                <div><strong>Calls completed:</strong> {a.received} / {a.totalExpected}</div>
                                <div>
                                  <strong>Mention rate:</strong>{' '}
                                  {a.status === 'done' && a.received > 0
                                    ? `${Math.round((a.mentionsCount / a.received) * 100)}% (${a.mentionsCount}/${a.received})`
                                    : '-'}
                                </div>
                                {a.error && (
                                  <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.15)', borderRadius: 'var(--radius-xs)', color: 'var(--red)' }}>
                                    {a.error}
                                  </div>
                                )}
                                {a.status === 'done' && (
                                  <div style={{ marginTop: 12 }}>
                                    <strong style={{ display: 'block', marginBottom: 6 }}>Per-call results</strong>
                                    {cache === 'loading' || !cache ? (
                                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>Loading…</div>
                                    ) : cache === 'error' ? (
                                      <div style={{ color: 'var(--red)', fontSize: 11 }}>Failed to load results.</div>
                                    ) : cache.length === 0 ? (
                                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>No results recorded.</div>
                                    ) : (
                                      <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', marginTop: 4 }}>
                                          <thead>
                                            <tr style={{ color: 'var(--muted)' }}>
                                              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Region</th>
                                              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Platform</th>
                                              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Prompt</th>
                                              <th style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 600 }}>Mentioned</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {cache.slice(0, 50).map((r) => (
                                              <tr key={r.id} style={{ borderTop: '1px solid var(--bg3)' }}>
                                                <td style={{ padding: '4px 6px' }}>{r.region}</td>
                                                <td style={{ padding: '4px 6px', fontFamily: 'var(--mono)' }}>{r.platform}</td>
                                                <td style={{ padding: '4px 6px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.promptText}>{r.promptText}</td>
                                                <td style={{ padding: '4px 6px', textAlign: 'center', color: r.error ? 'var(--red)' : r.mentioned ? 'var(--green)' : 'var(--muted)' }}>
                                                  {r.error ? 'ERR' : r.mentioned ? '✓' : '✗'}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                        {cache.length > 50 && (
                                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                                            Showing first 50 of {cache.length} results.
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
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
          </div>
        </div>
      )}

      {modalOpen && (
        <NewAuditModal
          brandId={brandId}
          brandName={brandName}
          trackedPrompts={trackedPrompts}
          onClose={() => setModalOpen(false)}
          onCreated={fetchAudits}
        />
      )}
    </div>
  );
}
