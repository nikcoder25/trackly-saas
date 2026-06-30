/**
 * POST /api/brands/[id]/fixes/[fixId]/ticket
 *
 * Create a native issue for this fix in the brand's connected tracker
 * (Linear / Jira), falling back to the webhook when none is connected.
 * Hands the fix off to a dev team without leaving Livesov.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { getFix, logFixEvent } from '@/lib/fix-engine/schema';
import { getModule } from '@/lib/fix-engine/registry';
import { notifyBrand } from '@/lib/fix-engine/notify';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; fixId: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id, fixId } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot create tickets.' }, { status: 403 });

    const fix = await getFix(fixId, id);
    if (!fix) return Response.json({ error: 'Fix not found' }, { status: 404 });

    const mod = getModule(fix.moduleKey);
    const name = (access.brand.name as string | undefined) || 'Brand';
    const title = `[Livesov] ${mod?.title ?? fix.moduleKey}: ${fix.summary}`.slice(0, 240);
    const lines = [
      `Brand: ${name}`,
      `Fix: ${mod?.title ?? fix.moduleKey} (${fix.severity})`,
      fix.targetUrl ? `Page: ${fix.targetUrl}` : null,
      `Status: ${fix.status}`,
      `Issue: ${fix.summary}`,
      fix.note ? `Note: ${fix.note}` : null,
    ].filter(Boolean) as string[];

    const result = await notifyBrand(id, { title, description: lines.join('\n') });
    if (!result.ok) {
      const status = result.reason === 'no_destination' ? 400 : 502;
      const msg = result.reason === 'no_destination'
        ? 'Connect Linear or Jira (or set a webhook) to create tickets.'
        : `Failed to create ticket: ${result.detail ?? 'unknown'}`;
      return Response.json({ error: msg }, { status });
    }
    await logFixEvent(fixId, id, user.id, 'ticket.created', { channel: result.channel, url: 'url' in result ? result.url : undefined });
    return Response.json({ ok: true, channel: result.channel, url: 'url' in result ? result.url : undefined });
  } catch (e) {
    logger.error('fix_engine.ticket_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to create ticket', message: (e as Error).message }, { status: 500 });
  }
}
