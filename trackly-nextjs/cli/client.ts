/**
 * HTTP client for the Livesov admin-backend API.
 *
 * Auth model (see src/middleware.ts + src/lib/auth.ts in the app):
 *   - We authenticate with `Authorization: Bearer <access token>`. Bearer
 *     callers are deliberately exempt from the double-submit CSRF check.
 *   - The app still enforces a same-origin check on state-changing methods
 *     in production. A CLI sends no browser Origin, so we set `Origin` to the
 *     API base URL - the request's own origin is always in the allow-set.
 *   - Access tokens live 15 minutes. We keep the rotating refresh cookie and
 *     transparently mint a new access token on the first 401, retrying once.
 */
import {
  loadConfig,
  saveConfig,
  type CliConfig,
  type RefreshCookie,
  type StoredUser,
} from './config';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Raised by login() when the account has 2FA and no code was supplied. */
export class TwoFactorRequiredError extends Error {
  constructor() {
    super('This account requires a 2FA code. Re-run with --totp <code>.');
    this.name = 'TwoFactorRequiredError';
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  auth?: boolean; // default true
}

/**
 * Pull the session refresh cookie out of a Set-Cookie list. The app prefixes
 * cookies with `__Host-` in production and uses bare names in dev, so we match
 * either. Exported for unit testing.
 */
export function extractRefreshCookie(setCookies: string[]): RefreshCookie | null {
  for (const raw of setCookies) {
    const pair = raw.split(';', 1)[0]?.trim() ?? '';
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (name === 'livesov_refresh' || name === '__Host-livesov_refresh') {
      return { name, value };
    }
  }
  return null;
}

export class ApiClient {
  private config: CliConfig;

  constructor(config?: CliConfig) {
    this.config = config || loadConfig();
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  get user(): StoredUser | undefined {
    return this.config.user;
  }

  get isAuthenticated(): boolean {
    return Boolean(this.config.token);
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = new URL(path, this.config.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private originHeader(): string {
    return new URL(this.config.baseUrl).origin;
  }

  /** Low-level fetch with JSON handling, Origin injection, and 401 refresh. */
  async request<T = unknown>(
    method: string,
    path: string,
    opts: RequestOptions = {},
    _retried = false,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.auth !== false && this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    }
    if (UNSAFE_METHODS.has(method)) headers['Origin'] = this.originHeader();

    const res = await fetch(this.buildUrl(path, opts.query), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: 'manual',
    });

    // Transparent refresh: an expired access token surfaces as 401. If we hold
    // a refresh cookie, rotate once and replay the original request.
    if (res.status === 401 && opts.auth !== false && !_retried && this.config.refresh) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.request<T>(method, path, opts, true);
    }

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const message =
        (parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : undefined) || `Request failed with status ${res.status}`;
      throw new ApiError(res.status, message, parsed);
    }

    return parsed as T;
  }

  get<T = unknown>(path: string, query?: RequestOptions['query']): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  /** Exchange email/password (+ optional TOTP) for an access token + refresh cookie. */
  async login(email: string, password: string, totpCode?: string): Promise<StoredUser> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: this.originHeader(),
    };
    const res = await fetch(this.buildUrl('/api/auth/login'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, totpCode }),
      redirect: 'manual',
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    // 202 = credentials were correct but a 2FA code is still required.
    if (res.status === 202 && body.requires2FA) throw new TwoFactorRequiredError();
    if (!res.ok) {
      throw new ApiError(res.status, String(body.error || `Login failed (${res.status})`), body);
    }

    const token = body.token as string | undefined;
    if (!token) throw new ApiError(res.status, 'Login succeeded but no token was returned');

    const refresh = extractRefreshCookie(res.headers.getSetCookie?.() || []);
    const rawUser = (body.user || {}) as Record<string, unknown>;
    const user: StoredUser = {
      id: String(rawUser.id ?? ''),
      email: String(rawUser.email ?? email),
      role: rawUser.role ? String(rawUser.role) : undefined,
      plan: rawUser.plan ? String(rawUser.plan) : undefined,
    };

    this.config = { ...this.config, token, refresh: refresh || this.config.refresh, user };
    saveConfig(this.config);
    return user;
  }

  /** Rotate the refresh cookie into a fresh access token. Returns success. */
  private async tryRefresh(): Promise<boolean> {
    if (!this.config.refresh) return false;
    try {
      const res = await fetch(this.buildUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Origin: this.originHeader(),
          Cookie: `${this.config.refresh.name}=${this.config.refresh.value}`,
        },
        redirect: 'manual',
      });
      if (!res.ok) return false;
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const token = body.token as string | undefined;
      if (!token) return false;
      const rotated = extractRefreshCookie(res.headers.getSetCookie?.() || []);
      this.config = { ...this.config, token, refresh: rotated || this.config.refresh };
      saveConfig(this.config);
      return true;
    } catch {
      return false;
    }
  }

  logout(): void {
    this.config = { baseUrl: this.config.baseUrl };
    saveConfig(this.config);
  }
}
