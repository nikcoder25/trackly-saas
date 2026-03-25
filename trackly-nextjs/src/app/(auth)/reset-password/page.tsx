'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
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
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--primary)] mb-7 transition">
        &larr; {t.auth.backToHome}
      </Link>

      <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">
        {token ? t.auth.setNewPassword : t.auth.resetPassword}
      </h1>
      <p className="text-[13px] text-[var(--text-muted)] mb-6 leading-relaxed">
        {token ? t.auth.enterNewPassword : t.auth.enterResetEmail}
      </p>

      {error && (
        <div className="bg-[var(--danger-light)] border border-[rgba(239,68,68,.2)] text-[var(--danger)] text-[13px] px-3.5 py-2.5 rounded-md mb-4">{error}</div>
      )}
      {message && (
        <div className="bg-[var(--success-light)] border border-[rgba(16,185,129,.2)] text-[var(--success)] text-[13px] px-3.5 py-2.5 rounded-md mb-4">{message}</div>
      )}

      {token ? (
        <form onSubmit={handleReset}>
          <label htmlFor="newPassword" className="block text-[13px] font-semibold text-[var(--text-primary)] mb-1.5">{t.auth.newPassword}</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3.5 py-[11px] border border-[var(--card-border)] rounded-lg text-sm text-[var(--text-primary)] bg-white placeholder-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_rgba(255,97,84,.1)] transition mb-[18px]"
            placeholder="Min 8 characters"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <button type="submit" disabled={loading}
            className="w-full py-3 text-[15px] font-bold text-white bg-[var(--primary)] rounded-lg hover:bg-[var(--primary-hover)] hover:-translate-y-px transition disabled:opacity-50">
            {loading ? t.auth.resetting : t.auth.resetPassword}
          </button>
        </form>
      ) : (
        <form onSubmit={handleForgot}>
          <label htmlFor="email" className="block text-[13px] font-semibold text-[var(--text-primary)] mb-1.5">{t.auth.email}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-[11px] border border-[var(--card-border)] rounded-lg text-sm text-[var(--text-primary)] bg-white placeholder-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_rgba(255,97,84,.1)] transition mb-[18px]"
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
          <button type="submit" disabled={loading}
            className="w-full py-3 text-[15px] font-bold text-white bg-[var(--primary)] rounded-lg hover:bg-[var(--primary-hover)] hover:-translate-y-px transition disabled:opacity-50">
            {loading ? t.auth.sending : t.auth.sendResetLink}
          </button>
        </form>
      )}

      <div className="mt-5 text-center text-sm text-[var(--text-muted)]">
        <Link href="/login" className="text-[var(--primary)] hover:underline">{t.auth.backToLogin}</Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
