/**
 * /api/nap-audits/[id] — detail (GET), re-run (POST), delete (DELETE).
 *
 * GET    → full saved audit incl. per-URL results + score history.
 * POST   → re-run the stored canonical NAP + URLs, append to history.
 * DELETE → remove the saved audit.
 */
import { after } from 'next/server';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { extractUrlsFromText, type CanonicalNap } from '@/lib/nap-verify';
import { NAP_MAX_URLS } from '@/lib/nap-audit-run';
import {
  getNapAudit,
  requeueNapAudit,
  processNapAudit,
  setNapAuditSchedule,
  updateNapAudit,
  deleteNapAudit,
  NAP_SCHEDULES,
  type NapAuditSchedule,
} from '@/lib/nap-audits';

function parseCanonical(input: unknown): CanonicalNap | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name || name.length > 200) return null;
  const clamp = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : undefined);
  return { name: name.slice(0, 200), phone: clamp(o.phone), street: clamp(o.street), suite: clamp(o.suite), city: clamp(o.city), postcode: clamp(o.postcode) };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    const audit = await getNapAudit(auth.id, id);
    if (!audit) return Response.json({ error: 'Audit not found' }, { status: 404 });
    return Response.json({ audit }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('nap_audits.get_failed', { err: (e as Error).message, id });
    return Response.json({ error: 'Failed to load audit' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    const audit = await requeueNapAudit(auth.id, id);
    if (!audit) return Response.json({ error: 'Audit not found' }, { status: 404 });
    after(async () => {
      try {
        await processNapAudit(id);
      } catch (e) {
        logger.error('nap_audits.rerun_dispatch_failed', { err: (e as Error).message, id });
      }
    });
    return Response.json({ audit });
  } catch (e) {
    logger.error('nap_audits.rerun_failed', { err: (e as Error).message, id });
    return Response.json({ error: 'Failed to re-run audit' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const schedule = body.schedule as NapAuditSchedule;
  if (!NAP_SCHEDULES.includes(schedule)) {
    return Response.json({ error: `schedule must be one of ${NAP_SCHEDULES.join(', ')}` }, { status: 400 });
  }
  try {
    const audit = await setNapAuditSchedule(auth.id, id, schedule);
    if (!audit) return Response.json({ error: 'Audit not found' }, { status: 404 });
    return Response.json({ audit });
  } catch (e) {
    logger.error('nap_audits.schedule_failed', { err: (e as Error).message, id });
    return Response.json({ error: 'Failed to update schedule' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '';
  if (!label) return Response.json({ error: 'A client name / label is required' }, { status: 400 });
  const canonical = parseCanonical(body.canonical);
  if (!canonical) return Response.json({ error: 'A business name is required (max 200 chars)' }, { status: 400 });
  const urlText = Array.isArray(body.urls)
    ? (body.urls as unknown[]).filter((u): u is string => typeof u === 'string').join('\n')
    : typeof body.urls === 'string' ? body.urls : '';
  const urls = extractUrlsFromText(urlText, NAP_MAX_URLS);
  if (urls.length === 0) return Response.json({ error: 'Add at least one citation URL' }, { status: 400 });

  try {
    const updated = await updateNapAudit(auth.id, id, { label, canonical, urls });
    if (!updated) return Response.json({ error: 'Audit not found' }, { status: 404 });
    // Re-run against the new inputs so results aren't stale.
    const queued = await requeueNapAudit(auth.id, id);
    if (queued) {
      after(async () => {
        try {
          await processNapAudit(id);
        } catch (e) {
          logger.error('nap_audits.edit_dispatch_failed', { err: (e as Error).message, id });
        }
      });
    }
    return Response.json({ audit: queued ?? updated });
  } catch (e) {
    logger.error('nap_audits.update_failed', { err: (e as Error).message, id });
    return Response.json({ error: 'Failed to update audit' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  try {
    const ok = await deleteNapAudit(auth.id, id);
    if (!ok) return Response.json({ error: 'Audit not found' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    logger.error('nap_audits.delete_failed', { err: (e as Error).message, id });
    return Response.json({ error: 'Failed to delete audit' }, { status: 500 });
  }
}
