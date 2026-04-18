import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",

  // Only initialize if DSN is configured
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring - sample 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session Replay - capture 10% of sessions, 100% on error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
  ],

  // Don't send PII
  sendDefaultPii: false,

  // Environment
  environment: process.env.NODE_ENV || "development",

  // Filter out noise from third-party scripts (analytics, ads) and browser
  // extensions. These are blocked by ad blockers / privacy tools and surface
  // as `TypeError: Failed to fetch`, which is not an app bug.
  ignoreErrors: [
    // Generic fetch failures from blocked third-party beacons
    "Failed to fetch",
    "NetworkError when attempting to fetch resource",
    "Load failed",
    // Common benign browser noise
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    // Browser extension noise
    /extension\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-extension:\/\//i,
  ],

  // Drop events whose stack traces originate from analytics / tag managers /
  // known third-party scripts we can't fix.
  denyUrls: [
    /googletagmanager\.com/i,
    /google-analytics\.com/i,
    /analytics\.google\.com/i,
    /\/gtag\/js/i,
    /gtm\.js/i,
    /googleads\.g\.doubleclick\.net/i,
    /www\.google\.com\/(ads|pagead|recaptcha)/i,
    /connect\.facebook\.net/i,
    /chrome-extension:\/\//i,
    /moz-extension:\/\//i,
    /safari-extension:\/\//i,
  ],

  // Last-chance filter: drop any event whose message references the blocked
  // third-party hosts, regardless of where the frame appears in the stack.
  beforeSend(event, hint) {
    const message =
      (hint?.originalException as Error | undefined)?.message ||
      event.message ||
      "";
    if (
      typeof message === "string" &&
      /Failed to fetch/i.test(message) &&
      /(google-analytics|googletagmanager|google\.com|doubleclick|facebook\.net)/i.test(
        message,
      )
    ) {
      return null;
    }
    return event;
  },
});
