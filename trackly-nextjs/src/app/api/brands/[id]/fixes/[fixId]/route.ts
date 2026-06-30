/**
 * GET /api/brands/[id]/fixes/[fixId]
 *
 * Returns one fix plus its rendered preview block (computed from the
 * module's preview() so the dashboard stays module-agnostic).
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { getFix, getFixEvents } from '@/lib/fix-engine/schema';
import { getModule } from '@/lib/fix-engine/registry';
import type { PreviewBlock } from '@/lib/fix-engine/types';

export async function GET(
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

    let preview: PreviewBlock | null = null;
    const mod = getModule(fix.moduleKey);
    if (mod && fix.generated) {
      try {
        preview = mod.preview(
          {
            key: fix.dedupeKey,
            targetUrl: fix.targetUrl,
            severity: fix.severity,
            summary: fix.summary,
            detected: fix.detected,
            before: fix.beforeSnapshot ?? undefined,
          },
          { generated: fix.generated },
        );
      } catch (e) {
        logger.warn('fix_engine.preview_failed', { fixId, err: (e as Error).message });
      }
    }

    const events = await getFixEvents(fixId);
    return Response.json({ fix, preview, events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logger.error('fix_engine.detail_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to load fix', message: (e as Error).message }, { status: 500 });
  }
}
