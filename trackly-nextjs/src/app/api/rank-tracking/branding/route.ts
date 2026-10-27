/**
 * GET /api/rank-tracking/branding - logo, colors, custom domain, Slack webhook (set or not).
 * PUT /api/rank-tracking/branding - save them.
 */
import { rankCaller, jsonBody, noStore, str } from '@/lib/rank-tracking/http';
import { getBranding, logoSrc } from '@/lib/rank-tracking/reports';
import { getSlackWebhook, saveBranding } from '@/lib/rank-tracking/clients';

export async function GET(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const b = await getBranding(c.accountId);
  const slack = await getSlackWebhook(c.accountId);
  return Response.json({ ...b, logoSrc: logoSrc(c.accountId, b.logoUrl), slackConnected: !!slack }, noStore);
}

export async function PUT(request: Request): Promise<Response> {
  const c = await rankCaller(request);
  if (c instanceof Response) return c;
  const b = await jsonBody(request);
  if (!b) return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  const current = await getSlackWebhook(c.accountId);
  await saveBranding(c.accountId, {
    agencyName: str(b.agencyName, 80), logoUrl: str(b.logoUrl, 500), primaryColor: str(b.primaryColor, 7), customDomain: str(b.customDomain, 200),
    // Blank keeps the saved webhook; "remove" clears it.
    slackWebhook: b.slackWebhook === 'remove' ? '' : str(b.slackWebhook, 500) || current,
  });
  return Response.json({ ok: true });
}
