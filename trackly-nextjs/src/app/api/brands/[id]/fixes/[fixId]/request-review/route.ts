/**
 * POST /api/brands/[id]/fixes/[fixId]/request-review
 *
 * Team approval workflow: ask a teammate to review a generated draft.
 * Logs an `approval.requested` event and notifies the brand's connected
 * tracker/webhook (mentioning the assignee when set). The fix itself stays
 * 'generated' — approval remains the existing approve step.
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

    const fix = await getFix(fixId, id);
    if (!fix) return Response.json({ error: 'Fix not found' }, { status: 404 });
    if (!['generated', 'preview_ready'].includes(fix.status)) {
      return Response.json({ error: 'Only a drafted fix can be sent for review.' }, { status: 400 });
    }

    const mod = getModule(fix.moduleKey);
    const name = (access.brand.name as string | undefined) || 'Brand';
    const who = fix.assignee ? ` — assigned to ${fix.assignee}` : '';
    const result = await notifyBrand(id, {
      title: `[Livesov] Review requested: ${mod?.title ?? fix.moduleKey}`,
      description: [
        `Brand: ${name}`,
        fix.targetUrl ? `Page: ${fix.targetUrl}` : null,
        `Issue: ${fix.summary}${who}`,
        'A draft is ready — open the Fix Engine to approve or edit it.',
      ].filter(Boolean).join('\n'),
    });
    await logFixEvent(fixId, id, user.id, 'approval.requested', {
      assignee: fix.assignee, notified: result.ok ? ('channel' in result ? result.channel : true) : false,
    });
    if (!result.ok && result.reason === 'no_destination') {
      return Response.json({ ok: true, notified: false, note: 'Recorded — connect Linear/Jira or a webhook to notify reviewers automatically.' });
    }
    return Response.json({ ok: true, notified: result.ok });
  } catch (e) {
    logger.error('fix_engine.request_review_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to request review', message: (e as Error).message }, { status: 500 });
  }
}
