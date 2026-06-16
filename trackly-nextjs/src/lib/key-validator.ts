/**
 * Lightweight validation of an LLM provider API key.
 *
 * Reuses the URLs + headers from `provider-specs.ts` (which also drives
 * the boot probes in `ai-platforms.ts`) so the validator and the boot
 * signature stay in lockstep - if the operator's env-var key passes
 * boot, the same key passed by a tenant will pass `validateProviderKey`.
 *
 * Design constraints:
 *   - One outbound request per call. No retries - a bad key shouldn't
 *     burn 3× the latency before reporting "invalid".
 *   - Hard 5s timeout (per #409 acceptance). Caller fans out across
 *     platforms in parallel.
 *   - Never logs the plaintext key. The error message returned to the UI
 *     is provider-specific ("OpenAI rejected this key: 401") but never
 *     includes the key itself or any header carrying it.
 *   - 401/403 → `status: 'invalid'`, every other failure → `status: 'error'`.
 *     The UI only blocks save on `'invalid'`; transient errors are surfaced
 *     but allow the operator to retry.
 */

import { getProviderSpec } from './provider-specs';

export type KeyValidationStatus = 'ok' | 'invalid' | 'error';

export interface KeyValidationResult {
  ok: boolean;
  status: KeyValidationStatus;
  httpStatus?: number;
  error?: string;
  latencyMs: number;
  platform: string;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.AI_KEY_VALIDATION_TIMEOUT_MS) || 5000;

function providerErrorLabel(platform: string, httpStatus: number): string {
  if (httpStatus === 401) return `${platform} rejected this key: 401 (unauthorized)`;
  if (httpStatus === 403) return `${platform} rejected this key: 403 (forbidden)`;
  if (httpStatus === 429) return `${platform} returned 429 (rate-limited) - retry shortly`;
  if (httpStatus >= 500) return `${platform} provider error: ${httpStatus}`;
  return `${platform} returned unexpected status ${httpStatus}`;
}

export async function validateProviderKey(
  platform: string,
  apiKey: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<KeyValidationResult> {
  const startedAt = Date.now();
  const spec = getProviderSpec(platform);
  if (!spec) {
    return {
      ok: false,
      status: 'invalid',
      error: `Unknown platform: ${platform}`,
      latencyMs: Date.now() - startedAt,
      platform,
    };
  }
  const trimmed = (apiKey || '').trim();
  if (!trimmed) {
    return {
      ok: false,
      status: 'invalid',
      error: 'API key is empty',
      latencyMs: Date.now() - startedAt,
      platform,
    };
  }

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // If the caller passed a signal (parallel fan-out, etc), abort our
  // controller when theirs fires so the fetch tears down cleanly.
  const onCallerAbort = () => ctrl.abort();
  options.signal?.addEventListener('abort', onCallerAbort, { once: true });

  try {
    const resp = await fetch(spec.buildUrl(trimmed), {
      method: 'GET',
      headers: spec.buildHeaders(trimmed),
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        status: 'invalid',
        httpStatus: resp.status,
        error: providerErrorLabel(platform, resp.status),
        latencyMs,
        platform,
      };
    }
    // Perplexity returns 405 for GET on the chat completions URL - that
    // still proves auth + TLS, so treat anything < 400 OR a 405-on-the
    // -intentional-405-endpoint as ok.
    const ok = resp.status < 400 || (platform === 'Perplexity' && resp.status === 405);
    if (!ok) {
      return {
        ok: false,
        status: 'error',
        httpStatus: resp.status,
        error: providerErrorLabel(platform, resp.status),
        latencyMs,
        platform,
      };
    }
    return { ok: true, status: 'ok', httpStatus: resp.status, latencyMs, platform };
  } catch (e) {
    const latencyMs = Date.now() - startedAt;
    const aborted = ctrl.signal.aborted;
    return {
      ok: false,
      status: 'error',
      error: aborted
        ? `${platform} validation timed out after ${timeoutMs}ms`
        : `${platform} validation network error: ${(e as Error).message}`,
      latencyMs,
      platform,
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * Validate keys for several platforms at once. Used by the brand setup
 * flow ("validate every enabled key before allowing save"). Each
 * provider has its own AbortController so a slow one doesn't drag
 * the others down past the per-key timeout.
 */
export async function validateProviderKeys(
  inputs: Array<{ platform: string; apiKey: string }>,
  options: { timeoutMs?: number } = {},
): Promise<KeyValidationResult[]> {
  return Promise.all(
    inputs.map(({ platform, apiKey }) =>
      validateProviderKey(platform, apiKey, { timeoutMs: options.timeoutMs }),
    ),
  );
}
