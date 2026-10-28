/**
 * POST   /api/rank-tracking/keywords - add keywords to a website (the first check starts right away).
 * PATCH  /api/rank-tracking/keywords {ids, starred?, groupId?, groupName?, location?, frequency?, depth?, device?} - bulk edit.
 * DELETE /api/rank-tracking/keywords {ids} - stop tracking.
 */
import { after } from 'next/server';
import { logger } from '@/lib/logger';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { rankCaller, jsonBody, str, strList } from '@/lib/rank-tracking/http';
import { addKeywords, deleteKeywords, ownWebsite, parseKeywordList, updateKeywords, type BulkUpdate } from '@/lib/rank-tracking/keywords';
import { startFirstChecks } from '@/lib/rank-tracking/scheduler';

const location = (b: Record<string, unknown> | null) => ({
  code: Number(b?.locationCode) || null,
  name: str(b?.locationName ?? b?.location, 200) || null,
});

export async function POST(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const rl = await checkUserIpRateLimit('rank_keywords_add', c.userId, getClientIp(request), {
    user: { max: 60, windowMs: 60 * 60 * 1000 },
    ip: { max: 120, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);
  const b = await jsonBody(request);
  if (!b) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  let domain = str(b.domain, 255);
  if (!domain && typeof b.websiteId === 'string') domain = (await ownWebsite(c.accountId, b.websiteId))?.domain || '';
  const keywords = Array.isArray(b.keywords) ? parseKeywordList(strList(b.keywords).join('\n')) : parseKeywordList(str(b.keywords, 200_000));
  try {
    const r = await addKeywords({
      accountId: c.accountId, plan: c.plan, domain, keywords, location: location(b),
      device: b.device === 'mobile' ? 'mobile' : 'desktop',
      frequency: b.frequency === 'daily' ? 'daily' : 'weekly',
      depth: Number(b.depth) === 100 ? 100 : 30,
      groupName: str(b.groupName, 80) || null,
      checkAi: b.checkAi === true,
      localize: b.localize !== false,
    });
    if (!r.ok) return Response.json({ error: r.error, credit: r.credit }, { status: r.status });
    if (r.added.length) {
      after(async () => {
        try { await startFirstChecks(r.added); } catch (e) { logger.error('rank.first_checks_failed', { err: (e as Error).message }); }
      });
    }
    return Response.json({ websiteId: r.websiteId, added: r.added.length, skipped: r.skipped, location: r.location, localized: r.localized, ai: r.ai });
  } catch (e) {
    logger.error('rank.add_failed', { err: (e as Error).message, userId: c.userId });
    return Response.json({ error: 'Failed to add keywords' }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const b = await jsonBody(request);
  const ids = strList(b?.ids, 5000);
  if (!b || !ids.length) return Response.json({ error: 'ids is required' }, { status: 400 });
  const u: BulkUpdate = {};
  if (typeof b.starred === 'boolean') u.starred = b.starred;
  if ('groupId' in b) u.groupId = typeof b.groupId === 'string' && b.groupId ? b.groupId : null;
  if (typeof b.groupName === 'string' && b.groupName.trim()) u.groupName = b.groupName.trim();
  if (b.locationCode || b.locationName) u.location = location(b);
  if (b.frequency === 'weekly' || b.frequency === 'daily') u.frequency = b.frequency;
  if (Number(b.depth) === 30 || Number(b.depth) === 100) u.depth = Number(b.depth) as 30 | 100;
  if (b.device === 'desktop' || b.device === 'mobile') u.device = b.device;
  const r = await updateKeywords(c.accountId, c.plan, ids, u);
  return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status });
}

export async function DELETE(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const b = await jsonBody(request);
  const ids = strList(b?.ids, 5000);
  if (!ids.length) return Response.json({ error: 'ids is required' }, { status: 400 });
  return Response.json({ deleted: await deleteKeywords(c.accountId, ids) });
}
