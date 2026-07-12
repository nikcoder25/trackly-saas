/**
 * GET /api/brands/[id]/connections/cms/wp-authorize/start
 *
 * Begins the *no-plugin* WordPress connect flow using WordPress core's
 * built-in Application Passwords authorization screen
 * (wp-admin/authorize-application.php). The user approves "Livesov" once in
 * their own WP admin and is redirected back to our callback with a freshly
 * minted application password — no plugin to install, nothing to copy.
 *
 * Returns { url }; the dashboard redirects the browser to it.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { signState } from '@/lib/fix-engine/gsc-state';

// Stable identifier for our app on the user's site (lets them find/revoke
// the application password later under Users → Profile).
const APP_ID = 'b9b2a1d4-6c3e-4a1f-9f2a-11ce0f5a7e10';

function appBase(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function siteOrigin(raw: string): string | null {
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const isLocal = ['localhost', '127.0.0.1'].includes(u.hostname);
    // WordPress only exposes Application Passwords over HTTPS (or locally).
    if (u.protocol === 'http:' && !isLocal) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') {
    return Response.json({ error: 'Viewers cannot connect integrations.' }, { status: 403 });
  }

  const reqUrl = new URL(request.url);
  const siteParam = reqUrl.searchParams.get('site') || (access.brand.website as string | undefined) || '';
  const origin = siteOrigin(siteParam);
  if (!origin) {
    return Response.json({ error: 'Enter your WordPress site URL (it must be served over HTTPS).' }, { status: 400 });
  }

  const state = signState(id, user.id);
  const successUrl = `${appBase()}/api/connections/cms/wp-authorize/callback?state=${encodeURIComponent(state)}`;
  const rejectUrl = `${appBase()}/dashboard/fixes?wp=rejected`;

  const authorize = `${origin}/wp-admin/authorize-application.php`
    + `?app_name=${encodeURIComponent('Livesov Fix Engine')}`
    + `&app_id=${APP_ID}`
    + `&success_url=${encodeURIComponent(successUrl)}`
    + `&reject_url=${encodeURIComponent(rejectUrl)}`;

  return Response.json({ url: authorize, site: origin }, { headers: { 'Cache-Control': 'no-store' } });
}
