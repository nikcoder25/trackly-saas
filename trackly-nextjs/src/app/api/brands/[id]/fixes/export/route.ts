/**
 * GET /api/brands/[id]/fixes/export
 *
 * Download the brand's fixes as CSV (a client-ready report of what was
 * detected, drafted, shipped, and verified). Honours the same status/
 * module/channel filters as the list endpoint.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { listFixes } from '@/lib/fix-engine/schema';
import { getModule } from '@/lib/fix-engine/registry';

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

    const url = new URL(request.url);
    const fixes = await listFixes(id, {
      status: url.searchParams.get('status')?.trim() || undefined,
      moduleKey: url.searchParams.get('module')?.trim() || undefined,
      channel: url.searchParams.get('channel')?.trim() || undefined,
    });

    const header = ['module', 'severity', 'status', 'channel', 'target_url', 'summary', 'score_after', 'error', 'created_at'];
    const rows = fixes.map((f) => [
      getModule(f.moduleKey)?.title || f.moduleKey,
      f.severity, f.status, f.channel, f.targetUrl ?? '', f.summary,
      f.scoreAfter ?? '', f.error ?? '', f.createdAt,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');

    const brandName = (access.brand.name as string | undefined)?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'brand';
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="fix-engine-${brandName}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    logger.error('fix_engine.export_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to export', message: (e as Error).message }, { status: 500 });
  }
}
