'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient: (config: Record<string, unknown>) => { requestAccessToken: () => void } } } };
  }
}

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  // Anti-spam: honeypot + timing
  const [honeypot, setHoneypot] = useState('');
  const [formLoadedAt] = useState(() => Date.now());
  const { register, loginWithGoogle } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
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
        // Script tag exists but not yet loaded - poll for it
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
          router.push('/dashboard');
        }
      },
    });
    tokenClient.requestAccessToken();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await register(email, password, name || undefined, {
      website: honeypot, // honeypot - should be empty
      _formLoadedAt: formLoadedAt, // timing check
    });
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
  };

  return (
    <div>
      <Link href="/" className="auth-back-link">&larr; {t.auth.backToHome}</Link>

      {/* Tabs */}
      <div className="auth-tabs">
        <Link href="/login" className="auth-tab">{t.auth.login}</Link>
        <div className="auth-tab active">{t.auth.signup}</div>
      </div>

      {error && (
        <div className="auth-err" style={{ display: 'block' }}>{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Honeypot - invisible to real users, bots auto-fill it */}
        <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" type="text" value={honeypot} onChange={e => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
        </div>

        <label htmlFor="name" className="flbl">{t.auth.name}</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="finp"
          placeholder="John Doe"
          required
          autoComplete="name"
        />

        <label htmlFor="email" className="flbl">{t.auth.email}</label>
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

        <label htmlFor="password" className="flbl">{t.auth.password}</label>
        <div className="pw-input-wrap">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="finp"
            placeholder="Min 8 chars, upper, lower, number, special"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="pw-toggle" aria-label="Toggle password visibility">
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            )}
          </button>
        </div>

        <button type="submit" disabled={loading} className="btn-primary" style={loading ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
          {loading ? t.auth.creatingAccount : t.auth.createAccount}
        </button>
      </form>

      <div className="auth-divider">{t.auth.or}</div>

      <button type="button" onClick={handleGoogleSignIn} disabled={!googleReady || googleLoading} className="google-signin-btn" style={(!googleReady || googleLoading) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        {!googleReady ? 'Loading Google Sign-In...' : googleLoading ? 'Connecting...' : t.auth.continueWithGoogle}
      </button>

      <p className="mt-4 text-center text-xs text-[var(--text-muted)]" style={{ lineHeight: 1.6 }}>
        By signing up you agree to our{' '}
        <Link href="/terms" className="text-[var(--primary)] hover:underline">Terms of Service</Link>{' '}and{' '}
        <Link href="/privacy" className="text-[var(--primary)] hover:underline">Privacy Policy</Link>.
      </p>

      <div className="mt-5 text-center text-sm text-[var(--text-muted)]">
        {t.auth.hasAccount}{' '}
        <Link href="/login" className="text-[var(--primary)] hover:underline">{t.auth.signIn}</Link>
      </div>
    </div>
  );
}
