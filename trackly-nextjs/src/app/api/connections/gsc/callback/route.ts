/**
 * GET /api/connections/gsc/callback
 *
 * Fixed OAuth redirect URI for the GSC connect flow. Google sends the
 * user here with ?code & ?state (or ?error). We:
 *   1. authenticate the user (browser carries the session cookie),
 *   2. verify the signed state and that it belongs to this user,
 *   3. exchange the code for tokens,
 *   4. pick the GSC property matching the brand website,
 *   5. store the connection (encrypted), and
 *   6. redirect back to the dashboard Fix Engine tab.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { exchangeCode, listSites, matchSite } from '@/lib/fix-engine/gsc';
import { verifyState } from '@/lib/fix-engine/gsc-state';
import { upsertConnection } from '@/lib/fix-engine/connections';

function dash(path: string): string {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path}`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const err = url.searchParams.get('error');
  if (err) return Response.redirect(dash(`/dashboard/fixes?gsc=denied`), 302);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return Response.redirect(dash(`/dashboard/fixes?gsc=invalid`), 302);

  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return Response.redirect(dash(`/login`), 302);
  const user = auth;

  const payload = verifyState(state);
  if (!payload || payload.userId !== user.id) {
    return Response.redirect(dash(`/dashboard/fixes?gsc=invalid`), 302);
  }
  const brandId = payload.brandId;

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      // No refresh token means we can't run background fixes. This happens
      // when the user previously consented; prompt=consent should prevent
      // it, but guard anyway.
      logger.warn('fix_engine.gsc.no_refresh_token', { brandId });
    }

    // Resolve which verified property to use for this brand.
    let siteUrl: string | null = null;
    let allSites: string[] = [];
    try {
      const sites = await listSites(tokens.access_token);
      allSites = sites.map((s) => s.siteUrl);
      const brandRow = await pool.query(`SELECT data FROM brands WHERE id = $1 LIMIT 1`, [brandId]);
      const website = (brandRow.rows[0]?.data as { website?: string } | undefined)?.website;
      siteUrl = matchSite(sites, website);
    } catch (e) {
      logger.warn('fix_engine.gsc.list_sites_failed', { brandId, err: (e as Error).message });
    }

    await upsertConnection({
      userId: user.id,
      brandId,
      provider: 'gsc',
      siteUrl,
      creds: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      },
      meta: { siteUrl, allSites },
    });

    return Response.redirect(dash(`/dashboard/fixes?gsc=connected`), 302);
  } catch (e) {
    logger.error('fix_engine.gsc.callback_failed', { brandId, err: (e as Error).message });
    return Response.redirect(dash(`/dashboard/fixes?gsc=error`), 302);
  }
}
