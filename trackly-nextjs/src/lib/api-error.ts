import { logger } from './logger';

/**
 * Shared API error helpers.
 *
 * Goals:
 *   - Every 4xx/5xx from /api/* returns a consistent `{ error, code? }` shape.
 *   - 5xx responses NEVER echo raw exception messages, stack traces, DB text,
 *     or internal identifiers. The caller sees a static, safe message; the
 *     full error is logged server-side via `logError`.
 *   - 4xx semantic messages are passed through unchanged (they are safe and
 *     the frontend depends on them).
 *
 * Contract:
 *   - `badRequest/unauthorized/forbidden/notFound` return the supplied
 *     message verbatim so existing frontend copy keeps working.
 *   - `serverError` ignores any caller-supplied message and always returns
 *     `"Internal server error"` to the client. Pass the real error to
 *     `logError` for Sentry / App Platform logs.
 *   - `code` is optional and stable; use it to keep machine-readable error
 *     IDs (e.g. `"plan.limit_reached"`) without leaking implementation
 *     details.
 */

export type ApiErrorBody = {
  error: string;
  code?: string;
  // Some existing 4xx responses carry extra fields (e.g. `requiresConfirm`,
  // `retryAfter`). Preserve that capability without changing the shape.
  [key: string]: unknown;
};

type ErrorOptions = {
  code?: string;
  extra?: Record<string, unknown>;
};

function jsonError(status: number, message: string, opts?: ErrorOptions): Response {
  const body: ApiErrorBody = { error: message };
  if (opts?.code) body.code = opts.code;
  if (opts?.extra) {
    for (const [k, v] of Object.entries(opts.extra)) {
      if (k !== 'error' && k !== 'code') body[k] = v;
    }
  }
  return Response.json(body, { status });
}

export function badRequest(message = 'Bad request', opts?: ErrorOptions): Response {
  return jsonError(400, message, opts);
}

export function unauthorized(message = 'Unauthorized', opts?: ErrorOptions): Response {
  return jsonError(401, message, opts);
}

export function forbidden(message = 'Forbidden', opts?: ErrorOptions): Response {
  return jsonError(403, message, opts);
}

export function notFound(message = 'Not found', opts?: ErrorOptions): Response {
  return jsonError(404, message, opts);
}

/**
 * 5xx response. Defaults to the static string `"Internal server error"` so
 * unexpected/thrown errors can never echo a raw exception message. Handlers
 * with an existing safe, user-facing 500 string (e.g. `"Failed to delete
 * alert"`) can pass `message` to preserve the frontend copy. `message` must
 * always be a hard-coded, non-sensitive string — never pass a value derived
 * from an exception, DB result, or external input.
 */
export function serverError(opts?: { message?: string; code?: string }): Response {
  const body: ApiErrorBody = { error: opts?.message ?? 'Internal server error' };
  if (opts?.code) body.code = opts.code;
  return Response.json(body, { status: 500 });
}

/**
 * Fields we never want to see attached to a log event, even if the caller
 * accidentally forwards a request body or header map into `context`. The
 * Sentry beforeSend scrubber is the canonical line of defense, but this
 * keeps stdout / App Platform logs clean too.
 */
const SENSITIVE_KEY_RE = /^(authorization|cookie|set-cookie|x-csrf-token|password|password_hash|passwd|pwd|token|refresh_token|access_token|id_token|secret|api[_-]?key|webhook[_-]?secret|session|jwt)$/i;
const SENSITIVE_VALUE_KEY_RE = /(password|secret|token|api[_-]?key|cookie|authorization)/i;

function scrubValue(key: string, value: unknown, depth: number): unknown {
  if (SENSITIVE_KEY_RE.test(key) || SENSITIVE_VALUE_KEY_RE.test(key)) {
    return '[Filtered]';
  }
  return scrubUnknown(value, depth + 1);
}

function scrubUnknown(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[Truncated]';
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => scrubUnknown(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = scrubValue(k, v, depth);
  }
  return out;
}

export function scrubLogContext(context: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!context) return {};
  return scrubUnknown(context, 0) as Record<string, unknown>;
}

/**
 * Log an error server-side with scrubbed context. The structured `event`
 * name is what surfaces in Sentry Logs / App Platform tails; the context
 * is trimmed of obvious secrets before emission.
 *
 * Callers should still pair this with `serverError()` for the response —
 * this function intentionally does not return a `Response` so the log
 * path is visible at the call site.
 */
export function logError(
  event: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const base: Record<string, unknown> = {
    error: err instanceof Error ? err.message : String(err),
  };
  if (err instanceof Error && err.name && err.name !== 'Error') {
    base.error_name = err.name;
  }
  const merged = { ...base, ...scrubLogContext(context) };
  logger.error(event, merged);
}
