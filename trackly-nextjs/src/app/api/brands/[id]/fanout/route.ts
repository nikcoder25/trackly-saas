/**
 * Fan-out queries for a brand: the sub-queries engines reported issuing to
 * a search index while answering its tracked prompts.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { logError, serverError } from '@/lib/api-error';
import { getFanoutSummary } from '@/lib/fanout';
import { intParam } from '@/lib/query-params';

const MAX_DAYS = 365;
const MAX_LIMIT = 500;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    const user = authResult;
    const { id } = await params;

    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

    const sp = new URL(request.url).searchParams;
    const days = intParam(sp.get('days'), 30, 1, MAX_DAYS);
    const limit = intParam(sp.get('limit'), 200, 1, MAX_LIMIT);

    const summary = await getFanoutSummary(id, days, limit);
    return Response.json({ ...summary, days });
  } catch (e) {
    logError('fanout.get_failed', e);
    return serverError({ message: 'Failed to load fan-out queries' });
  }
}
