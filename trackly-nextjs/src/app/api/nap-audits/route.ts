/**
 * /api/nap-audits — list (GET) and create (POST) saved NAP audits.
 *
 * GET  → list the current user's saved audits, newest first.
 * POST → create a saved audit (label + canonical NAP + URLs) and run it once.
 */
import { after } from 'next/server';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { extractUrlsFromText, type CanonicalNap } from '@/lib/nap-verify';
import { NAP_MAX_URLS } from '@/lib/nap-audit-run';
import {
  insertNapAudit,
  processNapAudit,
  listNapAudits,
  countNapAudits,
  NAP_MAX_SAVED_AUDITS,
} from '@/lib/nap-audits';

function parseCanonical(input: unknown): CanonicalNap | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name || name.length > 200) return null;
  const clamp = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined;
  return {
    name: name.slice(0, 200),
    phone: clamp(o.phone),
    street: clamp(o.street),
    suite: clamp(o.suite),
    city: clamp(o.city),
    postcode: clamp(o.postcode),
  };
}

export async function GET(request: Request): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  try {
    const audits = await listNapAudits(auth.id);
    return Response.json({ audits }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('nap_audits.list_failed', { err: (e as Error).message, userId: auth.id });
    return Response.json({ error: 'Failed to load audits' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '';
  if (!label) return Response.json({ error: 'A client name / label is required' }, { status: 400 });

  const canonical = parseCanonical(body.canonical);
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
    const existing = await countNapAudits(auth.id);
    if (existing >= NAP_MAX_SAVED_AUDITS) {
      return Response.json(
        { error: `You've reached the limit of ${NAP_MAX_SAVED_AUDITS} saved audits. Delete some to add more.` },
        { status: 403 },
      );
    }
    const audit = await insertNapAudit({ userId: auth.id, label, canonical, urls });
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
