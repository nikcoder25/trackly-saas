export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    if (process.env.NODE_ENV === "production" && !process.env.CRON_SECRET) {
      console.warn(
        "[WARN] CRON_SECRET is not set — /api/cron* endpoints will return 500 and scheduled runs will not execute."
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
        `[WARN] DodoPayments is partially configured — missing: ${missingDodo.join(', ')}. ` +
        `Affected plans will fail at checkout and their webhook events will be marked 'unknown_product'.`
      );
    } else if (!anyDodo && process.env.NODE_ENV === "production") {
      console.warn(
        "[WARN] No DODO_*_PRODUCT_ID env vars are set. Paid plan upgrades will not work."
      );
    }

    // Self-triggering cron scheduler for non-Vercel environments (e.g. DigitalOcean)
    // where vercel.json crons are ignored.
    const cronSecret = process.env.CRON_SECRET;
    const appUrl = process.env.APP_URL;
    if (cronSecret && appUrl) {
      const INITIAL_DELAY_MS = 30_000; // 30 seconds
      const INTERVAL_MS = 60 * 60 * 1000; // 60 minutes

      const triggerCron = async () => {
        try {
          const res = await fetch(`${appUrl}/api/cron`, {
            method: "GET",
            headers: { Authorization: `Bearer ${cronSecret}` },
          });
          console.log(
            `[Cron Scheduler] Triggered /api/cron — status ${res.status}`
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
