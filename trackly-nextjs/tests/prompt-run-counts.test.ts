import { describe, it, expect } from 'vitest';
import {
  RUN_COUNT_WINDOW_DAYS,
  RUN_KEY_SQL,
  distinctMentionedRunsSql,
  distinctRunsSql,
  formatPromptRunSummary,
} from '@/lib/prompt-run-counts';

/**
 * Query Tracker said "90 runs" and search said "368/624 runs" for the same
 * prompt. Both now count with these helpers, so the definition lives here.
 */
describe('run count SQL', () => {
  it('counts distinct (scan, engine) runs, falling back to the row id', () => {
    expect(RUN_KEY_SQL).toContain('COALESCE(batch_id, id)');
    expect(RUN_KEY_SQL).toContain('platform');
    expect(distinctRunsSql()).toBe(`COUNT(DISTINCT ${RUN_KEY_SQL})::int`);
  });

  it('applies an optional row condition without dropping the group', () => {
    expect(distinctRunsSql('success')).toBe(`COUNT(DISTINCT CASE WHEN success THEN ${RUN_KEY_SQL} END)::int`);
  });

  it('counts mentioned runs with the same key', () => {
    expect(distinctMentionedRunsSql()).toBe(`COUNT(DISTINCT CASE WHEN mentioned THEN ${RUN_KEY_SQL} END)::int`);
    expect(distinctMentionedRunsSql('success')).toContain('WHEN mentioned AND success THEN');
  });

  it('uses the same 30-day window as the Query Tracker default', () => {
    expect(RUN_COUNT_WINDOW_DAYS).toBe(30);
  });
});

describe('formatPromptRunSummary', () => {
  it('labels mentions and runs separately with the window', () => {
    expect(formatPromptRunSummary(45, 90)).toBe('Mentioned in 45 of 90 runs (last 30 days)');
  });

  it('singularises one run', () => {
    expect(formatPromptRunSummary(1, 1)).toBe('Mentioned in 1 of 1 run (last 30 days)');
  });

  it('says so when there were no runs in the window', () => {
    expect(formatPromptRunSummary(0, 0)).toBe('No runs in the last 30 days');
  });

  it('never reports more mentions than runs', () => {
    expect(formatPromptRunSummary(12, 10)).toBe('Mentioned in 10 of 10 runs (last 30 days)');
  });

  it('contains no em dashes', () => {
    expect(formatPromptRunSummary(3, 9)).not.toMatch(/—/);
  });
});
