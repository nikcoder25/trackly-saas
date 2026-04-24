import * as Sentry from "@sentry/nextjs";
import { makeBeforeSend } from "./src/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  // Forward structured logs from edge routes to Sentry Logs. Same
  // kill-switch as the server config: logger.* checks SENTRY_LOGS_ENABLED
  // at call time.
  enableLogs: true,
  sendDefaultPii: false,
  environment: process.env.NODE_ENV || "development",
  // Same credential / PII scrub as the server runtime. Must be applied on
  // the edge config too because middleware and edge routes emit events
  // via this init.
  beforeSend: makeBeforeSend(),
});
