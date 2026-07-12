/**
 * Fix Engine - spreadsheet tracker: secret-in-body contract, Apps Script
 * 302 tolerance, verify validation, and dispatch fallback order.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: fetchMock }));

const connState = vi.hoisted(() => ({
  conns: new Map<string, { status: string; creds: Record<string, unknown> }>(),
}));
vi.mock('@/lib/fix-engine/connections', () => ({
  getConnection: vi.fn(async (_brandId: string, provider: string) => connState.conns.get(provider) ?? null),
}));

import { sheetTracker } from '@/lib/fix-engine/trackers/sheet';
import { dispatchTracker, getTracker, listTrackerProviders } from '@/lib/fix-engine/trackers';

const creds = { url: 'https://script.google.com/macros/s/abc123/exec', secret: 's3cr3t-key' };

function res(status: number, body: unknown = {}) {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
}

beforeEach(() => { fetchMock.mockReset(); connState.conns.clear(); });

describe('sheet tracker', () => {
  it('is registered and appends the secret to the JSON body', async () => {
    expect(getTracker('sheet')).toBe(sheetTracker);
    expect(listTrackerProviders()).toContain('sheet');

    fetchMock.mockResolvedValue(res(200, { ok: true }));
    const r = await sheetTracker.createIssue(creds, { title: 'Fix title', description: 'What to change', url: 'https://app/fix/1' });
    expect(r.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe(creds.url);
    expect(JSON.parse(init.body)).toMatchObject({ title: 'Fix title', description: 'What to change', link: 'https://app/fix/1', secret: creds.secret });
  });

  it('treats Apps Script 302 redirects as delivered', async () => {
    fetchMock.mockResolvedValue(res(302));
    expect((await sheetTracker.createIssue(creds, { title: 't', description: 'd' })).ok).toBe(true);
  });

  it('verify() rejects non-https URLs and short secrets without a request', async () => {
    expect((await sheetTracker.verify({ url: 'http://insecure/x', secret: 'longenough' })).ok).toBe(false);
    expect((await sheetTracker.verify({ url: 'https://ok/x', secret: 'short' })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(res(200, { ok: true }));
    expect((await sheetTracker.verify(creds)).ok).toBe(true);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body).ping).toBe(true);
  });

  it('dispatchTracker falls back to the sheet when no Linear/Jira is connected', async () => {
    connState.conns.set('sheet', { status: 'active', creds });
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    const d = await dispatchTracker('b1', { title: 't', description: 'd' });
    expect(d).toMatchObject({ ok: true, provider: 'sheet' });
  });
});
