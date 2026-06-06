'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BILLING_PORTAL_URL } from '@/lib/constants';

const SURFACE = '#ffffff';
const SURFACE_BORDER = '#ececec';
const SURFACE_RADIUS = 14;
const TEXT_PRIMARY = '#161614';
const TEXT_SECONDARY = '#6b6b6b';
const TEXT_MUTED = '#9a9a9a';
const HAIRLINE = '#f1f1ef';
const PILL_OK_BG = '#e0eed7';
const PILL_OK_FG = '#264a2a';
const PILL_NEU_BG = '#eeeeec';
const PILL_NEU_FG = '#3a3a3a';

export interface ActivityEntry {
  date: string;
  /** Human readable event copy, e.g. "Payment received · Agency monthly". */
  event: string;
  /** Currency-formatted amount string, or empty for non-financial events. */
  amount: string;
  /** Status label such as "Paid", "Processed". */
  status: string;
}

interface RecentActivityCardProps {
  entries: ActivityEntry[];
}

const FILTERS: { key: string; label: string; match: (e: ActivityEntry) => boolean }[] = [
  { key: 'all', label: 'All events', match: () => true },
  {
    key: 'payments',
    label: 'Payments',
    match: (e) => /payment|paid|invoice/i.test(e.event),
  },
  {
    key: 'plan',
    label: 'Plan changes',
    match: (e) => /plan|upgrade|downgrade|cancel/i.test(e.event),
  },
];

function fmtFullDate(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RecentActivityCard({ entries }: RecentActivityCardProps) {
  const [filter, setFilter] = useState<string>('all');
  const filtered = useMemo(() => {
    const def = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
    return entries.filter(def.match).slice(0, 6);
  }, [entries, filter]);

  const hasEntries = entries.length > 0;

  return (
    <div
      style={{
        background: SURFACE,
        border: `1px solid ${SURFACE_BORDER}`,
        borderRadius: SURFACE_RADIUS,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY }}>
          Recent activity
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <FilterDropdown value={filter} onChange={setFilter} />
          <Link
            href={BILLING_PORTAL_URL}
            target="_blank"
            rel="noopener"
            style={{ fontSize: 12, color: '#4f46e5', textDecoration: 'none', fontWeight: 600 }}
          >
            View all →
          </Link>
        </div>
      </div>

      {hasEntries ? (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              minWidth: 520,
            }}
          >
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Event</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr
                  key={`${row.date}-${i}`}
                  style={{
                    borderTop: `1px solid ${HAIRLINE}`,
                  }}
                >
                  <Td>
                    <span style={{ color: TEXT_PRIMARY, fontWeight: 500 }}>
                      {fmtFullDate(row.date)}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: TEXT_SECONDARY }}>{row.event || '-'}</span>
                  </Td>
                  <Td align="right">
                    <span
                      style={{
                        fontVariantNumeric: 'tabular-nums',
                        color: TEXT_PRIMARY,
                        fontWeight: 500,
                      }}
                    >
                      {row.amount || '-'}
                    </span>
                  </Td>
                  <Td align="right">
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <StatusPill status={row.status} />
                      <Link
                        href={BILLING_PORTAL_URL}
                        target="_blank"
                        rel="noopener"
                        aria-label="View receipt in billing portal"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          color: TEXT_MUTED,
                          textDecoration: 'none',
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                          <path d="M5 21h14" />
                        </svg>
                      </Link>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{
            fontSize: 13,
            color: TEXT_MUTED,
            padding: '24px 0',
            textAlign: 'center',
          }}
        >
          No recent activity.
        </div>
      )}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <th
      style={{
        textAlign: align ?? 'left',
        fontSize: 11,
        fontWeight: 600,
        color: TEXT_MUTED,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        padding: '0 0 8px',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
  return (
    <td style={{ textAlign: align ?? 'left', padding: '12px 0', verticalAlign: 'middle' }}>
      {children}
    </td>
  );
}

function StatusPill({ status }: { status: string }) {
  const isPaid = /paid|succeeded|processed|completed/i.test(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: isPaid ? PILL_OK_BG : PILL_NEU_BG,
        color: isPaid ? PILL_OK_FG : PILL_NEU_FG,
        textTransform: 'capitalize',
      }}
    >
      {status || 'Processed'}
    </span>
  );
}

function FilterDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      <span className="sr-only">Filter recent activity</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          background: SURFACE,
          border: `1px solid ${SURFACE_BORDER}`,
          borderRadius: 10,
          padding: '6px 30px 6px 12px',
          fontSize: 12,
          fontWeight: 600,
          color: TEXT_PRIMARY,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {FILTERS.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 10,
          pointerEvents: 'none',
          color: TEXT_SECONDARY,
        }}
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </label>
  );
}
