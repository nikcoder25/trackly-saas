/**
 * Fix Engine - Google Sheets auto-create client.
 *
 * Lets a brand connect a spreadsheet with ONE click instead of hand-pasting
 * an Apps Script web app: we run a server-side OAuth 2.0 auth-code flow with
 * offline access, create a fresh Google Sheet on the user's Drive, and store
 * the refresh token + spreadsheet id on the brand's `sheet` fix_connection.
 * Every handed-off fix then appends a row via the Sheets API.
 *
 * Scope is the least-privilege `drive.file`: Livesov can only create and edit
 * the ONE sheet it makes - it has no access to the user's other Drive files.
 *
 * Reuses GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (same app as sign-in + GSC)
 * and APP_URL for the fixed redirect URI. The Google Cloud project must have
 * the Sheets API + Drive API enabled and `drive.file` on its OAuth consent
 * screen for this flow to succeed.
 */

// drive.file = per-file access limited to files this app creates/opens.
// Sufficient for spreadsheets.create and subsequent values.append on that
// same file; deliberately NOT the broad `spreadsheets` scope.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export function sheetRedirectUri(): string {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/connections/sheet/callback`;
}

export function sheetOauthConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

/** Build the consent URL the user is redirected to. */
export function buildSheetAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: sheetRedirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent', // force a refresh_token even on re-consent
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface SheetTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(code: string): Promise<SheetTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: sheetRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as SheetTokenResponse;
}

/** Exchange a stored refresh token for a fresh access token. */
export async function refreshAccessToken(refreshToken: string): Promise<SheetTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: HTTP ${res.status}`);
  return (await res.json()) as SheetTokenResponse;
}

export interface CreatedSheet {
  spreadsheetId: string;
  spreadsheetUrl: string;
}

/**
 * Create a new spreadsheet titled `title` with a header row, and return its
 * id + web URL. Uses the Sheets API create then a values.update for the
 * header so the first handed-off fix lands under labelled columns.
 */
export async function createSpreadsheet(accessToken: string, title: string): Promise<CreatedSheet> {
  const res = await fetch(SHEETS_BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: 'Fixes' } }],
    }),
  });
  if (!res.ok) throw new Error(`Sheet create failed: HTTP ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { spreadsheetId?: string; spreadsheetUrl?: string };
  if (!data.spreadsheetId) throw new Error('Sheet create returned no spreadsheetId');

  // Header row.
  await fetch(
    `${SHEETS_BASE}/${data.spreadsheetId}/values/Fixes!A1:D1?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [['Date', 'Fix', 'Details', 'Link']] }),
    },
  ).catch(() => { /* header is best-effort; append still works without it */ });

  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
  };
}

/** Append one row to the sheet's "Fixes" tab. */
export async function appendSheetRow(
  accessToken: string,
  spreadsheetId: string,
  values: (string | number)[],
): Promise<void> {
  const res = await fetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/Fixes!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] }),
    },
  );
  if (!res.ok) throw new Error(`Sheet append failed: HTTP ${res.status}`);
}

/** Confirm the app can still reach the sheet (used by verify). */
export async function getSpreadsheetMeta(accessToken: string, spreadsheetId: string): Promise<boolean> {
  const res = await fetch(
    `${SHEETS_BASE}/${spreadsheetId}?fields=spreadsheetId`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return res.ok;
}
