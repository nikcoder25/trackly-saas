import { describe, expect, it } from 'vitest';

import { handleBody, handleMessage, negotiateVersion, LATEST_PROTOCOL_VERSION } from '@/lib/mcp/protocol';
import { TOOLS, type McpContext, type ApiResponse } from '@/lib/mcp/tools';
import { competitorSummary, mentionList, questionSummary, sourceSummary, visibilitySummary, engineName } from '@/lib/mcp/summarize';
import { cleanKeyName, generateApiKey, keyHint, looksLikeApiKey } from '@/lib/api-keys';

const t0 = Date.parse('2026-09-01T10:00:00Z');
const run = (day: number, sov: number, mentions: number, extra: Record<string, unknown> = {}) => ({
  time: new Date(t0 + day * 86400_000).toISOString(),
  sov,
  totalM: mentions,
  totalQ: 4,
  platforms: { ChatGPT: { sov: sov + 10 }, Claude: { sov: sov - 10 } },
  competitors: { Rival: 3, Other: 1 },
  citations: { 'yelp.com': 4, 'acme.com': 2 },
  allResults: [
    { query: 'best plumber', platform: 'ChatGPT', mentioned: true, position: 2, sentiment: 'positive', competitorMentions: ['Rival'], answer: 'Acme and Rival are good.', sources: ['yelp.com'] },
    { query: 'best plumber', platform: 'Claude', mentioned: false, competitorMentions: ['Rival'], answer: 'Rival is good.' },
    { query: 'cheap plumber', platform: 'ChatGPT', mentioned: false, competitorMentions: ['Other'], answer: 'Other.' },
    { query: 'cheap plumber', platform: 'Claude', mentioned: false, error: 'timeout' },
  ],
  ...extra,
});
const brand = {
  id: 'b1', name: 'Acme', website: 'https://www.acme.com', goal: 40, queries: ['best plumber', 'cheap plumber'],
  runs: [run(0, 20, 1), run(1, 30, 1), { time: new Date(t0 + 2 * 86400_000).toISOString(), watchdogReap: true, sov: 0 }],
};

function fakeCtx(routes: Record<string, ApiResponse>): McpContext & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async api(method, path) {
      calls.push(`${method} ${path}`);
      return routes[`${method} ${path}`] || { status: 404, data: { error: 'nope' } };
    },
  };
}

describe('MCP protocol', () => {
  it('negotiates a supported version and falls back to the latest', () => {
    expect(negotiateVersion('2025-03-26')).toBe('2025-03-26');
    expect(negotiateVersion('1999-01-01')).toBe(LATEST_PROTOCOL_VERSION);
  });

  it('answers initialize with tools capability and server info', async () => {
    const res = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, TOOLS, fakeCtx({})) as any;
    expect(res.result.protocolVersion).toBe('2025-06-18');
    expect(res.result.capabilities.tools).toBeDefined();
    expect(res.result.serverInfo.name).toBe('livesov');
  });

  it('returns null for notifications and client responses', async () => {
    expect(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, TOOLS, fakeCtx({}))).toBeNull();
    expect(await handleMessage({ jsonrpc: '2.0', id: 5, result: {} }, TOOLS, fakeCtx({}))).toBeNull();
    expect(await handleBody([{ jsonrpc: '2.0', method: 'notifications/initialized' }], TOOLS, fakeCtx({}))).toBeNull();
  });

  it('lists every tool with a JSON schema', async () => {
    const res = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, TOOLS, fakeCtx({})) as any;
    const names = res.result.tools.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_brands', 'get_visibility', 'start_scan', 'get_scan_status', 'update_recommendation']));
    for (const t of res.result.tools) expect(t.inputSchema.type).toBe('object');
  });

  it('rejects bad messages and unknown methods/tools with JSON-RPC errors', async () => {
    expect(((await handleMessage({ id: 1, method: 'ping' }, TOOLS, fakeCtx({}))) as any).error.code).toBe(-32600);
    expect(((await handleMessage({ jsonrpc: '2.0', id: 1, method: 'nope' }, TOOLS, fakeCtx({}))) as any).error.code).toBe(-32601);
    expect(((await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } }, TOOLS, fakeCtx({}))) as any).error.code).toBe(-32602);
  });

  it('turns a tool failure into an isError result instead of a crash', async () => {
    const ctx = fakeCtx({ 'GET /api/brands': { status: 200, data: { brands: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] } } });
    const res = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_visibility', arguments: {} } }, TOOLS, ctx) as any;
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('brand_id');
  });

  it('hides internal error details from unexpected failures', async () => {
    const ctx: McpContext = { api: async () => { throw new Error('db password leaked'); } };
    const res = await handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_brands' } }, TOOLS, ctx) as any;
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).not.toContain('password');
  });
});

describe('MCP tools', () => {
  const call = (name: string, args: Record<string, unknown>, ctx: McpContext) =>
    handleMessage({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }, TOOLS, ctx) as Promise<any>;

  it('defaults to the only brand when brand_id is omitted', async () => {
    const ctx = fakeCtx({
      'GET /api/brands': { status: 200, data: { brands: [{ id: 'b1', name: 'Acme' }] } },
      'GET /api/brands/b1': { status: 200, data: { brand } },
    });
    const res = await call('get_visibility', {}, ctx);
    expect(res.result.isError).toBeUndefined();
    expect(res.result.structuredContent.shareOfVoice).toBe(30);
    expect(res.result.structuredContent.changeSinceLastScan).toBe(10);
    expect(ctx.calls).toContain('GET /api/brands/b1');
  });

  it('reports a clear message for an unknown brand id', async () => {
    const res = await call('get_competitors', { brand_id: 'zzz' }, fakeCtx({}));
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('list_brands');
  });

  it('start_scan posts to the run route and surfaces a busy brand', async () => {
    const ok = fakeCtx({ 'POST /api/brands/b1/run': { status: 200, data: { runId: 'r1', totalExpected: 8, platforms: ['ChatGPT'], queries: ['q'] } } });
    const res = await call('start_scan', { brand_id: 'b1' }, ok);
    expect(res.result.structuredContent.runId).toBe('r1');
    const busy = fakeCtx({ 'POST /api/brands/b1/run': { status: 409, data: { error: 'running' } } });
    expect((await call('start_scan', { brand_id: 'b1' }, busy)).result.content[0].text).toContain('already running');
  });

  it('get_scan_status maps run states', async () => {
    const ctx = fakeCtx({ 'GET /api/brands/b1/run-status/r1?since=1000000': { status: 200, data: { status: 'done', received: 8, totalExpected: 8, foundCount: 3 } } });
    const res = await call('get_scan_status', { brand_id: 'b1', run_id: 'r1' }, ctx);
    expect(res.result.structuredContent).toMatchObject({ status: 'finished', finished: true, answersIn: 8, answersNamingBrand: 3 });
  });

  it('update_recommendation validates status before calling the API', async () => {
    const ctx = fakeCtx({});
    const res = await call('update_recommendation', { brand_id: 'b1', recommendation_id: 'x', status: 'deleted' }, ctx);
    expect(res.result.isError).toBe(true);
    expect(ctx.calls).toHaveLength(0);
  });

  it('recommendations explain a plan that lacks them', async () => {
    const ctx = fakeCtx({ 'GET /api/brands/b1/recommendations?status=open': { status: 403, data: {} } });
    expect((await call('get_recommendations', { brand_id: 'b1' }, ctx)).result.content[0].text).toContain('plan');
  });
});

describe('MCP summaries', () => {
  it('ignores watchdog placeholder runs and computes per-engine change', () => {
    const s = visibilitySummary(brand) as any;
    expect(s.history).toHaveLength(2);
    expect(s.engines.find((e: any) => e.engine === 'ChatGPT')).toMatchObject({ sov: 40, change: 10 });
    expect(s.answersTotal).toBe(3);
    expect(s.failedAnswers).toBe(1);
    expect(s.pointsToGoal).toBe(10);
  });

  it('ranks the brand against rivals and names the next one to pass', () => {
    const s = competitorSummary(brand) as any;
    expect(s.rows[0].name).toBe('Rival');
    expect(s.rank).toBe(2);
    expect(s.nextRivalToPass.name).toBe('Rival');
  });

  it('splits winning and losing questions and lists rivals named instead', () => {
    const s = questionSummary(brand, 'losing') as any;
    expect(s.winningCount).toBe(1);
    expect(s.questions.map((q: any) => q.question)).toEqual(['cheap plumber']);
    expect(s.questions[0].rivalsNamedInstead).toEqual(['Other']);
  });

  it('filters answers and flags the brand\'s own cited site', () => {
    expect((mentionList(brand, { named: true }) as any).answers).toHaveLength(1);
    expect((mentionList(brand, { engine: 'claude' }) as any).total).toBe(1);
    const src = sourceSummary(brand) as any;
    expect(src.sources.find((x: any) => x.domain === 'acme.com').isYourSite).toBe(true);
    expect(src.ownSiteCitations).toBe(2);
  });

  it('reports an unscanned brand', () => {
    expect(visibilitySummary({ name: 'New', runs: [] }).scanned).toBe(false);
    expect(engineName('gpt-4o-mini')).toBe('ChatGPT');
    expect(engineName('sonar-pro')).toBe('Perplexity');
  });
});

describe('API key helpers', () => {
  it('generates keys in the lsv_ format with a short display hint', () => {
    const k = generateApiKey();
    expect(looksLikeApiKey(k)).toBe(true);
    expect(keyHint(k)).toMatch(/^lsv_.{4}…$/);
    expect(generateApiKey()).not.toBe(k);
  });

  it('rejects malformed keys before any lookup', () => {
    expect(looksLikeApiKey('lsv_short')).toBe(false);
    expect(looksLikeApiKey('Bearer xyz')).toBe(false);
  });

  it('cleans key names', () => {
    expect(cleanKeyName('  Claude   desktop ')).toBe('Claude desktop');
    expect(cleanKeyName('')).toMatch(/^Key created /);
    expect(cleanKeyName('x'.repeat(200))).toHaveLength(60);
  });
});

describe('OAuth helpers', async () => {
  const { isAllowedRedirectUri, pkceChallenge, isValidVerifier, isValidChallenge, looksLikeAccessToken } = await import('@/lib/oauth');

  it('allows https and loopback http redirect URIs only', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost:6274/oauth/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://127.0.0.1:33418/')).toBe(true);
    expect(isAllowedRedirectUri('http://evil.com/cb')).toBe(false);
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirectUri('https://a.com/cb#frag')).toBe(false);
    expect(isAllowedRedirectUri('https://user:pw@a.com/cb')).toBe(false);
  });

  it('computes the RFC 7636 S256 challenge', () => {
    // Test vector from RFC 7636 appendix B.
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(isValidVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(true);
    expect(isValidVerifier('short')).toBe(false);
    expect(isValidChallenge('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(true);
  });

  it('recognises access tokens by shape', () => {
    expect(looksLikeAccessToken('lsva_' + 'a'.repeat(43))).toBe(true);
    expect(looksLikeAccessToken('lsv_' + 'a'.repeat(43))).toBe(false);
  });
});
