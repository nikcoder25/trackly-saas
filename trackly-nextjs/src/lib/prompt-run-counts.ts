/**
 * One definition of "a run" for every per-prompt count we show.
 *
 * Query Tracker and the command-palette search both answer "how many times
 * did we ask this prompt, and how often were you mentioned". They used to
 * count different things: Query Tracker counted successful rows in the last
 * 30 days, search counted every row (failed ones included) over 180 days,
 * so the same prompt read "90 runs" on one page and "624 runs" on the other.
 *
 * A run is one engine answering one prompt in one scan: a distinct
 * (batch_id, platform) pair among successful prompt_runs rows. Deduping on
 * that key means a retried or double-written row never counts twice, and a
 * row with no batch_id still counts once by its own id. Both surfaces use
 * the same 30-day window.
 */

/** The window every per-prompt run count is reported over. */
export const RUN_COUNT_WINDOW_DAYS = 30;

/** SQL expression identifying one run (one engine, one scan). */
export const RUN_KEY_SQL = `COALESCE(batch_id, id) || ':' || COALESCE(platform, '')`;

/**
 * Distinct runs in the current GROUP BY. `onlyWhere` narrows which rows
 * count (e.g. a success/window condition) without filtering the group out.
 */
export function distinctRunsSql(onlyWhere?: string): string {
  return onlyWhere
    ? `COUNT(DISTINCT CASE WHEN ${onlyWhere} THEN ${RUN_KEY_SQL} END)::int`
    : `COUNT(DISTINCT ${RUN_KEY_SQL})::int`;
}

/** Distinct runs in the current GROUP BY that mentioned the brand. */
export function distinctMentionedRunsSql(onlyWhere?: string): string {
  const cond = onlyWhere ? `mentioned AND ${onlyWhere}` : 'mentioned';
  return `COUNT(DISTINCT CASE WHEN ${cond} THEN ${RUN_KEY_SQL} END)::int`;
}

/**
 * Plain-language summary of a prompt's runs, e.g.
 * "Mentioned in 45 of 90 runs (last 30 days)".
 */
export function formatPromptRunSummary(
  mentions: number,
  runs: number,
  windowDays: number = RUN_COUNT_WINDOW_DAYS,
): string {
  const m = Math.max(0, Math.round(Number(mentions) || 0));
  const r = Math.max(0, Math.round(Number(runs) || 0));
  if (r === 0) return `No runs in the last ${windowDays} days`;
  return `Mentioned in ${Math.min(m, r)} of ${r} run${r === 1 ? '' : 's'} (last ${windowDays} days)`;
}
