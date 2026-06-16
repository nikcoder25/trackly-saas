/**
 * Client-side usage-alert evaluator that synthesizes in-app
 * notifications when the user crosses 80% / 95% / 100% of their
 * monthly credit cap.
 *
 * No backend involvement: reads the user's three toggle preferences
 * from localStorage (written by <UsageAlertsCard />), tracks which
 * thresholds have already fired in the current billing period in a
 * sibling localStorage key, and synthesizes Notification-shaped
 * objects that <useNotifications /> merges into the bell-icon list.
 *
 * The "fired-this-period" map is keyed by `status.nextResetAt` so it
 * resets automatically when a new period starts - no cron, no manual
 * cleanup, no server round-trip.
 */

import type { CreditStatus } from '@/contexts/CreditsContext';

export type UsageAlertThreshold = '80' | '95' | 'over';

export interface UsageAlertNotification {
  /** Synthetic ID so we can mark a specific alert read. */
  id: string;
  message: string;
  /** ISO timestamp the alert fired. */
  created_at: string;
  read: boolean;
  /** Where clicking the alert should navigate. */
  href: string;
  /** Marks this row as synthesized client-side. Server alerts won't
   *  carry this field. */
  source: 'usage-alert';
  /** Threshold key - exposed so consumers can call markUsageAlertRead. */
  threshold: UsageAlertThreshold;
}

interface AlertToggles {
  notify80: boolean;
  notify95: boolean;
  notifyOver: boolean;
}

interface FiredEntry {
  /** ISO timestamp the alert fired. */
  at: string;
  /** Whether the user has acknowledged the alert (clicked it). */
  read: boolean;
  /** Used / cap captured at fire time so the message stays accurate
   *  even if usage continues to climb. */
  used: number;
  cap: number;
}

interface AlertState {
  /**
   * Period key - using `status.nextResetAt` as the key lets the state
   * auto-reset when the period rolls (the next render after reset
   * gets a different key, we wipe the `fired` map, and the same
   * thresholds become eligible to fire again).
   */
  periodKey: string;
  fired: Partial<Record<UsageAlertThreshold, FiredEntry>>;
}

const TOGGLES_KEY = 'trackly:billing:usageAlerts';
const STATE_KEY = 'trackly:usageAlerts:state';

const DEFAULT_TOGGLES: AlertToggles = {
  notify80: true,
  notify95: true,
  notifyOver: false,
};

const ALERT_HREF = '/dashboard/billing#plan-comparison';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readToggles(): AlertToggles {
  if (!isBrowser()) return DEFAULT_TOGGLES;
  try {
    const raw = window.localStorage.getItem(TOGGLES_KEY);
    if (!raw) return DEFAULT_TOGGLES;
    const parsed = JSON.parse(raw) as Partial<AlertToggles>;
    return {
      notify80: typeof parsed.notify80 === 'boolean' ? parsed.notify80 : DEFAULT_TOGGLES.notify80,
      notify95: typeof parsed.notify95 === 'boolean' ? parsed.notify95 : DEFAULT_TOGGLES.notify95,
      notifyOver: typeof parsed.notifyOver === 'boolean' ? parsed.notifyOver : DEFAULT_TOGGLES.notifyOver,
    };
  } catch {
    return DEFAULT_TOGGLES;
  }
}

function readState(): AlertState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AlertState;
    if (typeof parsed?.periodKey !== 'string' || typeof parsed?.fired !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeState(state: AlertState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be unavailable in incognito; the worst case is
    // the alert re-fires on the next page load, which is annoying but
    // not destructive.
  }
}

function copyFor(threshold: UsageAlertThreshold, used: number, cap: number): string {
  const u = used.toLocaleString();
  const c = cap.toLocaleString();
  if (threshold === '80') {
    return `You've used 80% of your monthly credits (${u} / ${c}). Consider upgrading your plan.`;
  }
  if (threshold === '95') {
    return `You've used 95% of your monthly credits (${u} / ${c}). You're close to running out.`;
  }
  return `You've hit your monthly credit limit (${u} / ${c}). Upgrade to keep tracking.`;
}

function thresholdEnabled(t: UsageAlertThreshold, toggles: AlertToggles): boolean {
  if (t === '80') return toggles.notify80;
  if (t === '95') return toggles.notify95;
  return toggles.notifyOver;
}

function thresholdCrossed(t: UsageAlertThreshold, pct: number): boolean {
  if (t === '80') return pct >= 80;
  if (t === '95') return pct >= 95;
  return pct >= 100;
}

function alertId(threshold: UsageAlertThreshold, periodKey: string): string {
  return `usage-alert-${threshold}-${periodKey}`;
}

/**
 * Compute the synthetic notifications to surface for the current
 * billing period. Side effect: records the firing of any newly
 * crossed threshold in localStorage so the same threshold doesn't
 * re-fire on subsequent calls within the same period.
 *
 * Idempotent within a period: calling it twice with the same status
 * produces the same alerts and the second call is a no-op on
 * localStorage.
 */
export function evaluateUsageAlerts(status: CreditStatus | null | undefined): UsageAlertNotification[] {
  if (!status) return [];
  // Owner / unlimited never trigger usage alerts - they have no cap
  // to cross.
  if (status.plan === 'owner' || !Number.isFinite(status.monthlyCap) || status.monthlyCap <= 0 || status.monthlyCap >= 99_999) {
    return [];
  }

  const periodKey = status.nextResetAt || '';
  const toggles = readToggles();
  const usedPct = (status.monthlyUsed / status.monthlyCap) * 100;
  const now = new Date().toISOString();

  // Reset the fired map if the period rolled. We always rewrite the
  // periodKey so a stale entry from a prior period can never leak in.
  const prior = readState();
  const fired: AlertState['fired'] =
    prior && prior.periodKey === periodKey ? { ...prior.fired } : {};

  let dirty = !prior || prior.periodKey !== periodKey;
  const order: UsageAlertThreshold[] = ['80', '95', 'over'];
  for (const t of order) {
    if (fired[t]) continue;                       // already fired this period
    if (!thresholdEnabled(t, toggles)) continue;  // user has the toggle off
    if (!thresholdCrossed(t, usedPct)) continue;  // not crossed yet
    fired[t] = {
      at: now,
      read: false,
      used: status.monthlyUsed,
      cap: status.monthlyCap,
    };
    dirty = true;
  }

  if (dirty) writeState({ periodKey, fired });

  // Build the notifications to return. We surface every fired alert
  // for the current period (read-or-not) so they remain visible in
  // the bell across page loads - same UX pattern as server alerts.
  const out: UsageAlertNotification[] = [];
  for (const t of order) {
    const entry = fired[t];
    if (!entry) continue;
    out.push({
      id: alertId(t, periodKey),
      message: copyFor(t, entry.used, entry.cap),
      created_at: entry.at,
      read: entry.read,
      href: ALERT_HREF,
      source: 'usage-alert',
      threshold: t,
    });
  }
  return out;
}

/**
 * Marks a synthetic usage alert as read in localStorage. Re-evaluating
 * after this call returns the alert with `read: true`.
 *
 * No-op if the id doesn't match a known synthetic alert.
 */
export function markUsageAlertRead(id: string): void {
  if (!isBrowser()) return;
  const state = readState();
  if (!state) return;
  for (const t of ['80', '95', 'over'] as UsageAlertThreshold[]) {
    const entry = state.fired[t];
    if (!entry) continue;
    if (id === alertId(t, state.periodKey)) {
      if (entry.read) return; // already read; avoid an unnecessary write
      state.fired[t] = { ...entry, read: true };
      writeState(state);
      return;
    }
  }
}
