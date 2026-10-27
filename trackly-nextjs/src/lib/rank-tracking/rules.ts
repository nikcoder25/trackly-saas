/**
 * Alert rule logic, kept pure so it can be unit tested. Positions are
 * compared with "not ranking" counted as depth + 1 (31 for a top-30
 * check), so dropping out of the results is a loss and coming back in a
 * gain. A gain is a move to a smaller number.
 */
export const RULE_TYPES = [
  'changes_by', 'enters_top', 'leaves_top', 'gains', 'loses', 'new_best', 'new_worst', 'ai_mentioned',
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export const RULE_NEEDS_THRESHOLD: Record<RuleType, boolean> = {
  changes_by: true, enters_top: true, leaves_top: true, gains: true, loses: true,
  new_best: false, new_worst: false, ai_mentioned: false,
};

export interface RankMove {
  prev: number | null | undefined;
  now: number | null;
  depth: number;
  /** Best (lowest) and worst (highest, not ranking = depth + 1) of every earlier check. */
  bestBefore: number | null;
  worstBefore: number | null;
}

const pos = (r: number | null | undefined, depth: number) => (r == null ? depth + 1 : r);

/** Positions gained (positive) or lost (negative) since the previous check. */
export function moveOf(m: RankMove): number {
  if (m.prev === undefined) return 0;
  return pos(m.prev, m.depth) - pos(m.now, m.depth);
}

export function ruleFires(type: RuleType, threshold: number | null, m: RankMove): boolean {
  if (m.prev === undefined) return false; // first check: nothing to compare
  const n = Math.max(1, Number(threshold) || 1);
  const before = pos(m.prev, m.depth);
  const after = pos(m.now, m.depth);
  const delta = before - after;
  switch (type) {
    case 'changes_by': return Math.abs(delta) > n;
    case 'gains': return delta > n;
    case 'loses': return -delta > n;
    case 'enters_top': return after <= n && before > n;
    case 'leaves_top': return before <= n && after > n;
    case 'new_best': return m.now != null && (m.bestBefore == null || m.now < m.bestBefore);
    case 'new_worst': return m.worstBefore != null && after > m.worstBefore;
    default: return false;
  }
}

const label = (r: number | null, depth: number) => (r == null ? `not in the top ${depth}` : `#${r}`);

export function ruleMessage(type: RuleType, threshold: number | null, keyword: string, domain: string, m: RankMove): string {
  const d = moveOf(m);
  const now = label(m.now, m.depth);
  switch (type) {
    case 'enters_top': return `${keyword} entered the top ${threshold} on ${domain} (now ${now})`;
    case 'leaves_top': return `${keyword} left the top ${threshold} on ${domain} (now ${now})`;
    case 'new_best': return `${keyword} reached a new best: ${now} on ${domain}`;
    case 'new_worst': return `${keyword} reached a new worst: ${now} on ${domain}`;
    default:
      return d >= 0
        ? `${keyword} gained ${d} position${d === 1 ? '' : 's'} on ${domain} (now ${now})`
        : `${keyword} lost ${-d} position${d === -1 ? '' : 's'} on ${domain} (now ${now})`;
  }
}

export function describeRule(type: RuleType, threshold: number | null): string {
  switch (type) {
    case 'changes_by': return `Changes by more than ${threshold} positions`;
    case 'enters_top': return `Enters the top ${threshold}`;
    case 'leaves_top': return `Leaves the top ${threshold}`;
    case 'gains': return `Gains more than ${threshold} positions`;
    case 'loses': return `Loses more than ${threshold} positions`;
    case 'new_best': return 'Reaches a new best';
    case 'new_worst': return 'Reaches a new worst';
    case 'ai_mentioned': return 'Gets mentioned by AI';
  }
}
