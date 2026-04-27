// Two consecutive ticks where the cron triggered runs but every single
// dispatch failed is the exact silent-outage signature: every cron-job
// status code stays 200, the cron.summary log still gets emitted, but no
// brand actually moves. The Apr 2026 incident hid behind this for 3
// days because the cron itself returned cleanly while every internal
// POST to /api/brands/[id]/run was 403'd by middleware.
//
// Streak is tracked on globalThis so it survives Next's per-request
// route module re-evaluation while staying process-local — one alert
// per pod is fine because all pods drift in lock-step against a real
// outage.

interface DispatchAlertGlobal {
  __cronDispatchAllFailedStreak?: number;
}
const g = globalThis as unknown as DispatchAlertGlobal;

export interface DispatchAlertContext {
  eligible: number;
  processed: number;
  errors: string[];
  tick: string;
}

export interface DispatchAlertResult {
  alerted: boolean;
  streak: number;
}

export function recordDispatchOutcome(ctx: DispatchAlertContext): DispatchAlertResult {
  const allFailed = ctx.eligible > 0 && ctx.processed === 0;

  if (allFailed) {
    const next = (g.__cronDispatchAllFailedStreak ?? 0) + 1;
    g.__cronDispatchAllFailedStreak = next;
    if (next >= 2) {
      console.error('cron.dispatch_all_failed', {
        tick: ctx.tick,
        eligible: ctx.eligible,
        processed: ctx.processed,
        errors: ctx.errors,
      });
      g.__cronDispatchAllFailedStreak = 0;
      return { alerted: true, streak: next };
    }
    return { alerted: false, streak: next };
  }

  if (ctx.processed > 0) {
    g.__cronDispatchAllFailedStreak = 0;
  }
  return { alerted: false, streak: g.__cronDispatchAllFailedStreak ?? 0 };
}

export function _resetDispatchAlertStateForTests(): void {
  g.__cronDispatchAllFailedStreak = 0;
}
