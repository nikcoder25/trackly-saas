/**
 * AI Volatility Index - read API.
 *
 * Two scopes:
 *
 *   ?brandId=...  The signed-in user's brand: scored live from that brand's
 *                 own successful runs, starting no earlier than the day the
 *                 brand was created. This is what the dashboard page shows.
 *   (no brandId)  The market-wide index computed nightly across the whole
 *                 corpus (see src/lib/volatility.ts).
 *
 * Both require a signed-in user: the numbers are cheap to compute but they
 * are a product surface, not a public feed.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logError, serverError } from '@/lib/api-error';
import { getBrandVolatilitySeries, getVolatilitySeries, MIN_BRAND_COHORT, MIN_COHORT } from '@/lib/volatility';
import { intParam } from '@/lib/query-params';

const MAX_DAYS = 365;

export async function GET(request: Request) {
  try {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    const user = authResult;

    const sp = new URL(request.url).searchParams;
    const days = intParam(sp.get('days'), 90, 7, MAX_DAYS);
    const brandId = sp.get('brandId');

    if (brandId) {
      const access = await getBrandWithAccess(brandId, user.id);
      if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
      const createdAt = (access.brand as { createdAt?: string | Date }).createdAt;
      const { series, since } = await getBrandVolatilitySeries(brandId, createdAt, days);
      return Response.json({ series, days, since, scope: 'brand', minCohort: MIN_BRAND_COHORT });
    }

    const series = await getVolatilitySeries(days);
    return Response.json({
      series,
      days,
      scope: 'market',
      // Surfaced so the UI can explain a null day honestly ("not enough
      // comparable prompts") instead of drawing it as a zero.
      minCohort: MIN_COHORT,
    });
  } catch (e) {
    logError('volatility.get_failed', e);
    return serverError({ message: 'Failed to load the volatility index' });
  }
}
