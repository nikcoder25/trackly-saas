/**
 * Account-wide tracked-prompt quota helpers (v3 spec, 2026-04-27).
 *
 * Tracked prompts moved from per-brand to account-wide in v3. Each
 * brand stores its own list under `data.queries`, so the authoritative
 * usage figure is `SUM(jsonb_array_length(data->'queries'))` across
 * every brand owned by the account.
 *
 * Two helpers are exported:
 *   - countTrackedPromptsForOwner(ownerId): total across all owned brands
 *   - countTrackedPromptsForOwnerExcluding(ownerId, excludeBrandId):
 *     same, minus one brand. Used on PUT /api/brands/[id] so the caller
 *     can supply the new query list and add it to the rest-of-account
 *     total without double-counting the brand currently being edited.
 */

import type { Pool } from 'pg';
import { pool as defaultPool } from './db';

interface CountOptions {
  /** Override pool (used by tests with a stub). Defaults to `pool` from `@/lib/db`. */
  pool?: Pool;
}

export async function countTrackedPromptsForOwner(
  ownerId: string,
  opts: CountOptions = {},
): Promise<number> {
  const p = opts.pool || defaultPool;
  const r = await p.query(
    `SELECT COALESCE(SUM(jsonb_array_length(COALESCE(data->'queries', '[]'::jsonb))), 0)::int AS n
       FROM brands WHERE user_id = $1`,
    [ownerId],
  );
  return Number(r.rows[0]?.n) || 0;
}

export async function countTrackedPromptsForOwnerExcluding(
  ownerId: string,
  excludeBrandId: string,
  opts: CountOptions = {},
): Promise<number> {
  const p = opts.pool || defaultPool;
  const r = await p.query(
    `SELECT COALESCE(SUM(jsonb_array_length(COALESCE(data->'queries', '[]'::jsonb))), 0)::int AS n
       FROM brands WHERE user_id = $1 AND id <> $2`,
    [ownerId, excludeBrandId],
  );
  return Number(r.rows[0]?.n) || 0;
}
