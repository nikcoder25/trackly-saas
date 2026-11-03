import { describe, it, expect } from 'vitest';
import { TOOLS, type McpContext } from '../mcp/tools';

const tool = (n: string) => TOOLS.find(t => t.name === n)!;

function ctx(routes: Record<string, { status: number; data: unknown }>, calls: unknown[] = []): McpContext {
  return {
    async api(method, path, body) {
      calls.push({ method, path, body });
      return routes[`${method} ${path}`] || { status: 404, data: { error: 'nope' } };
    },
  };
}

const sites = { status: 200, data: { websites: [{ id: 'w1', domain: 'igmetallrechner.de' }] } };

describe('rank tracking MCP tools', () => {
  it('get_rank_positions resolves a domain and lists ranks', async () => {
    const c = ctx({
      'GET /api/rank-tracking/websites': sites,
      'GET /api/rank-tracking/websites/w1': { status: 200, data: {
        website: { id: 'w1', domain: 'igmetallrechner.de' },
        stats: { ranking: 1, total: 2, top10: 1, up: 1, down: 0, nextCheck: null },
        keywords: [
          { keyword: 'ig metall rechner', rank: 3, change: 2, url: 'https://igmetallrechner.de/' },
          { keyword: 'tarif rechner', rank: null, change: 0, pending: true },
        ],
      } },
    });
    const r = await tool('get_rank_positions').handler({ website: 'https://www.igmetallrechner.de/' }, c);
    const text = JSON.stringify(r);
    expect(text).toContain('ig metall rechner: #3 (up 2)');
    expect(text).toContain('tarif rechner: first check pending');
  });

  it('get_rank_positions errors clearly for an untracked site', async () => {
    await expect(tool('get_rank_positions').handler({ website: 'other.com' }, ctx({ 'GET /api/rank-tracking/websites': sites })))
      .rejects.toThrow(/No tracked website matches/);
  });

  it('add_rank_keywords posts to the keywords route with defaults', async () => {
    const calls: any[] = [];
    const c = ctx({ 'POST /api/rank-tracking/keywords': { status: 200, data: { websiteId: 'w1', added: 2, skipped: 0, location: 'Germany' } } }, calls);
    const r = await tool('add_rank_keywords').handler({ domain: 'igmetallrechner.de', keywords: ['a', 'b'], location: 'Germany' }, c);
    expect(calls[0].body).toMatchObject({ domain: 'igmetallrechner.de', keywords: ['a', 'b'], locationName: 'Germany', device: 'desktop', frequency: 'weekly', depth: 30 });
    expect(JSON.stringify(r)).toContain('Tracking 2 new keyword');
  });
});
