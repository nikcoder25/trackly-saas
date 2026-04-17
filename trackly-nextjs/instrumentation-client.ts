// Next.js 15 / Sentry SDK v8+ client-side instrumentation entrypoint.
//
// This file is picked up automatically by Next.js at the project root
// of the Next app (trackly-nextjs/). Its job is twofold:
//
//   1. Run the existing Sentry browser init (kept in sentry.client.config.ts
//      for backwards-compatibility and easy diffing).
//   2. Export onRouterTransitionStart so Sentry can instrument App Router
//      navigations. Without this export the SDK prints the
//      "ACTION REQUIRED: export onRouterTransitionStart" warning at build
//      time and client-side navigation spans are not recorded.
//
// See: https://docs.sentry.io/platforms/javascript/guides/nextjs/#client-side-instrumentation

import * as Sentry from "@sentry/nextjs";

// Re-run the existing browser init so we don't duplicate config.
import "./sentry.client.config";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
