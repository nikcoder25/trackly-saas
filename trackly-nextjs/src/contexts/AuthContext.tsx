'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  username: string | null;
  name: string;
  plan: string;
  rawPlan?: string;
  trialEndsAt?: string | null;
  role: string | null;
  createdAt: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  hasGoogle: boolean;
  hasKeys: string[];
  settings: Record<string, unknown>;
  totpEnabled: boolean;
  limits: Record<string, unknown>;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authError: string | null;
  login: (email: string, password: string, totpCode?: string) => Promise<{ requires2FA?: boolean; error?: string }>;
  register: (email: string, password: string, name?: string, spamFields?: Record<string, unknown>) => Promise<{ error?: string }>;
  // `attribution` is only meaningful on the signup page - the login page
  // passes nothing, and the server ignores it for an existing account.
  loginWithGoogle: (accessToken: string, attribution?: Record<string, unknown>) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = {};
  try { data = await res.json(); } catch { /* non-JSON body (proxy error page) */ }
  if (!res.ok && !data.requires2FA) {
    const err = new Error((data.error as string) || 'Request failed') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

// A rate limit, a 5xx, or a dropped connection says nothing about whether
// the session is valid. Treating those as "signed out" bounced users to
// /login mid-session, so they keep whatever user state is already loaded.
function isTransientAuthFailure(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  if (status === 429 || (status !== undefined && status >= 500)) return true;
  // fetch() rejects with a TypeError on network failure (no status at all).
  return status === undefined && e instanceof TypeError;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();

  // Bounded retry for a transient failure on the very first check, so a
  // 429/5xx at mount doesn't leave the session unresolved (user null ->
  // layout redirects to /login even though the cookie is fine).
  const transientRetries = useRef(0);

  // Resolves true once the session state is settled (signed in, or
  // definitively signed out); false when a transient failure scheduled a
  // retry, so the initial-load spinner keeps showing instead of redirecting.
  const refreshUser = useCallback(async (): Promise<boolean> => {
    try {
      const data = await api('GET', '/api/auth/me');
      setUser(data.user);
      setAuthError(null);
      transientRetries.current = 0;
      return true;
    } catch {
      // Try refresh token
      try {
        await api('POST', '/api/auth/refresh');
        const data = await api('GET', '/api/auth/me');
        setUser(data.user);
        setAuthError(null);
        transientRetries.current = 0;
        return true;
      } catch (e) {
        if (isTransientAuthFailure(e)) {
          // Keep the current session state; the next revalidation (tab
          // focus, navigation) will retry once the limiter window clears.
          if (transientRetries.current < 3) {
            transientRetries.current += 1;
            const status = (e as { status?: number }).status;
            setTimeout(() => {
              void refreshUser().then((settled) => { if (settled) setLoading(false); });
            }, status === 429 ? 5000 : 2000);
            return false;
          }
          return true;
        }
        transientRetries.current = 0;
        setUser(null);
        // Only set error if this wasn't a normal "not logged in" scenario
        const msg = (e as Error).message;
        if (msg && msg !== 'Request failed' && msg !== 'No token') {
          setAuthError(msg);
        }
        return true;
      }
    }
  }, []);

  useEffect(() => {
    refreshUser().then((settled) => { if (settled) setLoading(false); });
  }, [refreshUser]);

  // Revalidate the user (and therefore their plan) whenever the tab
  // becomes visible again. Without this, /dashboard/account and
  // /dashboard/billing can render conflicting plan values when the
  // user switches between them after a webhook lands in the background
  // - exactly the 20-minute drift the subscription-sync incident
  // surfaced. Throttled to once per 5 seconds so rapid tab switching
  // doesn't hammer /api/auth/me.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let lastRefresh = 0;
    const THROTTLE_MS = 5000;
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefresh < THROTTLE_MS) return;
      lastRefresh = now;
      refreshUser();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refreshUser]);

  const login = async (email: string, password: string, totpCode?: string) => {
    try {
      const data = await api('POST', '/api/auth/login', { email, password, totpCode });
      if (data.requires2FA) return { requires2FA: true };
      setUser(data.user);
      return {};
    } catch (e) {
      return { error: (e as Error).message };
    }
  };

  const register = async (email: string, password: string, name?: string, spamFields?: Record<string, unknown>) => {
    try {
      const data = await api('POST', '/api/auth/register', { email, password, name, ...spamFields });
      setUser(data.user);
      return {};
    } catch (e) {
      return { error: (e as Error).message };
    }
  };

  const loginWithGoogle = async (accessToken: string, attribution?: Record<string, unknown>) => {
    try {
      const data = await api('POST', '/api/auth/google', { access_token: accessToken, attribution });
      setUser(data.user);
      return {};
    } catch (e) {
      return { error: (e as Error).message };
    }
  };

  const logout = async () => {
    try {
      await api('POST', '/api/auth/logout');
    } catch { /* ignore */ }
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, login, register, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
