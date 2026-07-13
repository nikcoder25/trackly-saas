/**
 * Fix Engine - Google Sheet auto-create: OAuth token exchange/refresh,
 * spreadsheet creation + row append, and the sheet tracker's google-mode
 * branch (append via Sheets API instead of the Apps Script webhook).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

function ok(body: unknown = {}) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
}
function fail(status: number) {
  return { ok: false, status, json: async () => ({}), text: async () => 'err' } as unknown as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.GOOGLE_CLIENT_ID = 'cid';
  process.env.GOOGLE_CLIENT_SECRET = 'csecret';
  process.env.APP_URL = 'https://app.livesov.com';
});
afterEach(() => vi.unstubAllGlobals());

describe('sheet-google helper', () => {
  it('builds a drive.file consent URL with offline access', async () => {
    const { buildSheetAuthUrl, sheetOauthConfigured } = await import('@/lib/fix-engine/sheet-google');
    expect(sheetOauthConfigured()).toBe(true);
    const url = new URL(buildSheetAuthUrl('state123'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.livesov.com/api/connections/sheet/callback');
  });

  it('createSpreadsheet creates the sheet then writes a header row', async () => {
    const { createSpreadsheet } = await import('@/lib/fix-engine/sheet-google');
    fetchMock
      .mockResolvedValueOnce(ok({ spreadsheetId: 'SS1', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/SS1/edit' })) // create
      .mockResolvedValueOnce(ok({})); // header PUT
    const r = await createSpreadsheet('acc-tok', 'Livesov Fixes — Acme');
    expect(r).toEqual({ spreadsheetId: 'SS1', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/SS1/edit' });
    const [createUrl, createInit] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(createUrl).toBe('https://sheets.googleapis.com/v4/spreadsheets');
    expect(createInit.method).toBe('POST');
    expect(createInit.headers.Authorization).toBe('Bearer acc-tok');
    expect(JSON.parse(createInit.body).properties.title).toBe('Livesov Fixes — Acme');
    const [headerUrl] = fetchMock.mock.calls[1] as [string];
    expect(headerUrl).toContain('/SS1/values/Fixes!A1:D1');
  });

  it('createSpreadsheet throws when the API rejects', async () => {
    const { createSpreadsheet } = await import('@/lib/fix-engine/sheet-google');
    fetchMock.mockResolvedValueOnce(fail(403));
    await expect(createSpreadsheet('acc', 'T')).rejects.toThrow(/Sheet create failed: HTTP 403/);
  });

  it('appendSheetRow posts to the values:append endpoint', async () => {
    const { appendSheetRow } = await import('@/lib/fix-engine/sheet-google');
    fetchMock.mockResolvedValueOnce(ok({}));
    await appendSheetRow('acc', 'SS1', ['2026-07-13', 'Title', 'Details', 'https://x']);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toContain('/SS1/values/Fixes!A1:append');
    expect(url).toContain('valueInputOption=USER_ENTERED');
    expect(JSON.parse(init.body).values[0]).toEqual(['2026-07-13', 'Title', 'Details', 'https://x']);
  });
});

describe('sheet tracker - google mode', () => {
  const gcreds = { mode: 'google' as const, refreshToken: 'rt-123', spreadsheetId: 'SS9' };

  it('createIssue refreshes the token then appends a [date, title, details, link] row', async () => {
    const { sheetTracker } = await import('@/lib/fix-engine/trackers/sheet');
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: 'fresh-at', expires_in: 3600 })) // token refresh
      .mockResolvedValueOnce(ok({})); // append
    const r = await sheetTracker.createIssue(gcreds, { title: 'Add meta description', description: 'Homepage is missing one', url: 'https://app/fix/9' });
    expect(r.ok).toBe(true);
    // First call = token refresh
    const [tokUrl] = fetchMock.mock.calls[0] as [string];
    expect(tokUrl).toBe('https://oauth2.googleapis.com/token');
    // Second call = append with Bearer fresh-at + the row
    const [appUrl, appInit] = fetchMock.mock.calls[1] as [string, { headers: Record<string, string>; body: string }];
    expect(appUrl).toContain('/SS9/values/Fixes!A1:append');
    expect(appInit.headers.Authorization).toBe('Bearer fresh-at');
    const row = JSON.parse(appInit.body).values[0];
    expect(row.slice(1)).toEqual(['Add meta description', 'Homepage is missing one', 'https://app/fix/9']);
  });

  it('createIssue reports failure detail when append fails', async () => {
    const { sheetTracker } = await import('@/lib/fix-engine/trackers/sheet');
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: 'fresh-at', expires_in: 3600 }))
      .mockResolvedValueOnce(fail(500));
    const r = await sheetTracker.createIssue(gcreds, { title: 'T', description: 'D' });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/Sheet append failed: HTTP 500/);
  });

  it('verify refreshes and confirms sheet access', async () => {
    const { sheetTracker } = await import('@/lib/fix-engine/trackers/sheet');
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: 'fresh-at', expires_in: 3600 })) // refresh
      .mockResolvedValueOnce(ok({ spreadsheetId: 'SS9' })); // meta
    const r = await sheetTracker.verify(gcreds);
    expect(r.ok).toBe(true);
  });

  it('still supports the manual webhook creds shape (mode absent)', async () => {
    // The webhook path uses safe-fetch, not global fetch, so a google-mode
    // guard miss would try to append via Sheets API. Assert a plain
    // {url,secret} creds object is NOT treated as google mode.
    const { sheetTracker } = await import('@/lib/fix-engine/trackers/sheet');
    const verify = await sheetTracker.verify({ url: 'not-https', secret: 'x' });
    expect(verify.ok).toBe(false);
    expect(verify.detail).toMatch(/https/i); // webhook validation ran, not the google branch
  });
});
