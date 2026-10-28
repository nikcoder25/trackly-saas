/**
 * Server-side persistence for signup attribution.
 *
 * Split out from src/lib/attribution.ts on purpose: that module is imported
 * by the signup form (a client component) for the dropdown options, and
 * pulling `pool` into it would drag the pg driver into the browser bundle.
 * Pure data and classification live there; anything touching the database
 * lives here.
 */
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { normaliseAttribution, type AttributionInput } from '@/lib/attribution';

export type SignupMethod = 'email' | 'google';

/**
 * Records the attribution row for a newly-created user.
 *
 * Never throws, and never blocks the signup from succeeding. An analytics
 * insert that fails must not cost a registration, so callers fire this and
 * carry on - failures land in the logs instead of the response.
 *
 * ON CONFLICT DO NOTHING makes it idempotent per user: the first answer a
 * user gives is the one kept, so a retried request cannot overwrite it.
 */
export async function recordSignupAttribution(
  userId: string,
  method: SignupMethod,
  input: AttributionInput | undefined | null
): Promise<void> {
  try {
    const a = normaliseAttribution(input);
    await pool.query(
      `INSERT INTO signup_attribution (
         user_id, source, source_detail, signup_method,
         referrer, referrer_domain, landing_path,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         gclid, promo_code
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        userId, a.source, a.sourceDetail, method,
        a.referrer, a.referrerDomain, a.landingPath,
        a.utmSource, a.utmMedium, a.utmCampaign, a.utmTerm, a.utmContent,
        a.gclid, a.promoCode,
      ]
    );
  } catch (e) {
    logger.warn('attribution.record_failed', {
      user_id: userId,
      error: (e as Error).message,
    });
  }
}
