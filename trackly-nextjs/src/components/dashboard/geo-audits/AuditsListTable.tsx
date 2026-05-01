'use client';

import { useRouter } from 'next/navigation';
import MentionRateSparkline from './MentionRateSparkline';

/**
 * Audits list — desktop table / mobile card list (auto-switches at
 * 768px via the `is-mobile` class toggle from the parent media-query).
 *
 * Columns:
 *   checkbox | region · date | run (Px·R × 5) | mentions (X/Y + %) | 4-week trend | status pill
 *
 * Click anywhere except the checkbox → router.push to drill-down.
 */

export type DerivedStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'partial'
  | 'failed'
  | 'cancelled';

export interface AuditTableRow {
  id: string;
  regions: string[];
  createdAt: string;
  promptsCount: number;
  totalExpected: number;
  received: number;
  mentionsCount: number;
  /** Derived by the parent (`partial = done && received < total_expected`). */
  status: DerivedStatus;
  /** Per-region mention_rate snapshots, oldest → newest, for the
   *  4-week sparkline. Empty array = no trend data yet (intentional;
   *  no fake data). */
  trendValues: number[];
}

interface Props {
  rows: AuditTableRow[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  /** Fired when the user clicks the row body (NOT the checkbox). */
  onRowClick?: (id: string) => void;
}

const STATUS_THEME: Record<DerivedStatus, { bg: string; fg: string; label: string }> = {
  queued:    { bg: 'rgba(148,163,184,.10)', fg: 'var(--muted)',   label: 'Queued' },
  running:   { bg: 'rgba(99,102,241,.08)',  fg: 'var(--primary)', label: 'Running' },
  done:      { bg: 'rgba(16,185,129,.08)',  fg: 'var(--green)',   label: 'Done' },
  partial:   { bg: 'rgba(245,158,11,.08)',  fg: 'var(--amber)',   label: 'Partial' },
  failed:    { bg: 'rgba(239,68,68,.08)',   fg: 'var(--red)',     label: 'Failed' },
  cancelled: { bg: 'rgba(148,163,184,.10)', fg: 'var(--muted)',   label: 'Cancelled' },
};

function StatusPill({ status }: { status: DerivedStatus }) {
  const t = STATUS_THEME[status];
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
        color: t.fg, background: t.bg,
        padding: '3px 10px', borderRadius: 100,
        whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.5,
      }}
    >
      {t.label}
    </span>
  );
}

function formatRowDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AuditsListTable({
  rows,
  selectedIds,
  onToggleSelect,
  onRowClick,
}: Props) {
  const router = useRouter();

  function handleRowClick(id: string) {
    if (onRowClick) onRowClick(id);
    else router.push(`/dashboard/geo-audits/${encodeURIComponent(id)}`);
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Table header — hidden on mobile via CSS */}
      <div
        className="ral-thead"
        role="row"
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 1fr 100px 130px 90px 110px',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          fontSize: 11, fontWeight: 700,
          color: 'var(--muted)', textTransform: 'uppercase',
          letterSpacing: 0.5,
          background: 'var(--bg3)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span aria-hidden="true" />
        <span>Region · date</span>
        <span>Run</span>
        <span>Mentions</span>
        <span>4-week trend</span>
        <span>Status</span>
      </div>

      <div role="rowgroup">
        {rows.map((row) => {
          const checked = selectedIds.has(row.id);
          const failedCalls = Math.max(0, row.totalExpected - row.received);
          // Approximate prompts-failed from call-level data: each
          // prompt fans out to 5 platforms, so ceil(failed_calls / 5)
          // is the upper bound on prompts that had any failure. Drill-
          // down (Screen 02) shows the exact per-call detail.
          const promptsFailed = failedCalls > 0 ? Math.ceil(failedCalls / 5) : 0;
          const showSubtext =
            (row.status === 'failed' || row.status === 'partial') && promptsFailed > 0;

          const mentionPct = row.received > 0
            ? Math.round((row.mentionsCount / row.received) * 1000) / 10
            : null;

          return (
            <div
              key={row.id}
              className="ral-row"
              role="row"
              onClick={(e) => {
                // Don't navigate when the user clicks the checkbox cell.
                const t = e.target as HTMLElement;
                if (t.closest('[data-rowclick-ignore]')) return;
                handleRowClick(row.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleRowClick(row.id);
                }
              }}
              tabIndex={0}
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr 100px 130px 90px 110px',
                alignItems: 'center',
                gap: 8,
                padding: '14px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {/* checkbox */}
              <div
                data-rowclick-ignore
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSelect(row.id)}
                  aria-label={`Select audit ${row.regions.join(' · ')}`}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
              </div>

              {/* Region · date (with optional sub-text) */}
              <div className="ral-cell-region" style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.regions.join(' · ')}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)', fontSize: 12 }}>
                    {formatRowDate(row.createdAt)}
                  </span>
                </div>
                {showSubtext && (
                  <div style={{ fontSize: 11, color: STATUS_THEME[row.status].fg, marginTop: 2 }}>
                    {promptsFailed} of {row.promptsCount} prompts failed
                  </div>
                )}
              </div>

              {/* Run column: prompts × platforms */}
              <div className="ral-cell-run" style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                <span data-mobile-label style={{ display: 'none', color: 'var(--muted)', fontSize: 11, marginRight: 6 }}>Run</span>
                {row.promptsCount * row.regions.length} × 5
              </div>

              {/* Mentions: X / Y + percent badge */}
              <div className="ral-cell-mentions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span data-mobile-label style={{ display: 'none', color: 'var(--muted)', fontSize: 11 }}>Mentions</span>
                <span style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.mentionsCount} / {row.totalExpected}
                </span>
                {mentionPct !== null && (
                  <span
                    style={{
                      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 100,
                      background: 'rgba(16,185,129,.08)',
                      color: 'var(--green)',
                    }}
                  >
                    {mentionPct.toFixed(1)}%
                  </span>
                )}
              </div>

              {/* 4-week trend sparkline */}
              <div className="ral-cell-trend">
                <MentionRateSparkline values={row.trendValues} />
              </div>

              {/* Status */}
              <div className="ral-cell-status">
                <StatusPill status={row.status} />
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .ral-row:hover { background: var(--bg3); }
        .ral-row:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
        @media (max-width: 767px) {
          .ral-thead { display: none !important; }
          .ral-row {
            grid-template-columns: 24px 1fr !important;
            grid-template-areas:
              'check region'
              'check run'
              'check mentions'
              'check trend'
              'check status' !important;
            row-gap: 6px !important;
            padding: 14px 12px !important;
          }
          .ral-row > :nth-child(1) { grid-area: check; }
          .ral-row > .ral-cell-region   { grid-area: region; }
          .ral-row > .ral-cell-run      { grid-area: run; }
          .ral-row > .ral-cell-mentions { grid-area: mentions; }
          .ral-row > .ral-cell-trend    { grid-area: trend; }
          .ral-row > .ral-cell-status   { grid-area: status; justify-self: start; }
          .ral-row [data-mobile-label]  { display: inline !important; }
        }
      `}</style>
    </div>
  );
}
