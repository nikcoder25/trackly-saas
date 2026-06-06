'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

/**
 * One-time announcement that the legacy "X queries / month" model has
 * been replaced by the credit system. Shown to existing paid users
 * the first time they hit the dashboard after this PR ships, and
 * dismissed permanently via localStorage so the noise stays low.
 *
 * The grandfather logic itself is server-side: the new credit caps
 * already match (or exceed) what the previous quota allowed for each
 * tier (Pro: 100 queries → 2,500 credits ≈ same brand reach, since one
 * brand run consumes queries × platforms credits). Banner is purely
 * informational - there's no choice to make.
 */
const STORAGE_KEY = 'livesov_credits_v2_seen';

export default function CreditMigrationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(true); // start hidden until we know

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      setDismissed(seen === '1');
    } catch {
      setDismissed(true);
    }
  }, []);

  if (dismissed) return null;
  if (!user) return null;
  // Free / trial users don't need this - they're seeing the credit
  // system as the default, not a migration.
  if (user.plan === 'free' || user.plan === 'trial') return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* private mode */ }
    setDismissed(true);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', marginBottom: 10,
      background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.25)',
      borderRadius: 'var(--radius-xs)', fontSize: 12, color: 'var(--text)',
    }}>
      <span style={{ fontSize: 14, color: 'var(--primary)' }}>★</span>
      <div style={{ flex: 1, lineHeight: 1.5 }}>
        <strong>We&apos;ve upgraded your plan to a credit-based system.</strong>{' '}
        You now get monthly AI checks with daily auto-tracking - your
        existing usage carries over, and your scheduled scans keep running.{' '}
        <Link href="/dashboard/billing" style={{ color: 'var(--primary)', fontWeight: 600 }}>
          Learn more →
        </Link>
      </div>
      <button onClick={dismiss} style={{
        background: 'none', border: 'none', color: 'var(--muted)',
        cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1, opacity: 0.5,
      }} aria-label="Dismiss">×</button>
    </div>
  );
}
