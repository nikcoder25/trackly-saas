/**
 * Tests for src/lib/run-sov.ts - the helper that resolves the SOV %
 * to render on the Overview dashboard.
 *
 * Contract recap:
 *   computeOverviewSov(run) returns:
 *     - run.sov when stored is positive (always trust the worker)
 *     - 0 when run is null/undefined
 *     - stored ?? 0 when allResults is missing/empty (no fallback data)
 *     - recompute from allResults when stored is null/undefined/0
 *       AND allResults is non-empty
 *
 * The motivating bug was watchdog-reap entries written with sov:0
 * even when allResults contained 15 successful mentions; this helper
 * makes Overview resilient to that and any future malformed entry,
 * while preserving historical legitimate-zero runs (sov:0 +
 * allResults present + no mentions → recompute also yields 0).
 */
import { describe, it, expect } from 'vitest';
import { computeOverviewSov, computeSovFromResults } from '@/lib/run-sov';

describe('computeSovFromResults', () => {
  it('returns 0 for null/undefined/empty input', () => {
    expect(computeSovFromResults(null)).toBe(0);
    expect(computeSovFromResults(undefined)).toBe(0);
    expect(computeSovFromResults([])).toBe(0);
  });

  it('returns 0 when every result errored (no non-error denominator)', () => {
    expect(computeSovFromResults([
      { error: true, mentioned: false },
      { error: true, mentioned: false },
    ])).toBe(0);
  });

  it('uses Mentions-page formula: round(found / non-error * 100)', () => {
    // 10 mentioned of 17 ok (1 of 18 errored) → 58.8 → 59
    const results = Array.from({ length: 18 }, (_, i) => ({
      mentioned: i < 10,
      error: i === 17,
    }));
    expect(computeSovFromResults(results)).toBe(59);
  });

  it('returns 100 when every non-error result mentioned', () => {
    expect(computeSovFromResults([
      { mentioned: true, error: false },
      { mentioned: true, error: false },
      { error: true },           // ignored from denominator
    ])).toBe(100);
  });
});

describe('computeOverviewSov - positive stored value is trusted', () => {
  it('returns stored.sov verbatim when positive (never overrides a worker write)', () => {
    expect(computeOverviewSov({ sov: 73 })).toBe(73);
    // Even when allResults disagrees, stored wins. This is by design:
    // a successful worker run might trim or omit allResults, and a
    // recompute that conflicts with the stored number would silently
    // lie to the user.
    expect(computeOverviewSov({
      sov: 73,
      allResults: [{ mentioned: false, error: false }],
    })).toBe(73);
  });
});

describe('computeOverviewSov - null/undefined run', () => {
  it('returns 0 for null', () => {
    expect(computeOverviewSov(null)).toBe(0);
  });
  it('returns 0 for undefined', () => {
    expect(computeOverviewSov(undefined)).toBe(0);
  });
  it('returns 0 for an empty object', () => {
    expect(computeOverviewSov({})).toBe(0);
  });
});

describe('computeOverviewSov - fallback ONLY when stored missing/zero AND allResults exists', () => {
  it('fallback fires when sov is missing and allResults has data', () => {
    // Pre-PR-C-1 reaper entry: sov field absent, allResults present.
    // 15 mentioned of 17 ok = 88.
    const allResults = Array.from({ length: 18 }, (_, i) => ({
      mentioned: i < 15,
      error: i === 17,
    }));
    expect(computeOverviewSov({ allResults })).toBe(88);
  });

  it('fallback fires when sov is zero and allResults has data', () => {
    // The exact bug we shipped a fix for: reaper wrote sov:0, but
    // allResults proves there were 15 mentions.
    const allResults = Array.from({ length: 18 }, (_, i) => ({
      mentioned: i < 15,
      error: i === 17,
    }));
    expect(computeOverviewSov({ sov: 0, allResults })).toBe(88);
  });

  it("legitimately-zero run still renders 0% - recompute yields 0 because no mentions", () => {
    // Brand was never mentioned in any of 18 successful queries. The
    // worker wrote sov:0 truthfully, allResults is fully populated.
    // The fallback fires (because sov === 0 AND allResults exists)
    // but the recompute also yields 0, so Overview still shows 0.
    // This is the test the user explicitly asked for: a legitimate
    // zero must not be papered over.
    const allResults = Array.from({ length: 18 }, () => ({
      mentioned: false,
      error: false,
    }));
    expect(computeOverviewSov({ sov: 0, allResults })).toBe(0);
  });

  it("does NOT fall back when allResults is missing (no fallback data)", () => {
    // sov is 0 / missing but there's nothing to recompute from. We
    // must trust the stored value rather than invent one.
    expect(computeOverviewSov({ sov: 0 })).toBe(0);
    expect(computeOverviewSov({ sov: 0, allResults: null })).toBe(0);
    expect(computeOverviewSov({ sov: 0, allResults: undefined })).toBe(0);
  });

  it("does NOT fall back when allResults is an empty array", () => {
    // Empty array is also "no data to recompute from". Trust stored.
    expect(computeOverviewSov({ sov: 0, allResults: [] })).toBe(0);
    // Even when sov is missing entirely.
    expect(computeOverviewSov({ allResults: [] })).toBe(0);
  });

  it("does NOT fall back when stored is a positive number even if allResults disagrees", () => {
    // Belt and suspenders: only stored===0 (or missing) triggers
    // fallback. Stored=5 is not zero, so we skip recompute even if
    // allResults claims 88%.
    const allResults = Array.from({ length: 18 }, (_, i) => ({
      mentioned: i < 15,
      error: false,
    }));
    expect(computeOverviewSov({ sov: 5, allResults })).toBe(5);
  });
});

describe('Overview ↔ Mentions formula agreement (PR-8 pin)', () => {
  // The motivating fix: before PR-8, the worker stored
  // sov = totalM / totalQ (error-INCLUDED denominator) while the
  // Mentions page rendered found / ok.length (error-EXCLUDED). The
  // same run rendered ~20% on Overview and ~27% on Mentions. After
  // PR-8 the worker writes via computeSovFromResults - the same
  // formula Mentions uses - so the two pages must agree for any run
  // shape the worker is now capable of producing.
  //
  // We simulate the worker contract: stored.sov === computeSovFromResults(allResults).
  // Then assert computeOverviewSov(run) === computeSovFromResults(run.allResults).
  // This is the regression guard for F1+F2 from the Investigate-#12 audit.
  const mkRun = (results: Array<{ mentioned: boolean; error: boolean }>) => ({
    allResults: results,
    sov: computeSovFromResults(results),
  });

  it('mixed errors + mentions: Overview and Mentions render identical values', () => {
    // 10 mentioned of 17 ok (1 of 18 errored) → 59% on both pages.
    const results = Array.from({ length: 18 }, (_, i) => ({
      mentioned: i < 10,
      error: i === 17,
    }));
    const run = mkRun(results);
    expect(computeOverviewSov(run)).toBe(computeSovFromResults(results));
    expect(computeOverviewSov(run)).toBe(59);
  });

  it('all-errored run: Overview and Mentions both render 0', () => {
    const results = Array.from({ length: 5 }, () => ({ mentioned: false, error: true }));
    const run = mkRun(results);
    expect(computeOverviewSov(run)).toBe(0);
    expect(computeSovFromResults(results)).toBe(0);
  });

  it('zero-mentions run: Overview and Mentions both render 0 (legitimate zero)', () => {
    const results = Array.from({ length: 12 }, () => ({ mentioned: false, error: false }));
    const run = mkRun(results);
    expect(computeOverviewSov(run)).toBe(0);
    expect(computeSovFromResults(results)).toBe(0);
  });

  it('perfect run (every clean result mentioned): both render 100', () => {
    const results = Array.from({ length: 10 }, () => ({ mentioned: true, error: false }));
    const run = mkRun(results);
    expect(computeOverviewSov(run)).toBe(100);
    expect(computeSovFromResults(results)).toBe(100);
  });
});

describe('computeOverviewSov - pre-PR-C-1 reaper entry shape', () => {
  it('renders truthful SOV for a 15/18 watchdog-reap entry (the production bug)', () => {
    // Faithful reproduction of the actual entry shape that landed in
    // brands.data.runs for REIF / Jensen / Easypump after the
    // 11:17/11:44 EST deploys: sov hardcoded to 0, allResults
    // contained the 15 successful mentions plus 3 non-mentions.
    const allResults: Array<{ mentioned: boolean; error: boolean }> = [];
    for (let i = 0; i < 15; i++) allResults.push({ mentioned: true, error: false });
    for (let i = 0; i < 3; i++) allResults.push({ mentioned: false, error: false });

    const reapedEntry = {
      sov: 0,
      totalQ: 18,
      totalM: 15,
      watchdogReap: true,
      emergencySave: true,
      allResults,
    };
    // 15 mentioned of 18 ok = 83.3 → 83. The user's expected
    // dashboard render before this fix was "0%"; after the fix
    // (without re-running the brand) it's 83%.
    expect(computeOverviewSov(reapedEntry)).toBe(83);
  });
});
