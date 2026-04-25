import * as Sentry from '@sentry/nextjs';

/**
 * Structured logger that dual-writes to `console.*` and Sentry Logs.
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

function sentryLogsEnabled(): boolean {
  // Read per-call so flipping the env flag takes effect without a bounce.
  // Defaults to enabled so Sentry Logs is on wherever the SDK is configured.
  return process.env.SENTRY_LOGS_ENABLED !== 'false';
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

function emit(level: LogLevel, message: string, attrs?: LogAttrs): void {
  // In production, keep `debug` out of stdout to avoid leaking
  // potentially-sensitive payloads (customer/subscription IDs, plan
  // transitions, raw webhook bodies). Sentry breadcrumbs still receive it
  // through forwardToSentry, where the SDK's beforeSend scrubbing applies.
  const skipConsole = level === 'debug' && process.env.NODE_ENV === 'production';
  if (!skipConsole) {
    const fn = consoleFnFor(level);
    // Preserve the legacy `[prefix] message: {json}` style many call sites
    // were using before migration, so App Platform logs stay readable.
    if (attrs !== undefined) fn(message, attrs);
    else fn(message);
  }
  forwardToSentry(level, message, attrs);
}

export const logger = {
  debug: (message: string, attrs?: LogAttrs): void => emit('debug', message, attrs),
  info: (message: string, attrs?: LogAttrs): void => emit('info', message, attrs),
  warn: (message: string, attrs?: LogAttrs): void => emit('warn', message, attrs),
  error: (message: string, attrs?: LogAttrs): void => emit('error', message, attrs),
};

export type Logger = typeof logger;
