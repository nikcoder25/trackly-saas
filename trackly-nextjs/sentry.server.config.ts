import * as Sentry from "@sentry/nextjs";
import { makeBeforeSend } from "./src/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",

  // Only initialize if DSN is configured
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Structured logs → Sentry Logs (https://docs.sentry.io/product/explore/logs/).
  // Stable in @sentry/nextjs >= 10; the logs transport is independent of
  // tracesSampleRate so sampled-out traces do not drop log events. Writes
  // are gated at the call site by `SENTRY_LOGS_ENABLED` in src/lib/logger.ts
  // so we have an instant kill-switch without redeploying.
  enableLogs: true,

  // Don't send PII
  sendDefaultPii: false,

  environment: process.env.NODE_ENV || "development",

  // Scrub credentials (authorization / cookie / x-csrf-token headers,
  // password/token/secret/api_key body fields, PII on the user object)
  // before events leave the process. See src/lib/sentry-scrub.ts.
  beforeSend: makeBeforeSend(),
});
