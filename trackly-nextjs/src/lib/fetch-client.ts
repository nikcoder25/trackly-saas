/**
 * Shared client-side fetch helper for internal API calls.
 *
 * Centralizes JSON parsing, credential handling, and error shaping so
 * components don't repeat boilerplate or swallow errors inconsistently.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// Mirror the CSRF cookie into the X-CSRF-Token header (double-submit
// cookie pattern). The cookie is set by the server on login/refresh as a
// non-HttpOnly, SameSite=Lax cookie so first-party JS can read it here.
// Tries both the prod-prefixed and legacy names since the browser picks
// whichever the server set.
function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const names = ['__Host-livesov_csrf', 'livesov_csrf'];
  for (const name of names) {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]+)`),
    );
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

export async function api<T = unknown>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (method !== 'GET' && !headers['X-CSRF-Token'] && !headers['x-csrf-token']) {
    const csrf = readCsrfCookie();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const init: RequestInit = {
    method,
    headers,
    credentials: 'include',
    signal: options.signal,
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(path, init);

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (isRecord(data) && typeof data.error === 'string' && data.error) ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

/**
 * Type-safe extraction of a human-readable message from an unknown thrown value.
 * Prefer this over `(e as Error).message` which lies when `e` is not an Error.
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err;
  if (isRecord(err) && typeof err.message === 'string') return err.message;
  return fallback;
}

/** True if the error was thrown because a fetch was aborted. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
