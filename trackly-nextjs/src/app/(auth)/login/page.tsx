'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (config: Record<string, unknown>) => { requestAccessToken: () => void } } } };
  }
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get('verified');
  const rawRedirect = searchParams.get('redirect') || '/dashboard';
  const redirect = (rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')) ? rawRedirect : '/dashboard';
  const googleClientIdRef = useRef<string | null>(null);
  const gsiLoadedRef = useRef(false);

  // Load Google OAuth - prefer build-time env var, fallback to API
  useEffect(() => {
    const loadGsiScript = (onReady: () => void) => {
      const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (existing && window.google?.accounts) {
        onReady();
        return;
      }
      if (existing) {
        // Script tag exists but not yet loaded — poll for it
        let tries = 0;
        const poll = setInterval(() => {
          if (window.google?.accounts) { clearInterval(poll); onReady(); }
          if (++tries > 50) clearInterval(poll);
        }, 200);
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => onReady();
      s.onerror = () => {
        // Retry once after 2 seconds
        setTimeout(() => {
          s.remove();
          const retry = document.createElement('script');
          retry.src = 'https://accounts.google.com/gsi/client';
          retry.async = true;
          retry.onload = () => onReady();
          document.head.appendChild(retry);
        }, 2000);
      };
      document.head.appendChild(s);
    };

    const initGoogle = (clientId: string) => {
      googleClientIdRef.current = clientId;
      loadGsiScript(() => { gsiLoadedRef.current = true; setGoogleReady(true); });
    };

    const envClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (envClientId) {
      initGoogle(envClientId);
    } else {
      const fetchConfig = (attempt = 0) => {
        fetch('/api/config').then(r => r.json()).then(d => {
          if (d.googleClientId) initGoogle(d.googleClientId);
        }).catch(() => {
          if (attempt < 2) setTimeout(() => fetchConfig(attempt + 1), 1000);
        });
      };
      fetchConfig();
    }
  }, []);

  const handleGoogleSignIn = async () => {
    const clientId = googleClientIdRef.current;
    if (!clientId) {
      setError('Google Sign-In is not configured. Please use email and password.');
      return;
    }
    if (!window.google?.accounts) {
      setGoogleLoading(true);
      // Wait for script to load
      await new Promise<void>((resolve, reject) => {
        let tries = 0;
        const check = setInterval(() => {
          if (window.google?.accounts) { clearInterval(check); resolve(); }
          if (++tries > 30) { clearInterval(check); reject(new Error('timeout')); }
        }, 200);
      }).catch(() => {
        setError('Failed to load Google Sign-In. Please try again.');
        setGoogleLoading(false);
        return;
      });
      setGoogleLoading(false);
    }
    if (!window.google?.accounts) return;

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: async (tokenResponse: Record<string, string>) => {
        if (tokenResponse.error || !tokenResponse.access_token) {
          setError('Google sign-in was cancelled or failed.');
          return;
        }
        setLoading(true);
        const result = await loginWithGoogle(tokenResponse.access_token);
        if (result.error) {
          setError(result.error);
          setLoading(false);
        } else {
          router.push(redirect);
        }
      },
    });
    tokenClient.requestAccessToken();
  };

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
      <Link href="/" className="auth-back-link">&larr; {t.auth.backToHome}</Link>

      {/* Tabs */}
      <div className="auth-tabs">
        <div className="auth-tab active">{t.auth.login}</div>
        <Link href="/signup" className="auth-tab">{t.auth.signup}</Link>
      </div>

      {verified && (
        <div className="auth-err" style={{ display: 'block', background: 'var(--success-light)', borderColor: 'rgba(16,185,129,.2)', color: 'var(--success)' }}>
          {t.auth.emailVerified}
        </div>
      )}

      {error && (
        <div className="auth-err" style={{ display: 'block' }}>{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        {!needs2FA ? (
          <>
            <label htmlFor="email" className="flbl">{t.auth.emailOrUsername}</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="finp"
              placeholder="you@example.com or username"
              required
              autoComplete="username"
            />

            <label htmlFor="password" className="flbl">{t.auth.password}</label>
            <div className="pw-input-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="finp"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="pw-toggle" aria-label="Toggle password visibility">
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="totp" className="flbl">{t.auth.twoFACode}</label>
            <input
              id="totp"
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              className="finp"
              style={{ textAlign: 'center', letterSpacing: 4, fontSize: 18 }}
              placeholder="Enter 6-digit code"
              maxLength={10}
              required
              autoComplete="one-time-code"
              autoFocus
            />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{t.auth.enterTotpCode}</p>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary" style={loading ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
          {loading ? t.auth.signingIn : needs2FA ? t.auth.verify : t.auth.signIn}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <Link href="/reset-password" style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'underline' }}>
          {t.auth.forgotPassword}
        </Link>
      </div>

      <div className="auth-divider">{t.auth.or}</div>

      <button type="button" onClick={handleGoogleSignIn} disabled={!googleReady || googleLoading} className="google-signin-btn" style={(!googleReady || googleLoading) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        {!googleReady ? 'Loading Google Sign-In...' : googleLoading ? 'Connecting...' : t.auth.continueWithGoogle}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
