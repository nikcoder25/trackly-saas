/**
 * GET /api/edge/serve?token=<connector-token>&file=llms.txt|robots.txt|seo.json
 *
 * Plugin-free edge delivery. A Cloudflare Worker (or any reverse proxy) in
 * front of the customer's site fetches this and:
 *   - serves the result at /llms.txt (and appends our AI directives to
 *     /robots.txt) — the brand's latest "ready" root-file fixes;
 *   - applies seo.json (per-path title / meta description / canonical
 *     overrides from shipped fixes) to HTML responses via HTMLRewriter,
 *     so on-page SEO fixes publish to ANY stack with nothing installed
 *     on the site itself.
 *
 * Auth: the per-brand Connector token (same token used by the plugin) — the
 * Worker holds it. Rate-limited; never returns anything but the brand's own
 * fix content.
 */

import { NextResponse } from 'next/server';
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit';
import { getConnectorByToken } from '@/lib/fix-engine/connections';
import { getLatestRootFileContent, getEdgeSeoOverrides } from '@/lib/fix-engine/schema';
import { logger } from '@/lib/logger';

// file → (module, field where the text lives in `generated`)
const FILES: Record<string, { moduleKey: string; field: string }> = {
  'llms.txt': { moduleKey: 'llms-txt', field: 'content' },
  'robots.txt': { moduleKey: 'robots-ai-access', field: 'directives' },
};

function bearer(request: Request): string {
  const h = request.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Prefer the Authorization header (keeps the token out of URLs/logs);
  // fall back to the query param for simple setups.
  const token = bearer(request) || (url.searchParams.get('token') || '').trim();
  const file = (url.searchParams.get('file') || '').trim();
  const spec = FILES[file];
  if (!token || (!spec && file !== 'seo.json')) return new Response('Not found', { status: 404 });

  const rl = await rateLimit(`edge:serve:${getClientIp(request)}`, 60_000, 120);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    const conn = await getConnectorByToken(token);
    if (!conn) return new Response('Invalid token', { status: 401 });

    // Per-path SEO overrides for the Worker's HTML rewriting. Always 200
    // (an empty map is valid — the Worker just passes pages through).
    if (file === 'seo.json') {
      const overrides = await getEdgeSeoOverrides(conn.brandId);
      return NextResponse.json(
        { v: 1, overrides, count: Object.keys(overrides).length },
        { headers: { 'Cache-Control': 'public, max-age=300' } },
      );
    }

    const content = await getLatestRootFileContent(conn.brandId, spec!.moduleKey, spec!.field);
    if (!content) return new Response('', { status: 404 });
    return new Response(content.endsWith('\n') ? content : content + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        // Short edge cache so updates propagate quickly but we're not hit on
        // every crawler request.
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e) {
    logger.error('fix_engine.edge_serve_failed', { file, err: (e as Error).message });
    return new Response('Error', { status: 500 });
  }
}
