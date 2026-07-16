/**
 * Fix Engine - Git connector tests: deterministic manifest, GitHub client
 * request shaping, and the repo-sync flow (create-branch → commit → PR, plus
 * the no-op / existing-PR paths) driven by a routing mock `fetch`.
 */

import { buildSeoManifest, stableStringify, DEFAULT_MANIFEST_PATH } from '@/lib/fix-engine/git/manifest';
import { getFile, putFile, toBase64, type FetchLike, type GitHubRepoRef } from '@/lib/fix-engine/git/github';
import { syncSeoToRepo, isGitConnectorCreds } from '@/lib/fix-engine/git/sync';
import type { EdgeSeoOverride } from '@/lib/fix-engine/schema';

const REF: GitHubRepoRef = { token: 't', owner: 'acme', repo: 'site' };

function res(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, text: async () => (body == null ? '' : JSON.stringify(body)) } as unknown as Response;
}

describe('buildSeoManifest', () => {
  const overrides: Record<string, EdgeSeoOverride> = {
    '/b': { description: 'B', title: 'Beta' },
    '/a': { title: 'Alpha', canonical: 'https://x/a' },
  };

  it('is deterministic and sorts path keys', () => {
    const a = buildSeoManifest({ brandId: 'br', overrides, generatedAt: null });
    const b = buildSeoManifest({ brandId: 'br', overrides, generatedAt: null });
    expect(a).toBe(b);
    const parsed = JSON.parse(a);
    expect(Object.keys(parsed.paths)).toEqual(['/a', '/b']);
    expect(parsed.version).toBe(1);
    expect(parsed.generator).toBe('livesov');
    expect(a.endsWith('\n')).toBe(true);
  });

  it('stableStringify sorts object keys at every depth, preserves array order', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(stableStringify({ x: [3, 1, 2] })).toBe('{"x":[3,1,2]}');
    expect(stableStringify({ n: { z: 1, a: 2 } })).toBe('{"n":{"a":2,"z":1}}');
  });

  it('drops undefined fields so equal-content inputs match byte-for-byte', () => {
    const m1 = buildSeoManifest({ brandId: 'br', overrides: { '/a': { title: 'A', description: undefined } }, generatedAt: null });
    const m2 = buildSeoManifest({ brandId: 'br', overrides: { '/a': { title: 'A' } }, generatedAt: null });
    expect(m1).toBe(m2);
  });
});

describe('github client request shaping', () => {
  it('getFile returns null on 404, decoded content otherwise', async () => {
    const miss: FetchLike = async () => res(404, null);
    expect(await getFile(miss, REF, 'p.json', 'main')).toBeNull();

    const hit: FetchLike = async () => res(200, { sha: 's1', encoding: 'base64', content: toBase64('hello') });
    const f = await getFile(hit, REF, 'p.json', 'main');
    expect(f).toEqual({ sha: 's1', content: 'hello' });
  });

  it('putFile omits sha on create and includes it on update', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const cap: FetchLike = async (_url, init) => { calls.push(JSON.parse(String((init as RequestInit).body))); return res(200, { commit: { sha: 'c1' } }); };

    await putFile(cap, REF, { path: 'p.json', branch: 'wb', content: 'x', message: 'm' });
    expect(calls[0].sha).toBeUndefined();
    expect(calls[0].content).toBe(toBase64('x'));
    expect(calls[0].branch).toBe('wb');

    await putFile(cap, REF, { path: 'p.json', branch: 'wb', content: 'x', message: 'm', sha: 'old' });
    expect(calls[1].sha).toBe('old');
  });
});

describe('syncSeoToRepo', () => {
  const creds = { token: 't', owner: 'acme', repo: 'site' };
  const overrides: Record<string, EdgeSeoOverride> = { '/': { title: 'Home' } };

  // A routing mock GitHub. `existingFile` toggles the no-op path; `openPr`
  // toggles the existing-PR path. Records the methods+paths it saw.
  function mkGitHub(opts: { existingFileContent?: string; openPr?: boolean }) {
    const seen: string[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      const u = String(url); const method = (init as RequestInit)?.method || 'GET';
      seen.push(`${method} ${u.replace('https://api.github.com', '')}`);
      if (method === 'GET' && /\/repos\/acme\/site$/.test(u)) return res(200, { default_branch: 'main' });
      if (method === 'GET' && /\/git\/ref\/heads\/main$/.test(u)) return res(200, { object: { sha: 'basesha' } });
      if (method === 'GET' && /\/git\/ref\/heads\/livesov/.test(u)) return res(404, null); // work branch missing
      if (method === 'POST' && /\/git\/refs$/.test(u)) return res(201, { ref: 'refs/heads/livesov/seo-overrides' });
      if (method === 'GET' && /\/contents\//.test(u)) {
        return opts.existingFileContent != null
          ? res(200, { sha: 'fsha', encoding: 'base64', content: toBase64(opts.existingFileContent) })
          : res(404, null);
      }
      if (method === 'PUT' && /\/contents\//.test(u)) return res(200, { commit: { sha: 'c1' } });
      if (method === 'GET' && /\/pulls\?/.test(u)) return res(200, opts.openPr ? [{ number: 7, html_url: 'https://github.com/acme/site/pull/7' }] : []);
      if (method === 'POST' && /\/pulls$/.test(u)) return res(201, { number: 8, html_url: 'https://github.com/acme/site/pull/8' });
      return res(500, { message: `unrouted ${method} ${u}` });
    };
    return { fetchImpl, seen };
  }

  it('creates the branch, commits the manifest, and opens a PR', async () => {
    const gh = mkGitHub({});
    const r = await syncSeoToRepo({ creds, brandId: 'br', overrides, fetchImpl: gh.fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.committed).toBe(true);
    expect(r.prUrl).toBe('https://github.com/acme/site/pull/8');
    expect(gh.seen.some((s) => s.startsWith('PUT /repos/acme/site/contents/'))).toBe(true);
    expect(gh.seen.some((s) => s.startsWith('POST /repos/acme/site/pulls'))).toBe(true);
  });

  it('skips the commit when the manifest is unchanged and reuses the open PR', async () => {
    const identical = buildSeoManifest({ brandId: 'br', overrides, generatedAt: null });
    const gh = mkGitHub({ existingFileContent: identical, openPr: true });
    const r = await syncSeoToRepo({ creds, brandId: 'br', overrides, fetchImpl: gh.fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.committed).toBe(false);
    expect(r.prUrl).toBe('https://github.com/acme/site/pull/7');
    expect(gh.seen.some((s) => s.startsWith('PUT '))).toBe(false);
    expect(gh.seen.some((s) => s.startsWith('POST /repos/acme/site/pulls'))).toBe(false);
  });

  it('errors cleanly when the base branch is missing', async () => {
    const fetchImpl: FetchLike = async (url, init) => {
      const u = String(url); const method = (init as RequestInit)?.method || 'GET';
      if (method === 'GET' && /\/repos\/acme\/site$/.test(u)) return res(200, { default_branch: 'main' });
      if (method === 'GET' && /\/git\/ref\/heads\/main$/.test(u)) return res(404, null);
      return res(500, { message: 'unexpected' });
    };
    const r = await syncSeoToRepo({ creds, brandId: 'br', overrides, fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/i);
  });
});

describe('isGitConnectorCreds', () => {
  it('requires token, owner, repo', () => {
    expect(isGitConnectorCreds({ token: 't', owner: 'o', repo: 'r' })).toBe(true);
    expect(isGitConnectorCreds({ token: 't', owner: 'o' })).toBe(false);
    expect(isGitConnectorCreds(null)).toBe(false);
    expect(isGitConnectorCreds({ token: '', owner: 'o', repo: 'r' })).toBe(false);
  });
});

describe('manifest path default', () => {
  it('is under a livesov/ folder', () => {
    expect(DEFAULT_MANIFEST_PATH).toBe('livesov/seo-overrides.json');
  });
});
