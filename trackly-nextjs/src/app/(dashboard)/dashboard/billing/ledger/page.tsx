/**
 * Placeholder for the credit-ledger detail page. The Usage section's
 * "View ledger →" links here so we don't 404 in production. The real
 * ledger UI (per-call rows, filters, export) ships in a follow-up PR.
 */
import Link from 'next/link';

export const metadata = {
  title: 'Credit Ledger - Livesov',
};

export default function CreditLedgerPlaceholder() {
  return (
    <div style={{ maxWidth: 640 }}>
      <div className="view-title">Credit Ledger</div>
      <div className="view-sub">Detailed credit history.</div>
      <div
        style={{
          marginTop: 24,
          padding: 32,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>◑</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Coming soon
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
          A per-call breakdown of your AI credit usage — filterable by
          brand, platform, and date — is on the roadmap. For now, your
          aggregate totals live on the{' '}
          <Link href="/dashboard/billing" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            Billing &amp; Usage page
          </Link>.
        </div>
      </div>
    </div>
  );
}
