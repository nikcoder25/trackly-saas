/**
 * Shared Sentry `beforeSend` scrubber used by the client, server, and edge
 * Sentry configs. Strips credentials / PII from the event before it leaves
 * the process.
 *
 * Targets:
 *   - request.headers: authorization, cookie, x-csrf-token, anything whose
 *     name matches /secret|token|api[_-]?key|session/i.
 *   - request.cookies: cleared entirely.
 *   - request.data: any field whose name matches
 *     /password|secret|token|api[_-]?key|authorization/i.
 *   - extra / contexts: same field-level scrub, applied recursively.
 *
 * The function is written to be defensive: it never throws, and if the
 * shape of the event is unexpected it returns the event unchanged. A
 * crash here would silently drop every event Sentry sees, which is worse
 * than an imperfect scrub.
 */

import type { ErrorEvent, EventHint } from '@sentry/nextjs';

type MutableRecord = Record<string, unknown>;

const FILTERED = '[Filtered]';

const SENSITIVE_HEADER_RE = /^(authorization|cookie|set-cookie|x-csrf-token|x-api-key|x-auth-token|proxy-authorization)$/i;
const SENSITIVE_HEADER_SUBSTRING_RE = /(secret|token|api[_-]?key|session|password)/i;
const SENSITIVE_BODY_FIELD_RE = /(password|secret|token|api[_-]?key|authorization|cookie|webhook[_-]?secret|refresh|access_token|id_token|jwt|session)/i;

function scrubHeaders(headers: unknown): unknown {
  if (!headers || typeof headers !== 'object') return headers;
  if (Array.isArray(headers)) {
    // Headers can come through as [name, value] tuples
    return headers.map(entry => {
      if (Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string') {
        const [name, value] = entry;
        if (SENSITIVE_HEADER_RE.test(name) || SENSITIVE_HEADER_SUBSTRING_RE.test(name)) {
          return [name, FILTERED];
        }
        return [name, value];
      }
      return entry;
    });
  }
  const out: MutableRecord = {};
  for (const [name, value] of Object.entries(headers as MutableRecord)) {
    if (SENSITIVE_HEADER_RE.test(name) || SENSITIVE_HEADER_SUBSTRING_RE.test(name)) {
      out[name] = FILTERED;
    } else {
      out[name] = value;
    }
  }
  return out;
}

function scrubBody(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[Truncated]';
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => scrubBody(v, depth + 1));
  const out: MutableRecord = {};
  for (const [key, inner] of Object.entries(value as MutableRecord)) {
    if (SENSITIVE_BODY_FIELD_RE.test(key)) {
      out[key] = FILTERED;
    } else {
      out[key] = scrubBody(inner, depth + 1);
    }
  }
  return out;
}

/**
 * Core scrubber, exported for tests. Mutates the event in place and
 * returns it. Never throws — a crash here would silently drop every event
 * Sentry sees, which is worse than an imperfect scrub.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  try {
    const asRecord = event as unknown as MutableRecord;
    const req = asRecord.request as MutableRecord | undefined;
    if (req && typeof req === 'object') {
      if (req.headers) req.headers = scrubHeaders(req.headers);
      // `cookies` is parsed separately by Sentry. Drop outright — we never
      // want raw session cookies to leave the process.
      if ('cookies' in req) req.cookies = FILTERED;
      if (req.data !== undefined) req.data = scrubBody(req.data);
      // Sentry may also expose a raw query string; strip any pair whose
      // key looks sensitive. URLs themselves are left intact since the
      // path is needed for triage.
      if (typeof req.query_string === 'string') {
        req.query_string = req.query_string
          .split('&')
          .map(pair => {
            const eq = pair.indexOf('=');
            if (eq === -1) return pair;
            const k = pair.slice(0, eq);
            if (SENSITIVE_BODY_FIELD_RE.test(decodeURIComponent(k))) {
              return `${k}=${FILTERED}`;
            }
            return pair;
          })
          .join('&');
      }
    }
    if (asRecord.extra && typeof asRecord.extra === 'object') {
      asRecord.extra = scrubBody(asRecord.extra) as MutableRecord;
    }
    if (asRecord.contexts && typeof asRecord.contexts === 'object') {
      asRecord.contexts = scrubBody(asRecord.contexts) as MutableRecord;
    }
    if (asRecord.tags && typeof asRecord.tags === 'object') {
      asRecord.tags = scrubBody(asRecord.tags) as MutableRecord;
    }
    if (asRecord.user && typeof asRecord.user === 'object') {
      // Keep only opaque user IDs; drop email / ip / username which count
      // as PII under the project's `sendDefaultPii: false` policy.
      const user = asRecord.user as MutableRecord;
      const safeUser: MutableRecord = {};
      if (user.id !== undefined) safeUser.id = user.id;
      asRecord.user = safeUser;
    }
  } catch {
    // Never break the Sentry pipeline on a scrub failure.
  }
  return event;
}

type BeforeSend = (event: ErrorEvent, hint: EventHint) => ErrorEvent | null;

/**
 * `beforeSend` wrapper. Returns `null` to drop the event if the caller's
 * composed rule (e.g. third-party noise filter) tells us to; otherwise
 * returns the scrubbed event.
 */
export function makeBeforeSend(predropFilter?: BeforeSend): BeforeSend {
  return (event, hint) => {
    if (predropFilter) {
      const maybe = predropFilter(event, hint);
      if (maybe === null) return null;
      if (maybe) event = maybe;
    }
    return scrubSentryEvent(event);
  };
}
