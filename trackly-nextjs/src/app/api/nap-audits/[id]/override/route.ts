/**
 * POST /api/nap-audits/[id]/override - manually mark a citation OK (or undo it).
 *
 * Body: { url: string, ok: boolean }. Counts the URL as a full match in the
 * consistency score - for pages the fetcher was blocked from but the operator
 * verified by hand. Recomputes and persists the score.
 */
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { setNapAuditOverride } from '@/lib/nap-audits';

export async function POST(
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
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) return Response.json({ error: 'url is required' }, { status: 400 });
  const ok = body.ok !== false; // default to marking OK

  try {
    const audit = await setNapAuditOverride(auth.id, id, url, ok);
    if (!audit) return Response.json({ error: 'Audit not found' }, { status: 404 });
    return Response.json({ audit });
  } catch (e) {
    logger.error('nap_audits.override_failed', { err: (e as Error).message, id });
    return Response.json({ error: 'Failed to update verification' }, { status: 500 });
  }
}
