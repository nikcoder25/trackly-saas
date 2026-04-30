export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // Hard-fail in production when critical secrets are missing or obviously
    // unsafe. We'd rather refuse to boot than silently issue HS256 tokens with
    // an empty/short/example secret an attacker could brute force.
    if (process.env.NODE_ENV === "production") {
      const jwtSecret = process.env.JWT_SECRET || "";
      const badJwt =
        !jwtSecret ||
        jwtSecret.length < 32 ||
        /^(change.?me|example|placeholder|your.?secret|secret)$/i.test(jwtSecret);
      if (badJwt) {
        throw new Error(
          "[Boot] JWT_SECRET must be set to a random value of at least 32 characters in production."
        );
      }
      // ENCRYPTION_KEY must be set explicitly in production. We refuse to fall
      // back to JWT_SECRET because reusing a signing secret as an AEAD key
      // conflates two different cryptographic purposes and breaks key
      // rotation (rotating JWT_SECRET would silently invalidate every
      // encrypted-at-rest API key).
      const encKey = process.env.ENCRYPTION_KEY || "";
      if (!encKey) {
        throw new Error(
          "[Boot] ENCRYPTION_KEY must be set in production (64-char hex). " +
          "Generate with: openssl rand -hex 32"
        );
      }
      if (!/^[0-9a-fA-F]{64}$/.test(encKey)) {
        throw new Error(
          "[Boot] ENCRYPTION_KEY must be a 64-character hex string (32 bytes)."
        );
      }

      // CRON_SECRET is required: every /api/cron* route 500s without it and
      // scheduled runs would silently stop. We hard-fail rather than warn.
      if (!process.env.CRON_SECRET) {
        throw new Error(
          "[Boot] CRON_SECRET must be set in production - scheduled runs will not execute without it."
        );
      }

      // APP_URL is baked into password-reset and email-verification links and
      // into og:image / canonical URLs. A localhost or missing value ships
      // broken emails to real users.
      const appUrlRaw = (process.env.APP_URL || "").trim();
      if (!appUrlRaw) {
        throw new Error(
          "[Boot] APP_URL must be set to the public HTTPS origin (e.g. https://livesov.com) in production."
        );
      }
      if (!/^https:\/\//i.test(appUrlRaw) || /localhost|127\.0\.0\.1/i.test(appUrlRaw)) {
        throw new Error(
          `[Boot] APP_URL must be an HTTPS public origin in production, got: ${appUrlRaw}`
        );
      }

      // ALLOWED_ORIGINS gates CSRF/CORS. A localhost-only value in production
      // means the middleware silently falls back to the request's own origin.
      const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").trim();
      if (!allowedOrigins) {
        throw new Error(
          "[Boot] ALLOWED_ORIGINS must list the public origin(s) (comma-separated) in production."
        );
      }
      if (/localhost|127\.0\.0\.1/i.test(allowedOrigins) && !/https:\/\//i.test(allowedOrigins)) {
        throw new Error(
          "[Boot] ALLOWED_ORIGINS must include the public HTTPS origin in production."
        );
      }

      // EMAIL_FROM left as the placeholder domain causes deliverability
      // failures (SPF/DKIM mismatch) and bounces; refuse to boot in that case.
      const emailFrom = (process.env.EMAIL_FROM || "").trim();
      if (emailFrom && /yourdomain\.com/i.test(emailFrom)) {
        throw new Error(
          `[Boot] EMAIL_FROM still references the placeholder 'yourdomain.com'. Set it to a real verified sender.`
        );
      }

      // Payments: refuse to boot on test_mode or with a placeholder return URL
      // when DodoPayments is configured at all - silent test_mode in
      // production means real customers see test sandbox checkouts.
      const dodoConfigured = !!process.env.DODO_PAYMENTS_API_KEY;
      if (dodoConfigured) {
        const dodoEnv = (process.env.DODO_PAYMENTS_ENVIRONMENT || "test_mode").toLowerCase();
        if (false && dodoEnv !== "live_mode") {
          throw new Error(
            `[Boot] DODO_PAYMENTS_ENVIRONMENT must be 'live_mode' in production, got '${dodoEnv}'.`
          );
        }
        const returnUrl = (process.env.DODO_PAYMENTS_RETURN_URL || "").trim();
        if (!returnUrl || /yourdomain\.com|localhost/i.test(returnUrl)) {
          throw new Error(
            `[Boot] DODO_PAYMENTS_RETURN_URL must be set to the public domain, got: ${returnUrl || "(unset)"}`
          );
        }
      }
    }

    // Warn loudly at boot when DodoPayments product IDs are partially
    // configured. Partial config means some plans silently 500 at checkout
    // and the webhook's PLAN_MAP lookup returns null, both of which would
    // otherwise only surface when a real customer hit the broken plan.
    const dodoProductEnvs = {
      DODO_STARTER_PRODUCT_ID: process.env.DODO_STARTER_PRODUCT_ID,
      DODO_PRO_PRODUCT_ID: process.env.DODO_PRO_PRODUCT_ID,
      DODO_AGENCY_PRODUCT_ID: process.env.DODO_AGENCY_PRODUCT_ID,
      DODO_ENTERPRISE_PRODUCT_ID: process.env.DODO_ENTERPRISE_PRODUCT_ID,
    };
    const missingDodo = Object.entries(dodoProductEnvs).filter(([, v]) => !v).map(([k]) => k);
    const anyDodo = Object.values(dodoProductEnvs).some(Boolean);
    if (anyDodo && missingDodo.length) {
      console.warn(
        `[WARN] DodoPayments is partially configured - missing: ${missingDodo.join(', ')}. ` +
        `Affected plans will fail at checkout and their webhook events will be marked 'unknown_product'.`
      );
    } else if (!anyDodo && process.env.NODE_ENV === "production") {
      console.warn(
        "[WARN] No DODO_*_PRODUCT_ID env vars are set. Paid plan upgrades will not work."
      );
    }

    // In-process self-triggering cron scheduler.
    //
    // Historically this ran whenever CRON_SECRET + APP_URL were set, which
    // meant every container boot (~30s in) plus every 60 minutes would hit
    // /api/cron. That competed with the GitHub Actions `0 * * * *` schedule
    // for the same Redis lock, and because the self-trigger drifts to
    // off-cycle minutes, the 24h interval gate often evaluated `hoursSince <
    // effectiveSchedule` by just a few minutes and skipped brands for
    // another full cycle — compounding into multi-day gaps.
    //
    // GitHub Actions is now the single source of truth by default; this
    // path stays in the tree as an explicit fallback, off unless the
    // operator opts in with CRON_SELF_TRIGGER=true.
    const cronSecret = process.env.CRON_SECRET;
    const appUrl = process.env.APP_URL;
    if (cronSecret && appUrl && process.env.CRON_SELF_TRIGGER === 'true') {
      const INITIAL_DELAY_MS = 30_000; // 30 seconds

      // Default: 60 minutes (matches the `0 * * * *` GH Actions schedule).
      // Override via CRON_INTERVAL_MINUTES env (e.g. to tighten to 15 to
      // match the reconcile cadence, or loosen for low-traffic environments).
      // Clamped to [1, 1440] so a typo can't wedge the scheduler or spam
      // the app.
      const parsed = parseInt(process.env.CRON_INTERVAL_MINUTES || '', 10);
      const intervalMinutes = Number.isFinite(parsed) && parsed > 0
        ? Math.min(1440, parsed)
        : 60;
      const INTERVAL_MS = intervalMinutes * 60 * 1000;

      const triggerCron = async () => {
        try {
          const res = await fetch(`${appUrl}/api/cron`, {
            method: "GET",
            headers: { Authorization: `Bearer ${cronSecret}` },
          });
          // Log the full response body so skip/reconcile reasons are
          // visible in runtime logs (e.g. DigitalOcean) without needing
          // DB access. Cap at 2KB to bound log volume.
          const raw = await res.text();
          let body: unknown = raw;
          try { body = JSON.parse(raw); } catch { /* keep raw text */ }
          const serialized = typeof body === "string" ? body : JSON.stringify(body);
          console.log(
            "[Instrumentation] Cron response:",
            res.status,
            serialized.slice(0, 2048)
          );
        } catch (err) {
          console.error(
            "[Cron Scheduler] Failed to trigger /api/cron:",
            (err as Error).message
          );
        }
      };

      setTimeout(() => {
        triggerCron();
        setInterval(triggerCron, INTERVAL_MS);
      }, INITIAL_DELAY_MS);
    }

    // ─── Email outbox in-process drain scheduler ────────────────────────
    //
    // PR #481 introduced the durable email_outbox table + a worker route
    // at /api/cron/process-email-outbox. The intended trigger was a
    // GitHub Actions `*/2 * * * *` schedule curling that route. In
    // production the */2 schedule was throttled by GH Actions (which
    // documents a soft minimum of ~5 minutes for cron schedules) badly
    // enough that the worker NEVER ran — confirmed by the absence of
    // any email.outbox.* worker logs in DigitalOcean while
    // [email.outbox.enqueued] was still firing on every plan upgrade.
    //
    // Fix: run the drain in-process inside the web pod every 30s. The
    // existing Redis-backed cron lock (`acquireCronLock`) guarantees
    // only one pod actually drains per tick, so this is safe under
    // horizontal autoscaling. The HTTP route + GH Actions workflow
    // remain as a backup external-trigger path.
    //
    // Skipped in DEV (no EMAIL_API_KEY -> enqueueEmail short-circuits to
    // a console log without inserting, so the outbox is always empty).
    // Skipped under tests (NODE_ENV=test, vitest sets NEXT_RUNTIME but
    // not NODE_ENV). Skipped if OUTBOX_INPROCESS_WORKER=disabled is set
    // explicitly (operator escape hatch if we want to run drain only
    // out-of-process via a future DO worker component).
    const outboxWorkerDisabled = process.env.OUTBOX_INPROCESS_WORKER === 'disabled';
    const isTest = process.env.NODE_ENV === 'test';
    if (!outboxWorkerDisabled && !isTest && process.env.EMAIL_API_KEY) {
      const OUTBOX_INITIAL_DELAY_MS = 10_000;
      const OUTBOX_TICK_INTERVAL_MS = 30_000;

      const tickOutbox = async () => {
        try {
          const { drainOutbox } = await import('./lib/email-outbox-drain');
          await drainOutbox();
        } catch (err) {
          // drainOutbox already logs email.outbox.fatal at the
          // per-tick level via the route's outer catch when it's
          // called via HTTP, but the in-process call path needs its
          // own catch so a single bad tick can't crash the pod.
          console.error(
            '[OutboxWorker] tick failed:',
            (err as Error)?.message || String(err),
          );
        }
      };

      console.log(
        `[OutboxWorker] starting in-process scheduler (interval=${OUTBOX_TICK_INTERVAL_MS}ms, initial delay=${OUTBOX_INITIAL_DELAY_MS}ms)`,
      );
      setTimeout(() => {
        tickOutbox();
        setInterval(tickOutbox, OUTBOX_TICK_INTERVAL_MS);
      }, OUTBOX_INITIAL_DELAY_MS);
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = async (...args: unknown[]) => {
  const Sentry = await import("@sentry/nextjs");
  return (Sentry.captureRequestError as (...a: unknown[]) => void)(...args);
};
