/**
 * Pure-function core of the recommendations page's GET-with-retry
 * behaviour. Extracted so it can be unit-tested without a React renderer
 * (the project does not depend on @testing-library/react).
 *
 * STUB (commit 1): only the happy 200 path is implemented; any non-2xx
 * falls through to the generic error outcome. The retry-on-401 +
 * silent-refresh behaviour lands in the next commit, which is what the
 * tests in tests/recommendations-load-retry.test.ts pin down.
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

export async function loadRecsWithRetry(
  url: string,
  { fetch }: Deps,
): Promise<LoadRecsOutcome> {
  const res = await fetch(url, { credentials: 'include' });
  if (res.ok) {
    try {
      const data = (await res.json()) as { recommendations?: RecommendationRow[] };
      return { kind: 'ok', recommendations: data.recommendations || [] };
    } catch {
      return { kind: 'error', message: 'Server returned invalid JSON.' };
    }
  }
  return { kind: 'error', message: `Request failed (${res.status})` };
}
