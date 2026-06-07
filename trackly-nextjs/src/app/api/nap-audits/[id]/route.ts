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
import {
  getNapAudit,
  requeueNapAudit,
  processNapAudit,
  setNapAuditSchedule,
  deleteNapAudit,
  NAP_SCHEDULES,
  type NapAuditSchedule,
} from '@/lib/nap-audits';

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
