/**
 * When a keyword is checked next.
 *
 * Checks are spread across the day: each keyword has its own fixed minute
 * of the day (from a hash of its id), so a thousand keywords added in one
 * paste do not all come due in the same hour every week. The next check
 * lands on that minute within 12 hours either side of 7 days (weekly) or
 * 1 day (daily) after the last check.
 *
 * The first check of a new keyword is due within FIRST_CHECK_MINUTES.
 */
import crypto from 'crypto';
import type { Frequency } from './credits';

export const FIRST_CHECK_MINUTES = 10;
const DAY = 86_400_000;
const PERIOD: Record<Frequency, number> = { weekly: 7 * DAY, daily: DAY };

/** The keyword's minute of the day, 0-1439. */
export function slotMinute(id: string): number {
  return crypto.createHash('sha1').update(id).digest().readUInt32BE(0) % 1440;
}

export function nextCheckAt(id: string, freq: Frequency, from: Date = new Date()): Date {
  const period = PERIOD[freq] || PERIOD.weekly;
  // The keyword's slot in the 24 h window centred on "one period from now":
  // once a keyword sits on its slot, every later check is exactly one period on.
  const earliest = from.getTime() + period - DAY / 2;
  const d = new Date(earliest);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + slotMinute(id) * 60_000;
  if (t < earliest) t += DAY;
  return new Date(t);
}

/** First check for a keyword added now: spread over the next few minutes. */
export function firstCheckAt(id: string, now: Date = new Date()): Date {
  return new Date(now.getTime() + (slotMinute(id) % (FIRST_CHECK_MINUTES - 2)) * 60_000);
}

/** Back-off after a failed check: 15 min, 30, 1 h, 2 h, ... capped at 12 h. */
export function retryAt(failCount: number, now: Date = new Date()): Date {
  const minutes = Math.min(12 * 60, 15 * 2 ** Math.max(0, failCount - 1));
  return new Date(now.getTime() + minutes * 60_000);
}
