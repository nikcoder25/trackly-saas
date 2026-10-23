/**
 * Per-prompt status shared by every page that labels a tracked question as
 * winning or not (Query Tracker, Overview "Buyer questions").
 *
 * Before this helper the Query Tracker called a prompt "Winning" at a 30%
 * mention rate while the Overview required at least half the engines to
 * name the brand, so the same question could read "Winning" on one page and
 * "Missing" on the other. Both now classify through this one rule.
 *
 * The rate is mentions / answered results (errors excluded), rounded to a
 * whole percent, the same formula the Query Tracker's VISIBILITY column shows.
 */

/** At or above this mention rate a prompt is winning. */
export const WINNING_RATE = 30;
/** Below this mention rate a prompt is at risk. */
export const LOSING_RATE = 15;

export type PromptStatus = 'winning' | 'tracking' | 'losing' | 'none';

/** Rounded mention rate in percent. 0 when nothing was answered. */
export function promptMentionRate(mentioned: number, answered: number): number {
  if (!(answered > 0)) return 0;
  return Math.round((Math.max(0, mentioned) / answered) * 100);
}

/** Status from an already-rounded rate plus the number of answered results. */
export function promptStatusFromRate(rate: number, answered: number): PromptStatus {
  if (!(answered > 0)) return 'none';
  if (rate >= WINNING_RATE) return 'winning';
  if (rate < LOSING_RATE) return 'losing';
  return 'tracking';
}

/** Status from raw counts: how many answers named the brand out of how many answered. */
export function promptStatus(mentioned: number, answered: number): PromptStatus {
  return promptStatusFromRate(promptMentionRate(mentioned, answered), answered);
}

export function isWinningPrompt(mentioned: number, answered: number): boolean {
  return promptStatus(mentioned, answered) === 'winning';
}
