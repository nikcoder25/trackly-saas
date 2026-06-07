/**
 * /api/nap-audits/[id] — detail (GET), re-run (POST), delete (DELETE).
 *
 * GET    → full saved audit incl. per-URL results + score history.
 * POST   → re-run the stored canonical NAP + URLs, append to history.
 * DELETE → remove the saved audit.
 */
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getNapAudit, rerunNapAudit, deleteNapAudit } from '@/lib/nap-audits';

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
    const audit = await rerunNapAudit(auth.id, id);
    if (!audit) return Response.json({ error: 'Audit not found' }, { status: 404 });
    return Response.json({ audit });
  } catch (e) {
    logger.error('nap_audits.rerun_failed', { err: (e as Error).message, id });
    return Response.json({ error: 'Failed to re-run audit' }, { status: 500 });
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
