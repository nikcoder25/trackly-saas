import * as Sentry from "@sentry/nextjs";
import "../sentry.client.config";

// Sentry v10+ app-router navigation instrumentation. Without this export
// the build surfaces a warning that client-side route changes aren't
// being reported as transactions — exporting the hook wires them up.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
