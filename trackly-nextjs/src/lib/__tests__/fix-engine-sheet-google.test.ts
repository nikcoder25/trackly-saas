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

  it('createSpreadsheet creates a formatted, team-usable sheet', async () => {
    const { createSpreadsheet, SHEET_COLUMNS, STATUS_OPTIONS } = await import('@/lib/fix-engine/sheet-google');
    fetchMock
      .mockResolvedValueOnce(ok({ spreadsheetId: 'SS1', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/SS1/edit', sheets: [{ properties: { sheetId: 7 } }] })) // create
      .mockResolvedValueOnce(ok({})); // batchUpdate formatting
    const r = await createSpreadsheet('acc-tok', 'Livesov Fixes — Acme');
    expect(r).toEqual({ spreadsheetId: 'SS1', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/SS1/edit' });

    // Create call: title + a frozen header row seeded with the columns.
    const [createUrl, createInit] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(createUrl).toBe('https://sheets.googleapis.com/v4/spreadsheets');
    expect(createInit.headers.Authorization).toBe('Bearer acc-tok');
    const createBody = JSON.parse(createInit.body);
    expect(createBody.properties.title).toBe('Livesov Fixes — Acme');
    expect(createBody.sheets[0].properties.gridProperties.frozenRowCount).toBe(1);
    const headerCells = createBody.sheets[0].data[0].rowData[0].values.map((v: { userEnteredValue: { stringValue: string } }) => v.userEnteredValue.stringValue);
    expect(headerCells).toEqual([...SHEET_COLUMNS]);

    // Formatting call: header format + a Status dropdown + a filter.
    const [buUrl, buInit] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(buUrl).toBe('https://sheets.googleapis.com/v4/spreadsheets/SS1:batchUpdate');
    const reqs = JSON.parse(buInit.body).requests as Record<string, unknown>[];
    const validation = reqs.find((q) => 'setDataValidation' in q) as { setDataValidation: { rule: { condition: { values: { userEnteredValue: string }[] } } } };
    expect(validation).toBeTruthy();
    expect(validation.setDataValidation.rule.condition.values.map((v) => v.userEnteredValue)).toEqual([...STATUS_OPTIONS]);
    expect(reqs.some((q) => 'setBasicFilter' in q)).toBe(true);
    expect(reqs.some((q) => 'repeatCell' in q)).toBe(true);
  });

  it('createSpreadsheet still succeeds if the cosmetic batchUpdate fails', async () => {
    const { createSpreadsheet } = await import('@/lib/fix-engine/sheet-google');
    fetchMock
      .mockResolvedValueOnce(ok({ spreadsheetId: 'SS2', spreadsheetUrl: 'u', sheets: [{ properties: { sheetId: 0 } }] }))
      .mockResolvedValueOnce(fail(500)); // formatting fails - must not throw
    const r = await createSpreadsheet('acc', 'T');
    expect(r.spreadsheetId).toBe('SS2');
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
    // Date | Fix | Details | Status | Owner | Link
    expect(row.slice(1)).toEqual(['Add meta description', 'Homepage is missing one', 'To do', '', 'https://app/fix/9']);
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
