'use client';

import Link from 'next/link';
import { useCredits } from '@/contexts/CreditsContext';

/**
 * Persistent banner shown at the top of every dashboard page when the
 * user is below 20% of their monthly credit allowance, or completely
 * out of credits. Two visual states:
 *   - Low (orange): "X credits remaining — upgrade to keep auto runs going"
 *   - Empty (red): "Out of credits — auto runs paused until <reset>"
 */
export default function LowBalanceBanner() {
  const { status } = useCredits();
  if (!status) return null;
  // Hide on plans that effectively have no cap (owner/enterprise).
  if (status.monthlyCap >= 99999) return null;
  if (!status.lowBalance && status.remaining > 0) return null;

  const empty = status.remaining <= 0;
  const accent = empty ? '#ef4444' : '#f59e0b';
  const bg = empty ? 'rgba(239,68,68,.06)' : 'rgba(245,158,11,.06)';
  const borderColor = empty ? 'rgba(239,68,68,.25)' : 'rgba(245,158,11,.25)';

  const resetDate = new Date(status.nextResetAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
  const pct = status.monthlyCap > 0
    ? Math.round((status.remaining / status.monthlyCap) * 100)
    : 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
      marginBottom: 10, background: bg, border: `1px solid ${borderColor}`,
      borderRadius: 'var(--radius-xs)', fontSize: 12, color: 'var(--text)',
    }}>
      <span style={{ fontSize: 14, color: accent }}>{empty ? '◯' : '⚠'}</span>
      <div style={{ flex: 1 }}>
        <strong style={{ color: accent }}>
          {empty ? 'Out of AI credits' : 'AI credits running low'}
        </strong>
        <span style={{ margin: '0 6px', opacity: 0.5 }}>—</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
          {status.remaining.toLocaleString()} / {status.monthlyCap.toLocaleString()}
          {!empty && <> ({pct}%)</>}
          <span style={{ margin: '0 4px', opacity: 0.5 }}>·</span>
          resets {resetDate}
        </span>
      </div>
      <Link href="/dashboard/billing" style={{
        fontSize: 11, fontWeight: 700, color: accent, textDecoration: 'none',
      }}>
        {empty ? 'Upgrade Plan →' : 'Upgrade →'}
      </Link>
    </div>
  );
}
