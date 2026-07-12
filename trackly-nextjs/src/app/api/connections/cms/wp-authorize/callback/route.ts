/**
 * GET /api/connections/cms/wp-authorize/callback
 *
 * Fixed redirect target for the no-plugin WordPress connect flow. WordPress
 * sends the user here after they approve the Application Password, appending
 * ?site_url=&user_login=&password= to our success_url (which already carries
 * the signed ?state). We:
 *   1. authenticate the user (browser carries the session cookie),
 *   2. verify the signed state and that it belongs to this user,
 *   3. verify the freshly minted app password against the live site,
 *   4. store the CMS connection (encrypted), and
 *   5. redirect back to the dashboard Fix Engine tab.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { verifyState } from '@/lib/fix-engine/gsc-state';
import { upsertConnection } from '@/lib/fix-engine/connections';
import { getCmsAdapter } from '@/lib/fix-engine/cms';

function dash(path: string): string {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path}`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const siteUrl = url.searchParams.get('site_url');
  const userLogin = url.searchParams.get('user_login');
  const password = url.searchParams.get('password');

  if (!state || !siteUrl || !userLogin || !password) {
    return Response.redirect(dash(`/dashboard-v2?wp=invalid#fixes`), 302);
  }

  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return Response.redirect(dash(`/login`), 302);
  const user = auth;

  const payload = verifyState(state);
  if (!payload || payload.userId !== user.id) {
    return Response.redirect(dash(`/dashboard-v2?wp=invalid#fixes`), 302);
  }
  const brandId = payload.brandId;

  try {
    const creds = { username: userLogin, appPassword: password };
    const adapter = getCmsAdapter('wordpress')!;
    // Confirm the credentials actually work before we store them.
    const check = await adapter.verify(creds, siteUrl);
    if (!check.ok) {
      logger.warn('fix_engine.wp_authorize.verify_failed', { brandId, detail: check.detail });
      return Response.redirect(dash(`/dashboard-v2?wp=verifyfailed#fixes`), 302);
    }
    await upsertConnection({
      userId: user.id,
      brandId,
      provider: 'cms',
      cmsType: 'wordpress',
      siteUrl,
      creds,
      meta: { connectedVia: 'application-password' },
    });
    return Response.redirect(dash(`/dashboard-v2?wp=connected#fixes`), 302);
  } catch (e) {
    logger.error('fix_engine.wp_authorize.callback_failed', { brandId, err: (e as Error).message });
    return Response.redirect(dash(`/dashboard-v2?wp=error#fixes`), 302);
  }
}
