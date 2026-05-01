'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRIES } from '@/lib/constants';
import { useBrands } from '@/contexts/BrandContext';
import AuditCreditConfirmModal, {
  AUDIT_PER_UNIT_COST,
  AUDIT_PLATFORMS_COUNT,
} from '@/components/dashboard/geo-audits/AuditCreditConfirmModal';
import AuditFilterPills, {
  type DateWindow,
  type StatusFilter,
} from '@/components/dashboard/geo-audits/AuditFilterPills';
import AuditsListTable, {
  type AuditTableRow,
  type DerivedStatus,
} from '@/components/dashboard/geo-audits/AuditsListTable';
import CompareStubModal from '@/components/dashboard/geo-audits/CompareStubModal';

const MAX_REGIONS_PER_AUDIT = 5;
const POLL_INTERVAL_MS = 5_000;

type GeoAuditStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

interface GeoAuditRow {
  id: string;
  brandId: string;
  regions: string[];
  prompts: string[];
  promptsCount: number;
  status: GeoAuditStatus;
  mentionsCount: number;
  /** Persisted on completion by the worker; null while queued/running
   *  or when no calls succeeded. Drives the 4-week trend sparkline. */
  mentionRate: number | null;
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
  // Two-stage submit: the user fills in regions/prompts, presses
  // "Run audit", we open the credit-confirmation modal with the
  // computed cost. POST only fires after Confirm & Run.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<{ prompts: string[] } | null>(null);

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

  function handleSubmit(e: React.FormEvent) {
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
    // Stage the payload, open the credit-confirmation popup. The
    // actual POST fires from `handleConfirmedSubmit` only after the
    // user clicks "Confirm & Run".
    setPendingPayload({ prompts });
    setConfirmOpen(true);
  }

  async function handleConfirmedSubmit() {
    if (!pendingPayload || submitting) return;
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      const res = await fetch('/api/geo-audits', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          regions: allRegions,
          prompts: pendingPayload.prompts,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          (typeof data?.error === 'string' && data.error) ||
          (typeof data?.message === 'string' && data.message) ||
          `Failed (HTTP ${res.status})`;
        setError(msg);
        setSubmitting(false);
        setPendingPayload(null);
        return;
      }
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Network error');
      setSubmitting(false);
      setPendingPayload(null);
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

      {confirmOpen && pendingPayload && (
        <AuditCreditConfirmModal
          regionsCount={allRegions.length}
          promptsCount={pendingPayload.prompts.length}
          perUnitCost={AUDIT_PER_UNIT_COST}
          platformsCount={AUDIT_PLATFORMS_COUNT}
          onCancel={() => {
            // Cancel from credit modal: keep the config modal open
            // so the user can adjust regions/prompts and re-submit.
            setConfirmOpen(false);
            setPendingPayload(null);
          }}
          onConfirm={handleConfirmedSubmit}
        />
      )}
    </div>
  );
}


type ApiStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

function deriveStatus(row: GeoAuditRow): DerivedStatus {
  if (row.status === 'done' && row.totalExpected > 0 && row.received < row.totalExpected) {
    return 'partial';
  }
  return row.status;
}

function withinDateWindow(iso: string, win: DateWindow): boolean {
  if (win === 'all') return true;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const days = win === '7d' ? 7 : win === '30d' ? 30 : 90;
  return Date.now() - t <= days * 86_400_000;
}

function matchStatus(d: DerivedStatus, f: StatusFilter): boolean {
  if (f === 'all') return true;
  return d === f;
}

function matchSearch(row: GeoAuditRow, search: string): boolean {
  if (!search.trim()) return true;
  const q = search.trim().toLowerCase();
  if (row.regions.some((r) => r.toLowerCase().includes(q))) return true;
  if (row.prompts.some((p) => p.toLowerCase().includes(q))) return true;
  return false;
}

/** Build per-row 4-week trend values: up to the 4 most recent
 *  mention_rates from THIS user's audits in the SAME (single-region)
 *  audit, oldest → newest. Multi-region audits use the row's own
 *  mention_rate as a single point (no per-region breakdown stored). */
function buildTrendMap(audits: GeoAuditRow[]): Record<string, number[]> {
  // Group rates by region key. Only consider rows with a non-null
  // mention_rate (i.e., terminal completed runs). NO mock data —
  // an empty array means "no trend data yet" for that region.
  const byRegion = new Map<string, Array<{ at: number; rate: number }>>();
  for (const a of audits) {
    if (a.mentionRate == null) continue;
    if (a.regions.length !== 1) continue; // multi-region rows don't aggregate cleanly
    const key = a.regions[0];
    const t = new Date(a.createdAt).getTime();
    if (!Number.isFinite(t)) continue;
    const arr = byRegion.get(key) ?? [];
    arr.push({ at: t, rate: a.mentionRate });
    byRegion.set(key, arr);
  }
  // Sort newest → oldest, take first 4, reverse to oldest → newest.
  const out: Record<string, number[]> = {};
  for (const [key, arr] of byRegion) {
    arr.sort((x, y) => y.at - x.at);
    out[key] = arr.slice(0, 4).reverse().map((p) => p.rate);
  }
  return out;
}

export default function GeoAuditsPage() {
  const { selectedBrand } = useBrands();
  const [audits, setAudits] = useState<GeoAuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Filter / search / selection state
  const [region, setRegion] = useState<string>('');
  const [dateWindow, setDateWindow] = useState<DateWindow>('30d');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);

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

  // Polling lifecycle — same as the existing page (preserved).
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

  // Derived view-model
  const allAudits = audits ?? [];
  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of allAudits) for (const r of a.regions) set.add(r);
    return Array.from(set).sort();
  }, [allAudits]);

  const trendMap = useMemo(() => buildTrendMap(allAudits), [allAudits]);

  const filtered = useMemo(() => {
    return allAudits.filter((a) => {
      if (region && !a.regions.includes(region)) return false;
      if (!withinDateWindow(a.createdAt, dateWindow)) return false;
      if (!matchStatus(deriveStatus(a), status)) return false;
      if (!matchSearch(a, search)) return false;
      return true;
    });
  }, [allAudits, region, dateWindow, status, search]);

  const tableRows: AuditTableRow[] = filtered.map((a) => ({
    id: a.id,
    regions: a.regions,
    createdAt: a.createdAt,
    promptsCount: a.promptsCount,
    totalExpected: a.totalExpected,
    received: a.received,
    mentionsCount: a.mentionsCount,
    status: deriveStatus(a),
    trendValues: a.regions.length === 1
      ? (trendMap[a.regions[0]] ?? [])
      : (a.mentionRate != null ? [a.mentionRate] : []),
  }));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedCount = selectedIds.size;
  const canCompare = selectedCount === 2;
  const compareTooltip =
    selectedCount === 0 ? 'Select 2 audits to compare'
    : selectedCount === 1 ? 'Select 1 more audit to compare'
    : selectedCount > 2 ? `Compare allows exactly 2 audits (${selectedCount} selected)`
    : '';

  function openCompare() {
    if (!canCompare) return;
    const [a, b] = Array.from(selectedIds);
    setCompareIds([a, b]);
  }

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 16, gap: 12, flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="view-title">Regional audits</div>
          <div className="view-sub" style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums' }}>
            {audits === null
              ? 'Loading…'
              : <><strong style={{ color: 'var(--text)' }}>{allAudits.length}</strong> {allAudits.length === 1 ? 'audit' : 'audits'} · <strong style={{ color: 'var(--text)' }}>{selectedCount}</strong> selected</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={openCompare}
            disabled={!canCompare}
            title={compareTooltip || undefined}
            aria-disabled={!canCompare}
            style={{
              minHeight: 40, padding: '8px 14px',
              background: canCompare ? 'var(--bg)' : 'var(--bg3)',
              color: canCompare ? 'var(--text)' : 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)',
              fontSize: 12, fontWeight: 600,
              cursor: canCompare ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font)',
            }}
          >
            Compare {selectedCount === 2 ? '2' : selectedCount} selected
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={!brandId || trackedPrompts.length === 0}
            title={!brandId ? 'Select a brand first' : (trackedPrompts.length === 0 ? 'Add tracked prompts to your brand first' : '')}
            style={{
              minHeight: 40, padding: '8px 16px',
              background: !brandId || trackedPrompts.length === 0 ? 'var(--bg3)' : 'var(--primary)',
              color: !brandId || trackedPrompts.length === 0 ? 'var(--muted)' : '#fff',
              border: 'none', borderRadius: 'var(--radius-xs)',
              fontSize: 12, fontWeight: 700,
              cursor: !brandId || trackedPrompts.length === 0 ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            + New audit
          </button>
        </div>
      </div>

      {/* ── Filter pills + search ──────────────────────────────── */}
      <AuditFilterPills
        regionOptions={regionOptions}
        region={region}
        onRegionChange={setRegion}
        dateWindow={dateWindow}
        onDateWindowChange={setDateWindow}
        status={status}
        onStatusChange={setStatus}
        search={search}
        onSearchChange={setSearch}
      />

      {/* ── Table / list / empty / error states ────────────────── */}
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
      ) : allAudits.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, opacity: 0.4, marginBottom: 12 }}>🌍</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No regional audits yet</div>
          <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 360, margin: '0 auto 16px' }}>
            Run your tracked prompts from a chosen country or region to compare how your brand shows up across markets.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            disabled={!brandId || trackedPrompts.length === 0}
            style={{
              display: 'inline-block',
              background: !brandId || trackedPrompts.length === 0 ? 'var(--bg3)' : 'var(--primary)',
              color: !brandId || trackedPrompts.length === 0 ? 'var(--muted)' : '#fff',
              padding: '8px 20px', borderRadius: 'var(--radius-xs)',
              fontSize: 12, fontWeight: 700, border: 'none',
              cursor: !brandId || trackedPrompts.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Run your first regional audit
          </button>
        </div>
      ) : tableRows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 13 }}>
          <div style={{ marginBottom: 8 }}>No audits match your current filters.</div>
          <button
            onClick={() => { setRegion(''); setDateWindow('30d'); setStatus('all'); setSearch(''); }}
            className="pbtn"
            style={{ minHeight: 36 }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <AuditsListTable
          rows={tableRows}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      )}

      {/* ── New Audit modal (existing flow, preserved) ─────────── */}
      {modalOpen && (
        <NewAuditModal
          brandId={brandId}
          brandName={brandName}
          trackedPrompts={trackedPrompts}
          onClose={() => setModalOpen(false)}
          onCreated={fetchAudits}
        />
      )}

      {/* ── Compare stub ──────────────────────────────────────── */}
      {compareIds && (
        <CompareStubModal
          ids={compareIds}
          onClose={() => setCompareIds(null)}
        />
      )}
    </div>
  );
}
