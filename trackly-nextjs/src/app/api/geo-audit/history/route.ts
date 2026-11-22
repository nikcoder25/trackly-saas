import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getHistory, listTrackedPages, pageUrlKey, resetPage, compareSnapshots } from '@/lib/page-score-history';
import { normalizeAuditUrl } from '@/lib/geo-audit-utils';
import { logError, serverError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

// GET            -> every page the user has audited, with before / after.
// GET ?url=<u>   -> that page's full score history and its comparison.
export async function GET(request: Request) {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  try {
    const url = new URL(request.url).searchParams.get('url');
    if (url) {
      const history = await getHistory(auth.id, pageUrlKey(normalizeAuditUrl(url)));
      const comparison = history.length
        ? compareSnapshots(history[0], history[history.length - 1], history.length)
        : null;
      return Response.json({ history, comparison }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const pages = await listTrackedPages(auth.id);
    return Response.json({ pages }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    logError('geo_audit.history_failed', e);
    return serverError({ message: 'Could not load your score history.' });
  }
}

// DELETE ?url=<u> -> forget the page's history; the next audit is the new "before".
export async function DELETE(request: Request) {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url).searchParams.get('url');
  if (!url) return Response.json({ error: 'url is required' }, { status: 400 });
  try {
    const removed = await resetPage(auth.id, pageUrlKey(normalizeAuditUrl(url)));
    return Response.json({ ok: true, removed });
  } catch (e) {
    logError('geo_audit.history_reset_failed', e);
    return serverError({ message: 'Could not reset this page.' });
  }
}
