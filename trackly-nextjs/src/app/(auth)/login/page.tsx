'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
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
      <div className="text-center mb-8">
        <Link href="/" className="text-2xl font-bold text-white">Livesov</Link>
        <h1 className="text-xl font-semibold text-white mt-4">Welcome back</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Sign in to your account</p>
      </div>

      {verified && (
        <div className="bg-green-900/20 border border-green-800 text-green-400 text-sm px-4 py-3 rounded-lg mb-4">
          Email verified successfully! You can now log in.
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {!needs2FA ? (
          <>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">Email or Username</label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition"
                placeholder="you@example.com"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition pr-12"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-white text-sm"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="totp" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">2FA Code</label>
            <input
              id="totp"
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              className="w-full bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-white text-center text-lg tracking-widest placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition"
              placeholder="000000"
              maxLength={8}
              required
              autoComplete="one-time-code"
              autoFocus
            />
            <p className="text-xs text-[var(--text-muted)] mt-2">Enter the code from your authenticator app, or a backup code.</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white py-2.5 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : needs2FA ? 'Verify' : 'Sign In'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <Link href="/reset-password" className="text-sm text-[var(--primary)] hover:underline">
          Forgot password?
        </Link>
      </div>

      <div className="mt-6 text-center text-sm text-[var(--text-muted)]">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-[var(--primary)] hover:underline">Sign up</Link>
      </div>
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
