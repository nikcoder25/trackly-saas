import { describe, expect, it } from 'vitest';

import { decideRequiresFreshness } from '../freshness-classifier';

// The strict allowlist is intentionally narrow: only queries with an
// unambiguous freshness anchor (explicit day, current period, breaking
// news, live market/weather data, or a present-tense anchor) should
// return requires_freshness=true. Everything else - prices, comparisons,
// recommendations, brand mentions, definitional - is assumed
// answerable from training data.
describe('decideRequiresFreshness — strict allowlist', () => {
  it('returns false for empty/whitespace input with reason empty_query', () => {
    expect(decideRequiresFreshness('')).toEqual({
      requires_freshness: false,
      reason: 'empty_query',
    });
    expect(decideRequiresFreshness('   ')).toEqual({
      requires_freshness: false,
      reason: 'empty_query',
    });
  });

  it('flags explicit single-day calendar anchors', () => {
    for (const q of ['news today', 'concerts tonight', 'meetings tomorrow', 'what happened yesterday']) {
      const d = decideRequiresFreshness(q);
      expect(d.requires_freshness).toBe(true);
      expect(d.reason).toBe('explicit_day_reference');
    }
  });

  // `current_period` ("this week / this month / this morning / afternoon
  // / evening") was DROPPED in the May-cycle cost-reduction pass. The
  // pattern matched recommendation/landscape queries too freely
  // ("best deals this month", "tasks this morning" → general planning),
  // and the surcharge per false-positive is $0.030. Genuinely time-
  // sensitive variants still trip via an explicit day anchor (e.g.
  // "events tomorrow") or breaking-news/market patterns.
  it('does NOT flag short-horizon "this <period>" anchors (current_period dropped)', () => {
    for (const q of ['events this week', 'launches this month', 'tasks this morning', 'plans this afternoon', 'meetings this evening']) {
      const d = decideRequiresFreshness(q);
      expect(d.requires_freshness).toBe(false);
      expect(d.reason).toBe('no_freshness_anchor');
    }
  });

  it('flags breaking-news intent only when paired with a freshness signal', () => {
    expect(decideRequiresFreshness('breaking news Acme').requires_freshness).toBe(true);
    expect(decideRequiresFreshness('latest news on Stripe').requires_freshness).toBe(true);
    expect(decideRequiresFreshness('news update on Tesla').requires_freshness).toBe(true);
    // Bare `news` alone must NOT trip — it's common in brand-tracking
    // queries like "Acme Corp news section".
    expect(decideRequiresFreshness('Acme Corp news section').requires_freshness).toBe(false);
  });

  it('flags live market and live-score signals', () => {
    expect(decideRequiresFreshness('Tesla stock price').reason).toBe('live_market_data');
    expect(decideRequiresFreshness('USD EUR exchange rate').reason).toBe('live_market_data');
    expect(decideRequiresFreshness('Lakers live score').reason).toBe('live_market_data');
  });

  it('flags weather queries with a clear weather anchor', () => {
    // Note: rule order matters — `weather tomorrow` matches the
    // single-day-anchor rule first, so it reports `explicit_day_reference`.
    // We only assert reason=weather for queries WITHOUT a higher-priority
    // anchor; the requires_freshness boolean is what the gate cares about.
    expect(decideRequiresFreshness('weather in Austin').reason).toBe('weather');
    expect(decideRequiresFreshness('weather forecast').reason).toBe('weather');
    expect(decideRequiresFreshness('weather tomorrow').requires_freshness).toBe(true);
  });

  // `present_tense_anchor` ("right now / currently / as of today / as of
  // now") was DROPPED in the same pass. `currently` in particular was
  // matching brand-tracking and recommendation queries that don't need
  // live web data ("currently popular CRMs", "what is currently the
  // cheapest option"). `as of today` still trips via the single-day
  // anchor on `today`, which preserves brand-mention recall for the one
  // sub-case that genuinely is time-sensitive.
  it('does NOT flag standalone present-tense anchors (present_tense_anchor dropped)', () => {
    expect(decideRequiresFreshness('outages right now').requires_freshness).toBe(false);
    expect(decideRequiresFreshness('what is currently trending').requires_freshness).toBe(false);
    expect(decideRequiresFreshness('as of now Stripe headcount').requires_freshness).toBe(false);
  });

  it('still flags "as of today" via the surviving day anchor', () => {
    // `as of today` overlaps with the single-day anchor on `today`; the
    // surviving rule keeps brand-mention recall on this one sub-case.
    const d = decideRequiresFreshness('Stripe headcount as of today');
    expect(d.requires_freshness).toBe(true);
    expect(d.reason).toBe('explicit_day_reference');
  });

  // The whole point of the strict allowlist is to DROP these long-tail
  // matches that the permissive FRESHNESS_OR_LOCAL_RE used to catch.
  // None of these queries genuinely need fresh web data on a daily cron.
  it('does NOT flag pricing/cost queries without a freshness anchor', () => {
    expect(decideRequiresFreshness('Stripe pricing').requires_freshness).toBe(false);
    expect(decideRequiresFreshness('iPhone price').requires_freshness).toBe(false);
    expect(decideRequiresFreshness('cost of Salesforce').requires_freshness).toBe(false);
  });

  it('does NOT flag bare year mentions', () => {
    expect(decideRequiresFreshness('best CRM in 2026').requires_freshness).toBe(false);
    expect(decideRequiresFreshness('iPhone 2025 features').requires_freshness).toBe(false);
  });

  it('does NOT flag definitional, comparison, or brand-mention queries', () => {
    expect(decideRequiresFreshness('What is HTTP?').requires_freshness).toBe(false);
    expect(decideRequiresFreshness('Stripe vs Adyen').requires_freshness).toBe(false);
    expect(decideRequiresFreshness('alternatives to Stripe').requires_freshness).toBe(false);
    expect(decideRequiresFreshness('recommend a CRM').requires_freshness).toBe(false);
    expect(decideRequiresFreshness('Acme Corp customer support').requires_freshness).toBe(false);
    expect(decideRequiresFreshness('dentist in Austin').requires_freshness).toBe(false);
  });

  it('returns no_freshness_anchor for non-matching queries', () => {
    expect(decideRequiresFreshness('Stripe pricing').reason).toBe('no_freshness_anchor');
    expect(decideRequiresFreshness('best CRM').reason).toBe('no_freshness_anchor');
  });

  // Pure-function contract: same input → same output, no side effects on
  // process.env or otherwise. Catches accidental env reads / mutable
  // state during refactors.
  it('is pure (deterministic, no env side effects)', () => {
    const before = JSON.stringify(process.env);
    const a = decideRequiresFreshness('news today');
    const b = decideRequiresFreshness('news today');
    expect(a).toEqual(b);
    expect(JSON.stringify(process.env)).toBe(before);
  });
});
