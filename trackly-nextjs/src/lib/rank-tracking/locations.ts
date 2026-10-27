/**
 * City autocomplete, backed by DataForSEO's Google location list cached
 * in rt_locations. The list (~100k rows, free to fetch) is loaded on first
 * use; admins can reload it from the spend view.
 *
 * Without DataForSEO (no login, or the load fails) the bundled city list
 * (data/cities.json, ~41k cities from GeoNames, biggest first, names in
 * Google's "City,Region,Country" form) is loaded instead, under negative
 * codes. Litescrape and Serper take the name, DataForSEO gets
 * location_name for those codes. A later DataForSEO load replaces them.
 */
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureRankSchema } from './schema';
import { dataForSeoProvider, fetchDfsLocations } from './providers/dataforseo';
import { STATE_ABBR } from './queries';

let loading: Promise<number> | null = null;

export async function refreshLocations(): Promise<number> {
  const list = await fetchDfsLocations();
  if (!list.length) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < list.length; i += 2000) {
      const chunk = list.slice(i, i + 2000);
      await client.query(
        `INSERT INTO rt_locations (code, name, country_iso, type, name_lc)
         SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[])
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, country_iso = EXCLUDED.country_iso, type = EXCLUDED.type, name_lc = EXCLUDED.name_lc`,
        [chunk.map((l) => l.code), chunk.map((l) => l.name), chunk.map((l) => l.countryIso), chunk.map((l) => l.type), chunk.map((l) => l.name.toLowerCase())]);
    }
    await client.query('DELETE FROM rt_locations WHERE code < 0');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
  return list.length;
}

/** Stable negative code for a bundled city: 31-bit FNV-1a of the name. */
export function bundledCode(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return -((h >>> 1) || 1);
}

export async function loadBundledCities(): Promise<number> {
  const rows = (await import('./data/cities.json')).default as [string, string][];
  for (let i = 0; i < rows.length; i += 5000) {
    const chunk = rows.slice(i, i + 5000);
    await pool.query(
      `INSERT INTO rt_locations (code, name, country_iso, type, name_lc, rank)
       SELECT code, name, iso, 'City', lower(name), rank
         FROM unnest($1::int[], $2::text[], $3::text[], $4::int[]) AS u(code, name, iso, rank)
       ON CONFLICT (code) DO NOTHING`,
      [chunk.map(([n]) => bundledCode(n)), chunk.map(([n]) => n), chunk.map(([, iso]) => iso), chunk.map((_, j) => i + j)]);
  }
  return rows.length;
}

async function loadAll(): Promise<number> {
  if (dataForSeoProvider.configured()) {
    try {
      const n = await refreshLocations();
      if (n > 0) return n;
    } catch (e) {
      logger.warn('rank.locations_load_failed', { err: (e as Error).message });
    }
  }
  return loadBundledCities();
}

async function ensureLoaded(): Promise<void> {
  await ensureRankSchema();
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM rt_locations`);
  if ((r.rows[0]?.n || 0) > 0) return;
  if (!loading) loading = loadAll().finally(() => { loading = null; });
  try { await loading; } catch (e) { logger.warn('rank.locations_seed_failed', { err: (e as Error).message }); }
}

export interface LocationOption { code: number; name: string; type: string | null }

/** Cities first, then regions and countries, matching the start of the name. */
export async function searchLocations(q: string, limit = 10): Promise<LocationOption[]> {
  const term = q.trim().toLowerCase().replace(/\s*,\s*/g, ',');
  if (term.length < 2) return [];
  await ensureLoaded();
  const r = await pool.query(
    `SELECT code, name, type FROM rt_locations
      WHERE name_lc LIKE $1 OR name_lc LIKE $2
      ORDER BY (type = 'City') DESC, (name_lc LIKE $1) DESC, rank NULLS LAST, (country_iso = 'US') DESC, length(name), name
      LIMIT $3`,
    [term.replace(/[%_]/g, '') + '%', '%,' + term.replace(/[%_]/g, '') + '%', limit]);
  return r.rows;
}

/** Resolve a typed location ("Austin, TX", "Austin,Texas,United States" or a code) to a cached location. */
export async function resolveLocation(input: { code?: number | null; name?: string | null }): Promise<LocationOption | null> {
  await ensureLoaded();
  if (input.code) {
    const r = await pool.query(`SELECT code, name, type FROM rt_locations WHERE code = $1`, [input.code]);
    if (r.rows.length) return r.rows[0];
  }
  const name = String(input.name || '').trim();
  if (!name) return null;
  const exact = await pool.query(`SELECT code, name, type FROM rt_locations WHERE name_lc = $1 LIMIT 1`, [name.toLowerCase().replace(/\s*,\s*/g, ',')]);
  if (exact.rows.length) return exact.rows[0];
  // "Austin, TX" -> "austin,texas": the state narrows Austin, TX from Austin, MN.
  const [city, state] = name.split(',').map((x) => x.trim());
  const full = state ? Object.entries(STATE_ABBR).find(([, ab]) => ab === state.toUpperCase())?.[0] || state : '';
  const hits = await searchLocations(full ? `${city},${full}` : city, 1);
  return hits[0] || (full ? (await searchLocations(city, 1))[0] || null : null);
}
