/**
 * Query-string parsing helpers.
 *
 * These exist because the obvious version is wrong in a way that is easy to
 * ship and hard to notice:
 *
 *   const n = Number(searchParams.get('limit'));
 *   if (!Number.isFinite(n)) return fallback;     // never fires
 *   return Math.min(max, Math.max(min, n));       // clamps to `min`
 *
 * `Number(null)` is `0`, not `NaN` — and `Number('')` is `0` too. So an
 * absent parameter passes the finite check, clamps to the minimum, and the
 * fallback is dead code. A `?limit=` default of 200 silently became 1, and
 * a 30-day window silently became 1 day: endpoints that looked like they
 * were returning "no data" were really being told to return one row.
 */

/**
 * Parse a bounded integer query parameter.
 *
 * Absent, empty and non-numeric values all yield `fallback` — the caller's
 * intended default — rather than being coerced to zero and clamped.
 */
export function intParam(
  raw: string | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null || raw === undefined) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
