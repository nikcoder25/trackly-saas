'use client';

import Link from 'next/link';

interface Props {
  regionLabel: string;     // e.g. "India · France"
  dateLabel: string;       // e.g. "Nov 14"
  status: string;          // upper-case status pill, e.g. "DONE"
  onExportCsv: () => void;
  onRerun: () => void;
  rerunDisabled?: boolean;
  rerunDisabledReason?: string;
}

export default function DrillDownHeader({
  regionLabel, dateLabel, status, onExportCsv, onRerun, rerunDisabled, rerunDisabledReason,
}: Props) {
  return (
    <div
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Link
          href="/dashboard/geo-audits"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, fontWeight: 600, color: 'var(--primary)',
            textDecoration: 'none', marginBottom: 6,
          }}
        >
          <span aria-hidden="true">←</span> Audits
        </Link>
        <div className="view-title" style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span>{regionLabel} audit</span>
          <span style={{ color: 'var(--muted)', fontWeight: 500, fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', fontSize: 16 }}>
            · {dateLabel}
          </span>
          {status && (
            <span
              style={{
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                padding: '3px 10px', borderRadius: 100,
                background: 'rgba(148,163,184,.10)', color: 'var(--muted)',
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}
            >
              {status}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onExportCsv}
          style={{
            minHeight: 40, padding: '8px 14px',
            background: 'var(--bg)', color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xs)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font)',
          }}
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={onRerun}
          disabled={rerunDisabled}
          title={rerunDisabledReason || undefined}
          style={{
            minHeight: 40, padding: '8px 16px',
            background: rerunDisabled ? 'var(--bg3)' : 'var(--primary)',
            color: rerunDisabled ? 'var(--muted)' : '#fff',
            border: 'none', borderRadius: 'var(--radius-xs)',
            fontSize: 12, fontWeight: 700,
            cursor: rerunDisabled ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font)',
          }}
        >
          Re-run
        </button>
      </div>
    </div>
  );
}
