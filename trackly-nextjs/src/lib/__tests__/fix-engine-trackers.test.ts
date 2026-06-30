/**
 * Fix Engine - native issue trackers (Linear / Jira): verify + createIssue,
 * with safeFetch mocked. Also covers the dispatchTracker fallback order.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/safe-fetch', () => ({ safeFetch: fetchMock }));

const conn = vi.hoisted(() => ({ value: null as null | { provider: string; status: string; creds: Record<string, unknown> } }));
vi.mock('@/lib/fix-engine/connections', () => ({
  getConnection: vi.fn(async (_b: string, provider: string) =>
    conn.value && conn.value.provider === provider ? conn.value : null),
}));

import { linearTracker } from '@/lib/fix-engine/trackers/linear';
import { jiraTracker } from '@/lib/fix-engine/trackers/jira';
import { dispatchTracker } from '@/lib/fix-engine/trackers';

function jsonRes(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

beforeEach(() => { fetchMock.mockReset(); conn.value = null; });

describe('Linear tracker', () => {
  it('verifies a key + team and creates an issue', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { data: { team: { id: 't1', name: 'Growth' } } }));
    expect(await linearTracker.verify({ apiKey: 'k', teamId: 't1' })).toEqual({ ok: true });

    fetchMock.mockResolvedValueOnce(jsonRes(200, { data: { issueCreate: { success: true, issue: { id: 'i1', url: 'https://linear.app/i1' } } } }));
    const r = await linearTracker.createIssue({ apiKey: 'k', teamId: 't1' }, { title: 'T', description: 'D', url: 'https://livesov.com/x' });
    expect(r).toEqual({ ok: true, id: 'i1', url: 'https://linear.app/i1' });
    // Auth header is the raw key (Linear convention — no Bearer).
    const [, init] = fetchMock.mock.calls[1];
    expect((init.headers as Record<string, string>).Authorization).toBe('k');
  });

  it('rejects a bad key', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(401, { errors: [{ message: 'auth' }] }));
    const v = await linearTracker.verify({ apiKey: 'bad', teamId: 't1' });
    expect(v.ok).toBe(false);
  });

  it('fails fast without creds (no network call)', async () => {
    expect((await linearTracker.verify({ apiKey: '', teamId: '' })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Jira tracker', () => {
  it('verifies and creates an issue, resolving a bare domain', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { accountId: 'a1' }));
    expect(await jiraTracker.verify({ email: 'e@a.com', apiToken: 't', domain: 'acme', projectKey: 'SEO' })).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toBe('https://acme.atlassian.net/rest/api/3/myself');

    fetchMock.mockResolvedValueOnce(jsonRes(201, { key: 'SEO-12' }));
    const r = await jiraTracker.createIssue({ email: 'e@a.com', apiToken: 't', domain: 'acme', projectKey: 'SEO' }, { title: 'T', description: 'line1\nline2' });
    expect(r).toEqual({ ok: true, id: 'SEO-12', url: 'https://acme.atlassian.net/browse/SEO-12' });
  });

  it('rejects bad credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(403, {}));
    expect((await jiraTracker.verify({ email: 'e@a.com', apiToken: 'bad', domain: 'acme', projectKey: 'SEO' })).ok).toBe(false);
  });
});

describe('dispatchTracker', () => {
  it('returns no_tracker when none connected', async () => {
    const r = await dispatchTracker('b1', { title: 'T', description: 'D' });
    expect(r).toEqual({ ok: false, reason: 'no_tracker' });
  });

  it('creates via the connected tracker', async () => {
    conn.value = { provider: 'linear', status: 'active', creds: { apiKey: 'k', teamId: 't1' } };
    fetchMock.mockResolvedValueOnce(jsonRes(200, { data: { issueCreate: { success: true, issue: { id: 'i9', url: 'u' } } } }));
    const r = await dispatchTracker('b1', { title: 'T', description: 'D' });
    expect(r).toEqual({ ok: true, provider: 'linear', url: 'u', id: 'i9' });
  });
});
