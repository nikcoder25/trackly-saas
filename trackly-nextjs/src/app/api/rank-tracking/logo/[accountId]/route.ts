/**
 * GET /api/rank-tracking/logo/:accountId - the agency logo set in rank
 * tracking branding, served from our own origin so the page CSP
 * (img-src 'self') allows it on client views. Fetched through safeFetch
 * (SSRF guard), raster images only (no SVG: it can carry script), 1 MB max.
 */
import { safeFetch } from '@/lib/safe-fetch';
import { getBranding } from '@/lib/rank-tracking/reports';

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function GET(_request: Request, { params }: { params: Promise<{ accountId: string }> }): Promise<Response> {
  const { accountId } = await params;
  const b = await getBranding(accountId).catch(() => null);
  if (!b?.logoUrl) return new Response(null, { status: 404 });
  try {
    const res = await safeFetch(b.logoUrl, { timeoutMs: 8000, maxBytes: 1_000_000 });
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !TYPES.has(type)) return new Response(null, { status: 404 });
    const body = new Uint8Array(await res.arrayBuffer());
    return new Response(body, {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
