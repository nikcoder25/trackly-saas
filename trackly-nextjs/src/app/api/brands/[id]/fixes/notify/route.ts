/**
 * POST /api/brands/[id]/fixes/notify
 *
 * Send a Fix Engine status summary to the brand's configured webhook
 * (Slack/Zapier-compatible). Useful for standups and client updates.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { listFixes } from '@/lib/fix-engine/schema';
import { sendBrandWebhook } from '@/lib/fix-engine/notify';

function bucket(status: string): string {
  if (status === 'detected' || status === 'generating') return 'detected';
  if (status === 'generated' || status === 'preview_ready') return 'review';
  if (status === 'approved' || status === 'shipping') return 'approved';
  if (status === 'shipped' || status === 'verified') return 'live';
  if (status === 'failed' || status === 'reverted') return 'attention';
  return 'detected';
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot send notifications.' }, { status: 403 });

    const fixes = await listFixes(id);
    const c: Record<string, number> = {};
    for (const f of fixes) c[bucket(f.status)] = (c[bucket(f.status)] || 0) + 1;
    const name = (access.brand.name as string | undefined) || 'Brand';
    const text = `*Fix Engine — ${name}*\n`
      + `🔎 Detected: ${c.detected || 0}  ·  ✍️ In review: ${c.review || 0}  ·  ✅ Approved: ${c.approved || 0}  ·  🚀 Live: ${c.live || 0}  ·  ⚠️ Attention: ${c.attention || 0}`;

    const result = await sendBrandWebhook(id, text);
    if (!result.ok) {
      const status = result.reason === 'no_webhook' ? 400 : 502;
      const msg = result.reason === 'no_webhook'
        ? 'No webhook configured for this brand (set one in Brand Setup).'
        : `Failed to send: ${result.detail ?? 'unknown'}`;
      return Response.json({ error: msg }, { status });
    }
    return Response.json({ ok: true });
  } catch (e) {
    logger.error('fix_engine.notify_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to notify', message: (e as Error).message }, { status: 500 });
  }
}
