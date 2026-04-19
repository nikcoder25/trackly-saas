export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    if (process.env.NODE_ENV === "production" && !process.env.CRON_SECRET) {
      console.warn(
        "[WARN] CRON_SECRET is not set - /api/cron* endpoints will return 500 and scheduled runs will not execute."
      );
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
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = async (...args: unknown[]) => {
  const Sentry = await import("@sentry/nextjs");
  return (Sentry.captureRequestError as (...a: unknown[]) => void)(...args);
};
