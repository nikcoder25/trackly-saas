/** POST /api/rank-tracking/import {csv, domain?, location?} - import a Serpfox (or similar) CSV with its rank history. */
import { logger } from '@/lib/logger';
import { rankCaller, jsonBody, str } from '@/lib/rank-tracking/http';
import { importKeywords, readSerpfoxCsv } from '@/lib/rank-tracking/import';

export async function POST(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const b = await jsonBody(request);
  const csv = typeof b?.csv === 'string' ? b.csv.slice(0, 15_000_000) : '';
  if (!csv) return Response.json({ error: 'Choose a CSV file.' }, { status: 400 });
  const parsed = readSerpfoxCsv(csv, str(b?.domain, 255));
  if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });
  try {
    const r = await importKeywords(c.accountId, c.plan, parsed.keywords, str(b?.location, 200));
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: 402 });
  } catch (e) {
    logger.error('rank.import_failed', { err: (e as Error).message, userId: c.userId });
    return Response.json({ error: 'Import failed' }, { status: 500 });
  }
}
