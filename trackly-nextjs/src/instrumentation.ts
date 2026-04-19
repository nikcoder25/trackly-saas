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
      const encKey = process.env.ENCRYPTION_KEY || "";
      if (encKey && !/^[0-9a-fA-F]{64}$/.test(encKey)) {
        throw new Error(
          "[Boot] ENCRYPTION_KEY must be a 64-character hex string (32 bytes) when set."
        );
      }
    }

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

    // In-process self-triggering cron scheduler. GitHub Actions
    // (.github/workflows/cron.yml) is the primary trigger on DigitalOcean;
    // this is a belt-and-suspenders fallback so scheduled runs still happen
    // if the workflow is disabled. cron_locks dedupes the two sources.
    //
    // When the app runs on multiple instances, every instance would otherwise
    // wake up on the same cadence and race on the same lock. That's not
    // incorrect (only one wins) but it's wasteful and noisy, so:
    //   - In production we only enable the scheduler when the runtime exposes
    //     an instance index and we're on instance 0.
    //   - Any env can opt out via CRON_SELF_TRIGGER=false.
    //   - Any env can force-enable via CRON_SELF_TRIGGER=true.
    const cronSecret = process.env.CRON_SECRET;
    const appUrl = process.env.APP_URL;
    const cronToggle = (process.env.CRON_SELF_TRIGGER || "").toLowerCase();
    const instanceIndex = process.env.INSTANCE_INDEX ?? process.env.NODE_APP_INSTANCE ?? null;
    const isLeader = instanceIndex === null || instanceIndex === "0";
    const selfTriggerEnabled =
      cronToggle === "true" ||
      (cronToggle !== "false" &&
        (process.env.NODE_ENV !== "production" || isLeader));
    if (cronSecret && appUrl && selfTriggerEnabled) {
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
