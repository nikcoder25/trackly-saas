/**
 * Tests for src/lib/cron-eligibility.ts::resolveLastRunTime - the
 * fallback walker added in PR-C-2 to fix the production scheduler
 * skip on REIF Loans / Easypump Concrete after the 11:17/11:44 EST
 * 2026-04-28 deploy SIGTERMs.
 *
 * Bug recap: the cron's `interval_not_elapsed` gate uses a two-tier
 * resolution for the brand's last-run timestamp:
 *   1. MAX(completed_at) FROM active_runs WHERE status='done'
 *   2. brand.data.runs[last].time (fallback)
 * The reaper stamps a watchdog-reap entry into brand.data.runs with
 * `time: nowIso` (reap moment). Pre-PR-C-2, the fallback grabbed
 * that entry blindly and the gate read "this brand just ran",
 * blocking it for the full effectiveSchedule window every time a
 * stuck row was finalized.
 *
 * The fix walks brand.data.runs from newest backwards, skipping
 * reap-flagged entries. These tests pin the four cases the user
 * called out plus a couple of edge cases (malformed timestamps,
 * empty array) to keep the helper honest.
 */
import { describe, it, expect } from 'vitest';
import { resolveLastRunTime } from '@/lib/cron-eligibility';

describe('resolveLastRunTime - primary path (active_runs status=done)', () => {
  it("returns active_runs timestamp + source='active_runs' when primary is set", () => {
    // Regression guard: when there's a status='done' row in active_runs,
    // the helper must use it and never consult brand.data.runs at all -
    // even if brand.data.runs[last] is a watchdog-reap entry that would
    // give a different (and wrong) answer. The active_runs success row
    // is the source of truth; the JSONB array is fallback only.
    const primary = Date.parse('2026-04-27T10:00:00Z');
    const reapMs = Date.now();
    const out = resolveLastRunTime(primary, [
      { time: '2026-04-26T08:00:00Z' },
      { time: new Date(reapMs).toISOString(), watchdogReap: true },
    ]);
    expect(out.lastRunTime).toBe(primary);
    expect(out.lastRunSource).toBe('active_runs');
  });

  it('treats null/0/undefined primary as missing and falls through to brand_data', () => {
    const stamp = '2026-04-27T10:00:00Z';
    expect(resolveLastRunTime(null, [{ time: stamp }]).lastRunSource).toBe('brand_data');
    expect(resolveLastRunTime(undefined, [{ time: stamp }]).lastRunSource).toBe('brand_data');
    expect(resolveLastRunTime(0, [{ time: stamp }]).lastRunSource).toBe('brand_data');
  });
});

describe('resolveLastRunTime - fallback skips reap entries', () => {
  it('walks past a watchdog-reap entry and uses an older legitimate success', () => {
    // The exact REIF/Easypump case: yesterday's successful run is in
    // history, today's stuck-and-reaped run is also there with
    // watchdogReap:true. The fallback must use yesterday's
    // timestamp, not the reap moment, so the interval gate measures
    // hours-since-success not hours-since-reap.
    const yesterday = '2026-04-27T10:00:00Z';
    const reapNow = new Date().toISOString();
    const out = resolveLastRunTime(null, [
      { time: '2026-04-26T08:00:00Z' },
      { time: yesterday },
      { time: reapNow, watchdogReap: true },
    ]);
    expect(out.lastRunTime).toBe(Date.parse(yesterday));
    expect(out.lastRunSource).toBe('brand_data');
  });

  it("returns null when EVERY brand.data.runs entry is a reap", () => {
    // Brand has been getting reaped every cycle and never completed
    // a run. The helper must NOT pick the latest reap stamp (which
    // would be NOW) - instead returns null so the cron treats the
    // brand as never-run and lets it through the gate. A reap-only
    // history is the strongest signal that the brand needs a fresh
    // attempt, not another 24h block.
    const reapA = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const reapB = new Date().toISOString();
    const out = resolveLastRunTime(null, [
      { time: reapA, watchdogReap: true },
      { time: reapB, emergencySave: true },
    ]);
    expect(out.lastRunTime).toBeNull();
    expect(out.lastRunSource).toBeNull();
  });

  it('also skips emergencySave-flagged entries (defense in depth)', () => {
    // emergencySave is set by the same code path as watchdogReap;
    // either flag should be treated as a reap entry. This test pins
    // that contract so a future refactor that drops one flag doesn't
    // silently re-introduce the bug.
    const yesterday = '2026-04-27T10:00:00Z';
    const reapNow = new Date().toISOString();
    const out = resolveLastRunTime(null, [
      { time: yesterday },
      // No watchdogReap, but emergencySave is set - same skip rule.
      { time: reapNow, emergencySave: true },
    ]);
    expect(out.lastRunTime).toBe(Date.parse(yesterday));
  });
});

describe('resolveLastRunTime - fallback unchanged when no reap entries present', () => {
  it("uses runs[last].time exactly like pre-PR-C-2 behaviour", () => {
    // Regression guard: a brand whose entire history is healthy
    // successes must still get its newest entry's timestamp. This is
    // the no-op case for the change - the new walker, when nothing
    // is reap-flagged, is functionally identical to the old
    // `runs[runs.length - 1]` lookup.
    const newest = '2026-04-28T10:00:00Z';
    const out = resolveLastRunTime(null, [
      { time: '2026-04-26T08:00:00Z' },
      { time: '2026-04-27T08:00:00Z' },
      { time: newest },
    ]);
    expect(out.lastRunTime).toBe(Date.parse(newest));
    expect(out.lastRunSource).toBe('brand_data');
  });

  it("falls back to runs[last].date when .time is missing (pre-PR-C-2 behaviour preserved)", () => {
    const out = resolveLastRunTime(null, [
      { date: '2026-04-27' },
    ]);
    expect(out.lastRunTime).toBe(Date.parse('2026-04-27'));
  });
});

describe('resolveLastRunTime - edge cases', () => {
  it('returns null when brandRuns is undefined / null / empty', () => {
    expect(resolveLastRunTime(null, undefined).lastRunTime).toBeNull();
    expect(resolveLastRunTime(null, null).lastRunTime).toBeNull();
    expect(resolveLastRunTime(null, []).lastRunTime).toBeNull();
  });

  it('skips entries with no usable timestamp without crashing', () => {
    const fallback = '2026-04-26T08:00:00Z';
    const out = resolveLastRunTime(null, [
      { time: fallback },
      // No time, no date - must not throw, must not poison the result.
      {},
    ]);
    expect(out.lastRunTime).toBe(Date.parse(fallback));
  });

  it('skips entries whose stamp parses to NaN', () => {
    const fallback = '2026-04-26T08:00:00Z';
    const out = resolveLastRunTime(null, [
      { time: fallback },
      { time: 'not-a-date' },
    ]);
    expect(out.lastRunTime).toBe(Date.parse(fallback));
  });
});
