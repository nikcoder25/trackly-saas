'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get('verified');
  const redirect = searchParams.get('redirect') || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password, needs2FA ? totpCode : undefined);

    if (result.requires2FA) {
      setNeeds2FA(true);
      setLoading(false);
      return;
    }

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push(redirect);
  };

  return (
    <div>
      <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--primary)] mb-7 transition">
        &larr; {t.auth.backToHome}
      </Link>

      {/* Tabs */}
      <div className="flex gap-0 mb-7 bg-[var(--bg-section)] rounded-[10px] p-1">
        <div className="flex-1 py-2.5 text-center text-sm font-semibold bg-white text-[var(--text-primary)] rounded-lg shadow-[0_1px_3px_rgba(0,0,0,.08)]">
          {t.auth.login}
        </div>
        <Link href="/signup" className="flex-1 py-2.5 text-center text-sm font-semibold text-[var(--text-muted)] rounded-lg hover:text-[var(--text-primary)] transition">
          {t.auth.signup}
        </Link>
      </div>

      {verified && (
        <div className="bg-[var(--success-light)] border border-[rgba(16,185,129,.2)] text-[var(--success)] text-[13px] px-3.5 py-2.5 rounded-md mb-4">
          {t.auth.emailVerified}
        </div>
      )}

      {error && (
        <div className="bg-[var(--danger-light)] border border-[rgba(239,68,68,.2)] text-[var(--danger)] text-[13px] px-3.5 py-2.5 rounded-md mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {!needs2FA ? (
          <>
            <label htmlFor="email" className="block text-[13px] font-semibold text-[var(--text-primary)] mb-1.5">{t.auth.emailOrUsername}</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-[11px] border border-[var(--card-border)] rounded-lg text-sm text-[var(--text-primary)] bg-white placeholder-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_rgba(255,97,84,.1)] transition mb-[18px]"
              placeholder="you@example.com or username"
              required
              autoComplete="username"
            />

            <label htmlFor="password" className="block text-[13px] font-semibold text-[var(--text-primary)] mb-1.5">{t.auth.password}</label>
            <div className="relative mb-[18px]">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-[11px] pr-10 border border-[var(--card-border)] rounded-lg text-sm text-[var(--text-primary)] bg-white placeholder-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_rgba(255,97,84,.1)] transition"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 transition"
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="mb-[18px]">
            <label htmlFor="totp" className="block text-[13px] font-semibold text-[var(--text-primary)] mb-1.5">{t.auth.twoFACode}</label>
            <input
              id="totp"
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              className="w-full px-3.5 py-[11px] border border-[var(--card-border)] rounded-lg text-lg text-[var(--text-primary)] bg-white text-center tracking-[4px] placeholder-[var(--text-muted)]/60 focus:outline-none focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_rgba(255,97,84,.1)] transition"
              placeholder="Enter 6-digit code"
              maxLength={10}
              required
              autoComplete="one-time-code"
              autoFocus
            />
            <p className="text-[11px] text-[var(--text-muted)] mt-1">{t.auth.enterTotpCode}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 text-[15px] font-bold text-white bg-[var(--primary)] rounded-lg hover:bg-[var(--primary-hover)] hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(255,97,84,.25)] transition disabled:opacity-50 disabled:cursor-not-allowed mt-1"
        >
          {loading ? t.auth.signingIn : needs2FA ? t.auth.verify : t.auth.signIn}
        </button>
      </form>

      <div className="text-center mt-3">
        <Link href="/reset-password" className="text-xs text-[var(--text-muted)] hover:text-[var(--primary)] underline transition">
          {t.auth.forgotPassword}
        </Link>
      </div>

      <div className="flex items-center gap-3 my-5 text-[var(--text-muted)] text-xs">
        <span className="flex-1 h-px bg-[var(--card-border)]" />
        <span>{t.auth.or}</span>
        <span className="flex-1 h-px bg-[var(--card-border)]" />
      </div>

      <button
        type="button"
        className="w-full py-3 flex items-center justify-center gap-2.5 bg-white text-[var(--text-primary)] border border-[var(--card-border)] rounded-lg text-sm font-semibold hover:bg-[var(--bg-section)] hover:border-[var(--text-muted)] transition"
      >
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        {t.auth.continueWithGoogle}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
