import crypto from 'crypto';
import { renderProm } from '@/lib/metrics';
import { logger } from '@/lib/logger';

/**
 * Prometheus exposition endpoint, gated by an admin token.
 *
 * Why a token instead of admin-cookie auth:
 *   Prometheus scrapers don't ship cookies and don't follow OAuth
 *   redirects. They DO send `Authorization: Bearer <token>` (or a
 *   custom header), so a long-lived secret in env is the standard
 *   pattern for /metrics endpoints. When `METRICS_ADMIN_TOKEN` is
 *   unset the endpoint refuses every request - this is intentional;
 *   leaving /metrics open in dev would leak per-tenant counts to
 *   anyone who can guess the URL.
 *
 * The token is compared with `crypto.timingSafeEqual` so we don't
 * leak length / prefix information through string-comparison timing.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function extractToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1];
  }
  // Some scrapers prefer a custom header (e.g. Grafana Agent's
  // `relabel_configs` pattern). Accept a non-Bearer fallback so the
  // operator can choose whichever is easier to plumb through their
  // scraper config.
  const custom = request.headers.get('x-metrics-token');
  if (custom) return custom;
  return null;
}

export async function GET(request: Request) {
  const expected = process.env.METRICS_ADMIN_TOKEN;
  if (!expected || expected.length < 16) {
    // Fail closed when no token is configured. Logged at warn so an
    // operator who tried to scrape /metrics without setting the env
    // var sees the explanation in their logs without us leaking the
    // exact reason in the response body.
    logger.warn('metrics.endpoint_unconfigured', {
      hint: 'Set METRICS_ADMIN_TOKEN (>=16 chars) to enable Prometheus scraping.',
    });
    return new Response('Metrics disabled: METRICS_ADMIN_TOKEN not configured', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  const supplied = extractToken(request);
  if (!supplied || !timingSafeStringEqual(supplied, expected)) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const body = renderProm();
  // Prometheus content type per the exposition format spec
  // (https://prometheus.io/docs/instrumenting/exposition_formats/):
  // text/plain; version=0.0.4; charset=utf-8
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
