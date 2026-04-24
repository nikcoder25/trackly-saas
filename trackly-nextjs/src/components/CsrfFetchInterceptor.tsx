'use client';

import { useEffect } from 'react';

/**
 * One-time client-side `fetch` interceptor that mirrors the CSRF cookie into
 * the `X-CSRF-Token` header on same-origin state-changing requests. Keeps
 * components that call `fetch()` directly (legacy callers that predate
 * `@/lib/fetch-client`) compliant with the CSRF middleware without having to
 * touch every call site.
 *
 * The lib/fetch-client helper sets the header itself, so this interceptor
 * is a backstop — it only adds the header when none is present.
 */

const CSRF_COOKIE_NAMES = ['__Host-livesov_csrf', 'livesov_csrf'];
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  for (const name of CSRF_COOKIE_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

function isSameOriginRequest(input: RequestInfo | URL): boolean {
  try {
    const url =
      typeof input === 'string' ? new URL(input, window.location.href)
      : input instanceof URL ? input
      : new URL(input.url, window.location.href);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

let installed = false;

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!UNSAFE_METHODS.has(method) || !isSameOriginRequest(input)) {
      return originalFetch(input, init);
    }
    const token = readCsrfCookie();
    if (!token) return originalFetch(input, init);

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has('X-CSRF-Token') && !headers.has('x-csrf-token')) {
      headers.set('X-CSRF-Token', token);
    }
    return originalFetch(input, { ...init, headers });
  };
}

export default function CsrfFetchInterceptor(): null {
  useEffect(() => { install(); }, []);
  return null;
}
