'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

// Friendly destination for the /api/auth/verify-email handler. Replaces the
// old raw-JSON response. The handler redirects here with ?status=success
// (verified, or already-verified — both idempotent), expired, or error.
function VerifiedView() {
  const params = useSearchParams();
  const status = params.get('status') || 'success';
  const { user } = useAuth();
  // If we already have a session, send them straight into the app; otherwise
  // route through login (which also shows a success note).
  const continueHref = user ? '/dashboard' : '/login?verified=1';

  if (status === 'expired' || status === 'error') {
    const expired = status === 'expired';
    return (
      <div>
        <Link href="/" className="auth-back-link">&larr; Back to home</Link>
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{expired ? '⏳' : '⚠️'}</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
            {expired ? 'This link has expired' : 'Something went wrong'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
            {expired
              ? 'Your verification link is no longer valid. Sign in and we’ll send you a fresh one from the banner at the top of your dashboard.'
              : 'We couldn’t verify your email just now. Please try the link again in a moment, or sign in to resend a new verification email.'}
          </p>
          <Link href="/login" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/" className="auth-back-link">&larr; Back to home</Link>
      <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--success-light)', color: 'var(--success)', fontSize: 28,
        }}>✓</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Email verified</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
          You’re all set — your 7-day free trial is now active with 30 tracked prompts
          across all 5 AI engines. Let’s get your first brand scanned.
        </p>
        <Link href={continueHref} className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
          Continue to dashboard →
        </Link>
      </div>
    </div>
  );
}

export default function EmailVerifiedPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <VerifiedView />
    </Suspense>
  );
}
