'use client';

/**
 * Filter pill row for the Regional Audits list:
 *   Region: <All | …>   Last <7|30|90> days / All time   Status: <All|…>
 * + search box on the right.
 *
 * The Region/Status pills open a native <select>-style dropdown on
 * click. (The Schedule pill placeholder was removed in the cleanup
 * PR — bring it back when scheduled audits actually ship.)
 *
 * NO mock data — region options are fed in by the parent from the
 * actually-loaded audits list, so users only see regions they have
 * data for.
 */

export type DateWindow = '7d' | '30d' | '90d' | 'all';
export type StatusFilter =
  | 'all'
  | 'queued'
  | 'running'
  | 'done'
  | 'partial'
  | 'failed'
  | 'cancelled';

interface Props {
  regionOptions: string[];
  region: string;             // '' = all regions
  onRegionChange: (next: string) => void;
  dateWindow: DateWindow;
  onDateWindowChange: (next: DateWindow) => void;
  status: StatusFilter;
  onStatusChange: (next: StatusFilter) => void;
  search: string;
  onSearchChange: (next: string) => void;
}

const DATE_LABEL: Record<DateWindow, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  'all': 'All time',
};

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'All',
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  partial: 'Partial',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export default function AuditFilterPills(props: Props) {
  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        marginBottom: 14,
      }}
    >
      <DropdownPill
        label="Region"
        value={props.region}
        valueLabel={props.region || 'All'}
        options={[{ value: '', label: 'All regions' }, ...props.regionOptions.map((r) => ({ value: r, label: r }))]}
        onChange={props.onRegionChange}
      />

      <CyclePill
        label={DATE_LABEL[props.dateWindow]}
        onClick={() => {
          const order: DateWindow[] = ['7d', '30d', '90d', 'all'];
          const i = order.indexOf(props.dateWindow);
          props.onDateWindowChange(order[(i + 1) % order.length]);
        }}
        title="Click to cycle: 7 → 30 → 90 → all time"
      />

      <DropdownPill
        label="Status"
        value={props.status}
        valueLabel={STATUS_LABEL[props.status]}
        options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        onChange={(next) => props.onStatusChange(next as StatusFilter)}
      />

      <div style={{ flex: 1, minWidth: 180 }} />

      <input
        type="search"
        value={props.search}
        onChange={(e) => props.onSearchChange(e.target.value)}
        placeholder="Search prompt or response"
        aria-label="Search prompt or response"
        style={{
          minWidth: 200, padding: '7px 12px',
          fontSize: 13, fontFamily: 'var(--font)',
          background: 'var(--bg)', color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xs)',
          outline: 'none',
        }}
      />
    </div>
  );
}

/** Pill that opens a native select for granular options. */
function DropdownPill({
  label, value, valueLabel, options, onChange,
}: {
  label: string;
  value: string;
  valueLabel: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
}) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 10px 6px 12px',
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-full)',
        fontSize: 12, fontWeight: 600, color: 'var(--text)',
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{label}:</span>
      <span style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums' }}>{valueLabel}</span>
      <svg
        width={10} height={10} viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth={2.4}
        aria-hidden="true" style={{ color: 'var(--muted)' }}
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          position: 'absolute', inset: 0, opacity: 0,
          cursor: 'pointer', fontSize: 12,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/** Pill that cycles through values on click (for the date window). */
function CyclePill({
  label, onClick, title,
}: { label: string; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        padding: '6px 12px',
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-full)',
        fontSize: 12, fontWeight: 600, color: 'var(--text)',
        cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font)',
      }}
    >
      {label}
    </button>
  );
}

