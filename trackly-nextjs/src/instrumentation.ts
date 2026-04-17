export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    if (process.env.NODE_ENV === "production" && !process.env.CRON_SECRET) {
      console.warn(
        "[WARN] CRON_SECRET is not set — /api/cron* endpoints will return 500 and scheduled runs will not execute."
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
