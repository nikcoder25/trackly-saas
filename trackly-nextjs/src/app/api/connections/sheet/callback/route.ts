/**
 * GET /api/connections/sheet/callback
 *
 * Fixed OAuth redirect URI for the one-click Google Sheet flow. Google sends
 * the user here with ?code & ?state (or ?error). We:
 *   1. authenticate the user (browser carries the session cookie),
 *   2. verify the signed state and that it belongs to this user,
 *   3. exchange the code for tokens (need a refresh_token for later appends),
 *   4. CREATE a new spreadsheet on their Drive with a header row,
 *   5. store the connection (encrypted) with mode='google', and
 *   6. redirect back to the dashboard Fix Engine tab.
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { exchangeCode, createSpreadsheet } from '@/lib/fix-engine/sheet-google';
import { verifyState } from '@/lib/fix-engine/gsc-state';
import { upsertConnection } from '@/lib/fix-engine/connections';

function dash(path: string): string {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path}`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const err = url.searchParams.get('error');
  if (err) return Response.redirect(dash(`/dashboard/fixes?sheet=denied`), 302);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return Response.redirect(dash(`/dashboard/fixes?sheet=invalid`), 302);

  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return Response.redirect(dash(`/login`), 302);
  const user = auth;

  const payload = verifyState(state);
  if (!payload || payload.userId !== user.id) {
    return Response.redirect(dash(`/dashboard/fixes?sheet=invalid`), 302);
  }
  const brandId = payload.brandId;

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      // Without a refresh token we can't append rows later. prompt=consent
      // should always yield one; if it doesn't, fail clearly rather than
      // storing a half-working connection.
      logger.warn('fix_engine.sheet.no_refresh_token', { brandId });
      return Response.redirect(dash(`/dashboard/fixes?sheet=error`), 302);
    }

    // Name the sheet after the brand so it's easy to find in Drive.
    let brandName = 'Livesov';
    try {
      const brandRow = await pool.query(`SELECT name, data FROM brands WHERE id = $1 LIMIT 1`, [brandId]);
      brandName = (brandRow.rows[0]?.name as string | undefined)
        || (brandRow.rows[0]?.data as { name?: string } | undefined)?.name
        || 'Livesov';
    } catch { /* fall back to default title */ }

    const sheet = await createSpreadsheet(tokens.access_token, `Livesov Fixes — ${brandName}`);

    await upsertConnection({
      userId: user.id,
      brandId,
      provider: 'sheet',
      creds: {
        mode: 'google',
        refreshToken: tokens.refresh_token,
        spreadsheetId: sheet.spreadsheetId,
      },
      meta: { mode: 'google', spreadsheetUrl: sheet.spreadsheetUrl, spreadsheetId: sheet.spreadsheetId },
    });

    return Response.redirect(dash(`/dashboard/fixes?sheet=connected`), 302);
  } catch (e) {
    logger.error('fix_engine.sheet.callback_failed', { brandId, err: (e as Error).message });
    return Response.redirect(dash(`/dashboard/fixes?sheet=error`), 302);
  }
}
