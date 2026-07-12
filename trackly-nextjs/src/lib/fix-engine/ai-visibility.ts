/**
 * Fix Engine - AI visibility snapshots.
 *
 * The product's core metric is Share-of-Voice (SOV): the fraction of the
 * brand's tracked AI prompts where the brand was mentioned. We snapshot it
 * at ship time and at recheck time so a fix can show its before/after
 * effect on how AI assistants actually answer — read-only, from the
 * brand's existing run history (no extra/expensive provider calls).
 *
 * Caveat surfaced in the UI: SOV is brand-level and moves only when the
 * brand's tracking runs again after the fix ships, so this is a
 * directional signal, not per-fix attribution.
 */

import { pool } from '@/lib/db';
import { computeOverviewSov } from '@/lib/run-sov';

export interface AiVisibilitySnapshot {
  sov: number;       // 0-100
  at: string;        // run date / capture time
  source: 'run';
}

interface BrandRunEntry { sov?: number | null; allResults?: { error?: boolean; mentioned?: boolean }[] | null; date?: string }

/**
 * Read the brand's latest completed run and return its SOV as a snapshot,
 * or null when the brand has no run history yet.
 */
export async function getBrandAiVisibility(brandId: string): Promise<AiVisibilitySnapshot | null> {
  try {
    const res = await pool.query(`SELECT data FROM brands WHERE id = $1 LIMIT 1`, [brandId]);
    const data = res.rows[0]?.data as { runs?: BrandRunEntry[] } | undefined;
    const runs = data?.runs;
    if (!Array.isArray(runs) || runs.length === 0) return null;
    const last = runs[runs.length - 1];
    return { sov: computeOverviewSov(last), at: last.date || new Date().toISOString().slice(0, 10), source: 'run' };
  } catch {
    return null;
  }
}
