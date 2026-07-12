/**
 * GET /api/brands/[id]/fixes/[fixId]/file
 *
 * Plugin-free fallback for Channel-B (site-root file) fixes. WordPress core
 * has no REST endpoint to write `/llms.txt` or `/robots.txt`, so when a brand
 * has no Connector the user can download the generated file here and drop it
 * at their site root once, then Re-check to verify it's live.
 *
 * Returns the file content as a text/plain attachment.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getFix } from '@/lib/fix-engine/schema';

interface FileOut { filename: string; content: string; note?: string }

/** Resolve the downloadable file for a Channel-B fix, at any stage. */
function fileFor(fix: { moduleKey: string; generated: Record<string, unknown> | null; afterSnapshot: Record<string, unknown> | null }): FileOut | null {
  const after = fix.afterSnapshot || {};
  const gen = fix.generated || {};
  // Prefer the exact payload that was shipped; fall back to the draft.
  const path = typeof after.path === 'string' ? after.path : null;

  if (fix.moduleKey === 'llms-txt') {
    const content = String(after.content ?? gen.content ?? '');
    return content ? { filename: 'llms.txt', content } : null;
  }
  if (fix.moduleKey === 'robots-ai-access') {
    const content = String(after.content ?? gen.directives ?? '');
    return content
      ? { filename: 'robots.txt', content, note: 'Append these lines to your existing robots.txt (or use as-is if you have none).' }
      : null;
  }
  // Generic write_file fix: name by the target path's basename.
  const content = typeof after.content === 'string' ? after.content : null;
  if (path && content) {
    const base = path.split('/').filter(Boolean).pop() || 'file.txt';
    return { filename: base, content };
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fixId: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  const { id, fixId } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const fix = await getFix(fixId, id);
  if (!fix) return Response.json({ error: 'Fix not found' }, { status: 404 });
  if (fix.channel !== 'B') {
    return Response.json({ error: 'This fix is applied via the CMS API, not a downloadable file.' }, { status: 400 });
  }
  const out = fileFor(fix);
  if (!out) return Response.json({ error: 'Generate the fix first to produce its file.' }, { status: 400 });

  return new Response(out.content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${out.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
