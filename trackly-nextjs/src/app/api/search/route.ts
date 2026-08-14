/**
 * GET /api/search?q=...&brandId=...
 *
 * Backs the dashboard command palette. Returns prompts, mentions and sources
 * matching the query, scoped to brands the caller can actually read.
 *
 * Rate limited more tightly than a normal read endpoint: the palette fires on
 * keystroke (debounced client-side), so this is the one dashboard route where
 * a single user legitimately generates a burst of requests - and equally the
 * one where a stuck client could hammer three ILIKE scans in a loop.
 */
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logError, serverError } from '@/lib/api-error';
import { runSearch, MIN_QUERY_LENGTH, MAX_QUERY_LENGTH } from '@/lib/search';

export async function GET(request: Request) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  // Keyed on the user, not the IP: colleagues behind one office NAT should
  // not exhaust each other's search budget.
  const rl = await rateLimit('search:' + user.id, 60 * 1000, 60);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const url = new URL(request.url);
  const rawQuery = (url.searchParams.get('q') || '').trim();
  const brandId = url.searchParams.get('brandId') || null;

  // Too-short queries are a normal state (the user is still typing), not an
  // error - return the empty shape so the client renders "keep typing"
  // rather than an error banner.
  if (rawQuery.length < MIN_QUERY_LENGTH) {
    return Response.json({ query: rawQuery, results: { prompts: [], mentions: [], sources: [] }, total: 0 });
  }

  const query = rawQuery.slice(0, MAX_QUERY_LENGTH);

  try {
    const results = await runSearch(user.id, query, { brandId });
    const total = results.prompts.length + results.mentions.length + results.sources.length;
    return Response.json({ query, results, total });
  } catch (e) {
    logError('search.failed', e);
    return serverError({ message: 'Search failed' });
  }
}
