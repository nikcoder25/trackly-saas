/**
 * /api/nap-audits - list (GET) and create (POST) saved NAP audits.
 *
 * GET  → list the current user's saved audits, newest first.
 * POST → create a saved audit (label + canonical NAP + URLs) and run it once.
 */
import { after } from 'next/server';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { extractUrlsFromText, parseCanonicalNap } from '@/lib/nap-verify';
import { NAP_MAX_URLS } from '@/lib/nap-audit-run';
import {
  insertNapAudit,
  processNapAudit,
  listNapAudits,
  countNapAudits,
  NAP_MAX_SAVED_AUDITS,
} from '@/lib/nap-audits';

export async function GET(request: Request): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  try {
    // brandId is the active-brand scoping filter. If absent we return an
    // empty list rather than every audit on the account - that's the bug
    // that previously leaked another brand's NAP audit into the dropdown.
    const url = new URL(request.url);
    const rawBrandId = url.searchParams.get('brandId');
    const brandId = rawBrandId && rawBrandId.trim() ? rawBrandId.trim() : null;
    if (!brandId) {
      return Response.json({ audits: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    // Verify the brand belongs to the caller before exposing its audits -
    // prevents a crafted brandId from listing another user's audits.
    const brandCheck = await pool.query(
      `SELECT id FROM brands WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [brandId, auth.id],
    );
    if (brandCheck.rows.length === 0) {
      return Response.json({ audits: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const audits = await listNapAudits(auth.id, brandId);
    return Response.json({ audits }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('nap_audits.list_failed', { err: (e as Error).message, userId: auth.id });
    return Response.json({ error: 'Failed to load audits' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;

  // Each audit fans out up to NAP_MAX_URLS outbound fetches (plus paid
  // unblocker calls for blocked pages), so cap creation per user/IP. The
  // limits comfortably cover the auto-split flow (a 5,000-URL paste is 10
  // audits) while stopping a runaway client from queuing hundreds.
  const rl = await checkUserIpRateLimit('nap_audit_create', auth.id, getClientIp(request), {
    user: { max: 30, windowMs: 60 * 60 * 1000 },
    ip: { max: 60, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const brandId = typeof body.brandId === 'string' ? body.brandId.trim() : '';
  if (!brandId) return Response.json({ error: 'brandId is required' }, { status: 400 });

  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '';
  if (!label) return Response.json({ error: 'A client name / label is required' }, { status: 400 });

  const canonical = parseCanonicalNap(body.canonical);
  if (!canonical) {
    return Response.json({ error: 'A business name is required (max 200 chars)' }, { status: 400 });
  }

  const urlText = Array.isArray(body.urls)
    ? (body.urls as unknown[]).filter((u): u is string => typeof u === 'string').join('\n')
    : typeof body.urls === 'string'
      ? body.urls
      : '';
  const urls = extractUrlsFromText(urlText, NAP_MAX_URLS);
  if (urls.length === 0) {
    return Response.json({ error: 'Add at least one citation URL' }, { status: 400 });
  }

  try {
    // Verify the brand belongs to the caller - silent 404 so we don't
    // leak existence of someone else's brand id.
    const brandCheck = await pool.query(
      `SELECT id FROM brands WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [brandId, auth.id],
    );
    if (brandCheck.rows.length === 0) {
      return Response.json({ error: 'Brand not found' }, { status: 404 });
    }
    const existing = await countNapAudits(auth.id);
    if (existing >= NAP_MAX_SAVED_AUDITS) {
      return Response.json(
        { error: `You've reached the limit of ${NAP_MAX_SAVED_AUDITS} saved audits. Delete some to add more.` },
        { status: 403 },
      );
    }
    const audit = await insertNapAudit({ userId: auth.id, brandId, label, canonical, urls });
    // Run in the background so a 50-URL fetch can't blow the request timeout;
    // /api/cron/nap-audits-worker is the cold-restart safety net.
    after(async () => {
      try {
        await processNapAudit(audit.id);
      } catch (e) {
        logger.error('nap_audits.dispatch_failed', { id: audit.id, err: (e as Error).message });
      }
    });
    return Response.json({ audit }, { status: 201 });
  } catch (e) {
    logger.error('nap_audits.create_failed', { err: (e as Error).message, userId: auth.id });
    return Response.json({ error: 'Failed to create audit' }, { status: 500 });
  }
}
