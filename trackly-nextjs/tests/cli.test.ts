/**
 * Tests for the admin CLI (cli/).
 *
 * Covers the pure argument parser, the Set-Cookie refresh-cookie extractor,
 * and the ApiClient's login + transparent-refresh flow (an expired access
 * token must trigger a silent /api/auth/refresh and replay of the request).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseArgs } from '../cli/args';
import { extractRefreshCookie, ApiClient, TwoFactorRequiredError } from '../cli/client';

describe('parseArgs', () => {
  it('splits positionals and value flags', () => {
    const { positionals, flags } = parseArgs(['users', 'list', '--plan', 'pro', '--limit', '20']);
    expect(positionals).toEqual(['users', 'list']);
    expect(flags).toEqual({ plan: 'pro', limit: '20' });
  });

  it('supports --flag=value syntax', () => {
    const { flags } = parseArgs(['analytics', '--days=7']);
    expect(flags.days).toBe('7');
  });

  it('treats known boolean flags as booleans even before a positional', () => {
    const { positionals, flags } = parseArgs(['--json', 'stats']);
    expect(flags.json).toBe(true);
    expect(positionals).toEqual(['stats']);
  });

  it('treats a trailing value-less flag as boolean', () => {
    const { flags } = parseArgs(['users', 'delete', 'abc', '--yes']);
    expect(flags.yes).toBe(true);
  });

  it('maps -h to help', () => {
    expect(parseArgs(['-h']).flags.help).toBe(true);
  });
});

describe('extractRefreshCookie', () => {
  it('matches the dev cookie name', () => {
    expect(extractRefreshCookie(['livesov_refresh=abc123; HttpOnly; Path=/'])).toEqual({
      name: 'livesov_refresh',
      value: 'abc123',
    });
  });

  it('matches the __Host- prefixed production cookie name', () => {
    const out = extractRefreshCookie([
      'livesov_csrf=zzz; Path=/',
      '__Host-livesov_refresh=xyz; HttpOnly; Secure; Path=/',
    ]);
    expect(out).toEqual({ name: '__Host-livesov_refresh', value: 'xyz' });
  });

  it('returns null when no refresh cookie is present', () => {
    expect(extractRefreshCookie(['livesov_token=t; Path=/'])).toBeNull();
  });
});

describe('ApiClient', () => {
  let configFile: string;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    configFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'livesov-cli-')), 'cli.json');
    process.env.LIVESOV_CLI_CONFIG = configFile;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.LIVESOV_CLI_CONFIG;
    try {
      fs.rmSync(path.dirname(configFile), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  function jsonResponse(status: number, body: unknown, setCookies: string[] = []): Response {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    for (const c of setCookies) headers.append('Set-Cookie', c);
    return new Response(JSON.stringify(body), { status, headers });
  }

  it('login stores the token, refresh cookie, and user; sends an Origin header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { token: 'access-1', user: { id: 'u1', email: 'a@x.com', role: 'admin' } }, [
        'livesov_refresh=r1; HttpOnly; Path=/',
      ]),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new ApiClient({ baseUrl: 'http://localhost:4599' });
    const user = await client.login('a@x.com', 'pw');

    expect(user.email).toBe('a@x.com');
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Origin: 'http://localhost:4599' });

    const stored = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(stored.token).toBe('access-1');
    expect(stored.refresh).toEqual({ name: 'livesov_refresh', value: 'r1' });
  });

  it('surfaces TwoFactorRequiredError on a 202 requires2FA response', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(202, { requires2FA: true })) as unknown as typeof fetch;
    const client = new ApiClient({ baseUrl: 'http://localhost:4599' });
    await expect(client.login('a@x.com', 'pw')).rejects.toBeInstanceOf(TwoFactorRequiredError);
  });

  it('transparently refreshes on a 401 and replays the original request', async () => {
    const fetchMock = vi
      .fn()
      // 1: GET with stale token -> 401
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }))
      // 2: POST /refresh -> new token + rotated cookie
      .mockResolvedValueOnce(jsonResponse(200, { token: 'access-2' }, ['livesov_refresh=r2; Path=/']))
      // 3: GET replayed with fresh token -> 200
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new ApiClient({
      baseUrl: 'http://localhost:4599',
      token: 'access-1',
      refresh: { name: 'livesov_refresh', value: 'r1' },
    });

    const result = await client.get<{ ok: boolean }>('/api/admin-backend/stats');
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The refresh call carried the stored cookie...
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1];
    expect(String(refreshUrl)).toContain('/api/auth/refresh');
    expect((refreshInit as RequestInit).headers).toMatchObject({ Cookie: 'livesov_refresh=r1' });

    // ...and the replay used the new bearer token.
    const [, replayInit] = fetchMock.mock.calls[2];
    expect((replayInit as RequestInit).headers).toMatchObject({ Authorization: 'Bearer access-2' });

    // New token + rotated refresh cookie were persisted.
    const stored = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(stored.token).toBe('access-2');
    expect(stored.refresh.value).toBe('r2');
  });

  it('does not retry a 401 when no refresh cookie is held', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'nope' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const client = new ApiClient({ baseUrl: 'http://localhost:4599', token: 'stale' });
    await expect(client.get('/api/admin-backend/stats')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
