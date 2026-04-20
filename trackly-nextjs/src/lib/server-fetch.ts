/**
 * Server-side fetch helper with a mandatory timeout.
 *
 * Why: every outbound fetch from a route handler can block a serverless
 * function until the platform's wall-clock timeout kills it. On a shared
 * concurrency ceiling that stalls every subsequent request to the same
 * lambda / machine. Wrapping every provider / webhook call in an
 * AbortController gives us a hard upper bound and a predictable failure
 * mode — a timeout becomes an AbortError we can catch, not a silent hang.
 *
 * Usage:
 *   const res = await fetchWithTimeout(url, { method: 'POST', body });
 *   const res = await fetchWithTimeout(url, { ... }, 15_000);   // 15s
 *
 * Caller may pass an external `signal`; we race it with the timeout so
 * either source of cancellation wins correctly.
 */

export const DEFAULT_SERVER_FETCH_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.SERVER_FETCH_TIMEOUT_MS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 20_000;
})();

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_SERVER_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Fetch timeout after ${timeoutMs}ms`)), timeoutMs);

  // If the caller provided a signal, abort ours when theirs aborts too.
  const external = init.signal;
  const onExternalAbort = () => controller.abort(external?.reason);
  if (external) {
    if (external.aborted) { clearTimeout(timer); controller.abort(external.reason); }
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', onExternalAbort);
  }
}

export function isTimeoutError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.message.startsWith('Fetch timeout after')) return true;
  return false;
}
