/**
 * POST /api/connect/connector/approve
 *
 * The authenticated half of the one-click Connector handshake. Called from
 * the in-app consent screen (/connect/connector) after the user picks a
 * brand and approves connecting a site. It:
 *   1. verifies the user can manage that brand,
 *   2. checks the plugin callback lives on the same host as the site being
 *      connected (so a code can never be redirected to a foreign origin),
 *   3. creates/rotates the Connector pairing,
 *   4. mints a short-lived, single-use code carrying the credentials, and
 *   5. returns the callback redirect (code + state) for the browser.
 *
 * The plugin then exchanges the code server-to-server at
 * /api/connect/connector/exchange — the token/secret never touch the URL.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { createConnectorPairing, createHandshakeCode } from '@/lib/fix-engine/connections';

function pullUrl(): string {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/connector/instructions`;
}

function host(u: string): string | null {
  try { return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.toLowerCase(); }
  catch { return null; }
}

/** The callback must be http(s), and on the same host as the connected site. */
function callbackOk(callback: string, site: string): boolean {
  let cb: URL;
  try { cb = new URL(callback); } catch { return false; }
  if (cb.protocol !== 'https:' && cb.protocol !== 'http:') return false;
  const isLocal = ['localhost', '127.0.0.1'].includes(cb.hostname);
  if (cb.protocol === 'http:' && !isLocal) return false; // no plaintext except localhost
  const siteHost = host(site);
  return !!siteHost && siteHost === cb.hostname.toLowerCase();
}

interface Body { brandId?: unknown; site?: unknown; callback?: unknown; state?: unknown }

export async function POST(request: Request): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    let body: Body;
    try { body = (await request.json()) as Body; } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const brandId = typeof body.brandId === 'string' ? body.brandId : '';
    const site = typeof body.site === 'string' ? body.site.trim() : '';
    const callback = typeof body.callback === 'string' ? body.callback.trim() : '';
    const state = typeof body.state === 'string' ? body.state : '';
    if (!brandId || !site || !callback) {
      return Response.json({ error: 'brandId, site and callback are required' }, { status: 400 });
    }
    if (!callbackOk(callback, site)) {
      return Response.json({ error: 'The plugin callback must be served over HTTPS on the same domain as the site being connected.' }, { status: 400 });
    }

    const access = await getBrandWithAccess(brandId, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot connect a site.' }, { status: 403 });

    const pairing = await createConnectorPairing(access.brand.userId || user.id, brandId);
    const code = await createHandshakeCode(access.brand.userId || user.id, brandId, {
      token: pairing.token, hmacSecret: pairing.hmacSecret, pullUrl: pullUrl(),
    });

    const redirect = new URL(callback);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', state);
    return Response.json({ ok: true, redirect: redirect.toString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.connector_approve_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to approve connection', message: (e as Error).message }, { status: 500 });
  }
}
