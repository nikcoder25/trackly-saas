'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) { setMessage('If an account exists with that email, a reset link has been sent.'); return; }
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website: honeypot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message);
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  };

  return (
    <div>
      <Link href="/" className="auth-back-link">&larr; Back to home</Link>

      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
        {token ? 'Set New Password' : 'Reset Password'}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
        {token ? 'Enter your new password below.' : "Enter your email and we'll send you a reset link."}
      </p>

      {error && (
        <div className="auth-err" style={{ display: 'block' }}>{error}</div>
      )}
      {message && (
        <div className="auth-err" style={{ display: 'block', background: 'var(--success-light)', borderColor: 'rgba(16,185,129,.2)', color: 'var(--success)' }}>{message}</div>
      )}

      {token ? (
        <form onSubmit={handleReset}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
            <label htmlFor="reset-website">Website</label>
            <input id="reset-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <label htmlFor="newPassword" className="flbl">New Password</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="finp"
            placeholder="Min 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <button type="submit" disabled={loading} className="btn-primary" style={loading ? { opacity: 0.5 } : undefined}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleForgot}>
          <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
            <label htmlFor="forgot-website">Website</label>
            <input id="forgot-website" type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>
          <label htmlFor="email" className="flbl">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="finp"
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
          <button type="submit" disabled={loading} className="btn-primary" style={loading ? { opacity: 0.5 } : undefined}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      )}

      <div style={{ marginTop: 20, textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
        <Link href="/login" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Back to login</Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
