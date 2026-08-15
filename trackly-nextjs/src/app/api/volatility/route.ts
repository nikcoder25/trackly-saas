/**
 * AI Volatility Index - read API.
 *
 * The index is a market-wide signal computed across the whole corpus, not
 * a per-brand metric, so this route is brand-agnostic. It still requires a
 * signed-in user: the numbers are cheap to compute but they are a product
 * surface, not a public feed.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logError, serverError } from '@/lib/api-error';
import { getVolatilitySeries, MIN_COHORT } from '@/lib/volatility';

const MAX_DAYS = 365;

export async function GET(request: Request) {
  try {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;

    const raw = Number(new URL(request.url).searchParams.get('days'));
    const days = Number.isFinite(raw) ? Math.min(MAX_DAYS, Math.max(7, Math.trunc(raw))) : 90;

    const series = await getVolatilitySeries(days);
    return Response.json({
      series,
      days,
      // Surfaced so the UI can explain a null day honestly ("not enough
      // comparable prompts") instead of drawing it as a zero.
      minCohort: MIN_COHORT,
    });
  } catch (e) {
    logError('volatility.get_failed', e);
    return serverError({ message: 'Failed to load the volatility index' });
  }
}
