/**
 * Fix Engine - GEO Health Score.
 *
 * A single 0-100 readiness score computed from the brand's open fix queue,
 * so the dashboard has a needle that moves the moment fixes ship — unlike
 * SOV, which only moves when the brand's tracking re-runs. Deterministic and
 * dependency-free so it's trivially testable.
 */

import type { FixRow, FixSeverity, FixStatus } from './types';

// Statuses that still count against the site (work not live yet).
const OPEN: ReadonlySet<FixStatus> = new Set([
  'detected', 'generating', 'generated', 'preview_ready', 'approved', 'failed',
] as FixStatus[]);

const SEVERITY_PENALTY: Record<FixSeverity, number> = {
  critical: 12,
  high: 8,
  medium: 4,
  low: 2,
};

export interface HealthScore {
  score: number;          // 0-100
  openIssues: number;
  resolvedIssues: number; // shipped/verified/staged
  penalty: number;
}

export function computeGeoHealthScore(fixes: Pick<FixRow, 'status' | 'severity'>[]): HealthScore {
  let penalty = 0;
  let openIssues = 0;
  let resolvedIssues = 0;
  for (const f of fixes) {
    if (OPEN.has(f.status)) {
      openIssues++;
      penalty += SEVERITY_PENALTY[f.severity] ?? 4;
    } else if (f.status === 'shipped' || f.status === 'verified' || f.status === 'staged') {
      resolvedIssues++;
    }
  }
  return { score: Math.max(0, 100 - penalty), openIssues, resolvedIssues, penalty };
}
