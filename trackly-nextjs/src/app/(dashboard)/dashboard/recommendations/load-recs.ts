/**
 * Pure-function core of the recommendations page's GET-with-retry
 * behaviour. Extracted so it can be unit-tested without a React renderer
 * (the project does not depend on @testing-library/react).
 *
 * The retry path papers over a session-cookie race that surfaces as a
 * 401 immediately after viewport resize / re-mount: the dashboard's
 * existing /api/auth/refresh endpoint can mint a fresh access token
 * from the long-lived refresh token, so a single silent refresh + one
 * retry is enough to recover without bothering the user.
 *
 * Outcome contract:
 *   - { kind: 'ok' }              -> caller renders the list
 *   - { kind: 'session-expired' } -> caller renders the Sign-in CTA
 *                                    (no Try-again, because clicking it
 *                                    would just 401 again)
 *   - { kind: 'error', message }  -> caller renders the existing
 *                                    "Couldn't load recommendations" UI
 *                                    from PR #472, with Try-again
 */

export interface RecommendationRow {
  id: string;
  title: string;
  description?: string;
  severity: string;
  status: string;
  category?: string;
  platform?: string;
  playbook_id?: string;
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
export type RefreshFn = () => Promise<boolean>;
export interface RetryLogger {
  info: (msg: string, attrs?: Record<string, unknown>) => void;
  warn: (msg: string, attrs?: Record<string, unknown>) => void;
}

export type LoadRecsOutcome =
  | { kind: 'ok'; recommendations: RecommendationRow[] }
  | { kind: 'session-expired' }
  | { kind: 'error'; message: string };

interface Deps {
  fetch: FetchFn;
  refresh: RefreshFn;
  logger?: RetryLogger;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // non-JSON body; fall through to the generic message
  }
  return `Request failed (${res.status})`;
}

async function readOk(res: Response): Promise<LoadRecsOutcome> {
  try {
    const data = (await res.json()) as { recommendations?: RecommendationRow[] };
    return { kind: 'ok', recommendations: data.recommendations || [] };
  } catch {
    return { kind: 'error', message: 'Server returned invalid JSON.' };
  }
}

export async function loadRecsWithRetry(
  url: string,
  { fetch, refresh, logger }: Deps,
): Promise<LoadRecsOutcome> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'include' });
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error && err.message ? err.message : 'Network error.',
    };
  }

  if (res.ok) return readOk(res);

  if (res.status !== 401) {
    return { kind: 'error', message: await readError(res) };
  }

  // 401 path: silently refresh once, then retry exactly once. Two 401s
  // in a row mean the refresh token itself is stale, so we surface the
  // dedicated Session-expired UI rather than the Try-again UI.
  logger?.info('recommendations: GET 401, attempting silent refresh');
  let refreshed = false;
  try {
    refreshed = await refresh();
  } catch {
    refreshed = false;
  }
  if (!refreshed) {
    logger?.warn('recommendations: silent refresh failed, surfacing session-expired');
    return { kind: 'session-expired' };
  }

  let retryRes: Response;
  try {
    retryRes = await fetch(url, { credentials: 'include' });
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error && err.message ? err.message : 'Network error.',
    };
  }

  if (retryRes.ok) return readOk(retryRes);

  if (retryRes.status === 401) {
    logger?.warn('recommendations: 401 after silent refresh, surfacing session-expired');
    return { kind: 'session-expired' };
  }

  return { kind: 'error', message: await readError(retryRes) };
}

/**
 * Default browser-side dependencies. Hits the dashboard's existing
 * /api/auth/refresh endpoint (the same one BrandContext uses) and the
 * shared structured logger so retry diagnostics flow through Sentry
 * just like the rest of the dashboard.
 */
export async function defaultRefresh(): Promise<boolean> {
  try {
    const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    return r.ok;
  } catch {
    return false;
  }
}
