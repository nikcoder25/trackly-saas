import * as Sentry from '@sentry/nextjs';

/**
 * Structured logger that dual-writes to `console.*` and Sentry Logs,
 * with an optional pino-style JSON output mode for log shippers.
 *
 * Why:
 *   DigitalOcean App Platform has no native log drain into Sentry, so we
 *   forward server-side log events through the Sentry SDK's Logs API
 *   (https://docs.sentry.io/product/explore/logs/). The App Platform
 *   runtime buffer is kept for local tailing; Sentry is the searchable
 *   historical store.
 *
 * Contract:
 *   logger.debug/info/warn/error(message, attrs?)
 *   - `message` is a human-readable string used as the Sentry log body.
 *   - `attrs` are attached as structured attributes (plus serialized next
 *     to the console line for local readability).
 *   - Errors thrown by the forward path are swallowed - log emission must
 *     never break the caller.
 *
 *   logger.child({ tenantId, brandId, platform, requestId, runId })
 *   - Returns a logger that automatically merges the supplied bindings
 *     into every emitted record. Used by request handlers to thread the
 *     request-id and tenant context through downstream calls without
 *     having to plumb it as a function parameter.
 *
 * Output formats:
 *   - Default ("pretty"): preserves the legacy `message {attrs}` console
 *     style so App Platform tail / grok.boot greps keep working during
 *     rollout.
 *   - `LOG_FORMAT=json`: emits a single JSON object per line with
 *     `{ ts, level, msg, ...bindings, ...attrs }`. Required by the
 *     issue #412 spec for downstream log shippers (Vector / Grafana
 *     Loki); the JSON keys mirror pino so existing dashboards work.
 *
 * Feature flag:
 *   `SENTRY_LOGS_ENABLED=false` disables forwarding to Sentry without a
 *   redeploy. Console output is never affected so App Platform logs stay
 *   complete during a rollback.
 *
 * Edge safety:
 *   Only uses `@sentry/nextjs` (which has edge-runtime entrypoints) and
 *   `process.env` / `console.*`. No Node-only APIs, so this module can be
 *   imported from edge routes.
 */

export type LogAttrs = Record<string, unknown>;
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Bindings auto-merged into every record emitted by a child logger.
 * Field names match the issue #412 spec. All optional - callers pick
 * whichever IDs are in scope at construction time.
 */
export interface LoggerBindings {
  tenantId?: string;
  brandId?: string;
  platform?: string;
  requestId?: string;
  runId?: string;
  [key: string]: unknown;
}

function sentryLogsEnabled(): boolean {
  // Read per-call so flipping the env flag takes effect without a bounce.
  // Defaults to enabled so Sentry Logs is on wherever the SDK is configured.
  return process.env.SENTRY_LOGS_ENABLED !== 'false';
}

function jsonFormat(): boolean {
  // Read per-call so tests can flip it. JSON mode is opt-in so the
  // legacy pretty output stays the default during rollout.
  return process.env.LOG_FORMAT === 'json';
}

function consoleFnFor(level: LogLevel): (...args: unknown[]) => void {
  switch (level) {
    case 'debug':
      // console.debug is near-silent in most runtimes; map to console.log so
      // dev tailing doesn't lose it during rollout.
      return console.log;
    case 'info':
      return console.log;
    case 'warn':
      return console.warn;
    case 'error':
      return console.error;
  }
}

type SentryLoggerLike = Record<
  LogLevel,
  (message: string, attrs?: LogAttrs) => void
>;

function getSentryLogger(): SentryLoggerLike | null {
  // Accessed through a cast so we survive older @sentry/nextjs builds where
  // the logger namespace wasn't yet exported - in that case we short-circuit
  // to console-only instead of throwing.
  const maybe = (Sentry as unknown as { logger?: SentryLoggerLike }).logger;
  if (!maybe) return null;
  if (typeof maybe.info !== 'function') return null;
  return maybe;
}

function forwardToSentry(level: LogLevel, message: string, attrs?: LogAttrs): void {
  if (!sentryLogsEnabled()) return;
  const sentryLogger = getSentryLogger();
  if (!sentryLogger) return;
  try {
    sentryLogger[level](message, attrs);
  } catch {
    // best-effort: log forwarding must never break the caller
  }
}

function safeStringify(value: unknown): string {
  // JSON.stringify can throw on circular structures; defensively fall
  // back so a logging crash doesn't cascade into the caller. We also
  // strip fields that aren't safe for stdout (functions, undefined).
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return JSON.stringify(value, replacerWithSeenSet());
    } catch {
      return '"<unserialisable>"';
    }
  }
}

function replacerWithSeenSet(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet();
  return (_key: string, value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  };
}

function emit(
  level: LogLevel,
  message: string,
  attrs: LogAttrs | undefined,
  bindings: LoggerBindings,
): void {
  // Merge bindings + attrs. Attrs win on key collision so a call site
  // can still override e.g. an inherited platform=Grok with the actual
  // platform being processed.
  const merged: LogAttrs = { ...bindings, ...(attrs || {}) };

  // In production, keep `debug` out of stdout to avoid leaking
  // potentially-sensitive payloads (customer/subscription IDs, plan
  // transitions, raw webhook bodies). Sentry breadcrumbs still receive it
  // through forwardToSentry, where the SDK's beforeSend scrubbing applies.
  const skipConsole = level === 'debug' && process.env.NODE_ENV === 'production';
  if (!skipConsole) {
    const fn = consoleFnFor(level);
    if (jsonFormat()) {
      // pino-compatible shape: msg, level (string), time (epoch ms),
      // and a flat top-level for bindings/attrs so Loki/CloudWatch
      // jsonpath-style filters work without nesting.
      const record = {
        time: Date.now(),
        level,
        msg: message,
        ...merged,
      };
      fn(safeStringify(record));
    } else {
      // Preserve the legacy `[prefix] message: {json}` style many call
      // sites were using before migration, so App Platform logs and
      // grok.boot/grok.fetch greps stay readable.
      const hasFields = Object.keys(merged).length > 0;
      if (hasFields) fn(message, merged);
      else fn(message);
    }
  }
  // Sentry forwarder always gets the merged structured form regardless
  // of console format - the Sentry Logs UI is JSON-only.
  forwardToSentry(level, message, Object.keys(merged).length ? merged : undefined);
}

export interface Logger {
  debug(message: string, attrs?: LogAttrs): void;
  info(message: string, attrs?: LogAttrs): void;
  warn(message: string, attrs?: LogAttrs): void;
  error(message: string, attrs?: LogAttrs): void;
  /**
   * Returns a new logger that auto-merges `bindings` into every record.
   * Bindings compose: `parent.child({a:1}).child({b:2})` emits both.
   */
  child(bindings: LoggerBindings): Logger;
}

function makeLogger(bindings: LoggerBindings): Logger {
  return {
    debug: (message, attrs) => emit('debug', message, attrs, bindings),
    info: (message, attrs) => emit('info', message, attrs, bindings),
    warn: (message, attrs) => emit('warn', message, attrs, bindings),
    error: (message, attrs) => emit('error', message, attrs, bindings),
    child: (more) => makeLogger({ ...bindings, ...more }),
  };
}

export const logger: Logger = makeLogger({});
