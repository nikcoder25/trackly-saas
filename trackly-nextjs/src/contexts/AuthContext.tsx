'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  username: string | null;
  name: string;
  plan: string;
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
  login: (email: string, password: string, totpCode?: string) => Promise<{ requires2FA?: boolean; error?: string }>;
  register: (email: string, password: string, name?: string) => Promise<{ error?: string }>;
  loginWithGoogle: (accessToken: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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
  const data = await res.json();
  if (!res.ok && !data.requires2FA) throw new Error(data.error || 'Request failed');
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    try {
      const data = await api('GET', '/api/auth/me');
      setUser(data.user);
    } catch {
      // Try refresh token
      try {
        await api('POST', '/api/auth/refresh');
        const data = await api('GET', '/api/auth/me');
        setUser(data.user);
      } catch {
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
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

  const register = async (email: string, password: string, name?: string) => {
    try {
      const data = await api('POST', '/api/auth/register', { email, password, name });
      setUser(data.user);
      return {};
    } catch (e) {
      return { error: (e as Error).message };
    }
  };

  const loginWithGoogle = async (accessToken: string) => {
    try {
      const data = await api('POST', '/api/auth/google', { access_token: accessToken });
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
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
