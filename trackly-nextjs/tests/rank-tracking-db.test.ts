/**
 * Rank tracking against a real Postgres and a stub DataForSEO server:
 * add keywords, queue page 1, collect, early-stop on later pages, store the
 * checks, read them back, fire an alert, build reports, import a Serpfox
 * CSV and open a client view. Skipped without DATABASE_URL (CI has one).
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RANKS: Record<string, number> = { 'ac repair austin': 4, 'furnace repair austin': 17 };
const tasks = new Map<string, { task: Record<string, unknown>; collected: boolean }>();
let server: http.Server;

function serp(task: Record<string, unknown>) {
  const start = Number(String(task.search_param || '').replace(/\D/g, '')) || 0;
  const page = start / 10 + 1;
  const pos = RANKS[String(task.keyword)];
  const items = [{ type: 'paid', rank_group: 1, url: 'https://www.example.com/ad', domain: 'www.example.com' }];
  for (let i = 1; i <= 10; i++) {
    const abs = start + i;
    const mine = abs === pos;
    items.push({ type: 'organic', rank_group: i, url: mine ? `https://www.example.com/p${abs}/` : `https://other${abs}.com/`, domain: mine ? 'www.example.com' : `other${abs}.com` });
  }
  return { items, page };
}

const DB = !!process.env.DATABASE_URL;

describe.skipIf(!DB)('rank tracking with a database', () => {
  // Loaded after the stub is listening, so DATAFORSEO_BASE_URL is set first.
  let m: {
    db: typeof import('@/lib/db');
    schema: typeof import('@/lib/rank-tracking/schema');
    kw: typeof import('@/lib/rank-tracking/keywords');
    sched: typeof import('@/lib/rank-tracking/scheduler');
    q: typeof import('@/lib/rank-tracking/queries');
    rep: typeof import('@/lib/rank-tracking/reports');
    imp: typeof import('@/lib/rank-tracking/import');
    cl: typeof import('@/lib/rank-tracking/clients');
    acc: typeof import('@/lib/rank-tracking/access');
  };
  const user = 'rt_test_' + Date.now();
  const brand = 'rt_brand_' + Date.now();

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const send = (o: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
        const url = req.url || '';
        const t = body ? JSON.parse(body)[0] : {};
        if (url.endsWith('/serp/google/organic/task_post')) {
          const id = 'task-' + Math.random().toString(36).slice(2);
          tasks.set(id, { task: t, collected: false });
          return send({ status_code: 20000, tasks: [{ id, status_code: 20100, cost: 0.0006 }] });
        }
        if (url.endsWith('/serp/google/organic/tasks_ready')) {
          return send({ status_code: 20000, tasks: [{ status_code: 20000, result: [...tasks].filter(([, v]) => !v.collected).map(([id]) => ({ id })) }] });
        }
        const get = url.match(/task_get\/advanced\/(.+)$/);
        if (get) {
          const rec = tasks.get(decodeURIComponent(get[1]));
          if (!rec) return send({ status_code: 20000, tasks: [{ status_code: 40400, status_message: 'not found' }] });
          rec.collected = true;
          return send({ status_code: 20000, tasks: [{ status_code: 20000, cost: 0, data: rec.task, result: [{ items: serp(rec.task).items }] }] });
        }
        if (url.endsWith('/serp/google/organic/live/advanced')) return send({ status_code: 20000, tasks: [{ status_code: 20000, cost: 0.002, result: [{ items: serp(t).items }] }] });
        if (url.endsWith('/serp/google/locations')) {
          return send({ status_code: 20000, tasks: [{ status_code: 20000, result: [
            { location_code: 1026201, location_name: 'Austin,Texas,United States', country_iso_code: 'US', location_type: 'City' },
            { location_code: 1020536, location_name: 'Austin,Minnesota,United States', country_iso_code: 'US', location_type: 'City' },
            { location_code: 1014221, location_name: 'Denver,Colorado,United States', country_iso_code: 'US', location_type: 'City' },
          ] }] });
        }
        if (url.endsWith('/keywords_data/google_ads/search_volume/live')) {
          return send({ status_code: 20000, tasks: [{ status_code: 20000, cost: 0.05, result: (t.keywords as string[]).map((k) => ({ keyword: k, search_volume: 880 })) }] });
        }
        res.statusCode = 404;
        res.end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    process.env.DATAFORSEO_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.DATAFORSEO_LOGIN = 'test';
    process.env.DATAFORSEO_PASSWORD = 'test';
    process.env.RANK_SERP_FALLBACK = 'none';
    m = {
      db: await import('@/lib/db'),
      schema: await import('@/lib/rank-tracking/schema'),
      kw: await import('@/lib/rank-tracking/keywords'),
      sched: await import('@/lib/rank-tracking/scheduler'),
      q: await import('@/lib/rank-tracking/queries'),
      rep: await import('@/lib/rank-tracking/reports'),
      imp: await import('@/lib/rank-tracking/import'),
      cl: await import('@/lib/rank-tracking/clients'),
      acc: await import('@/lib/rank-tracking/access'),
    };
    await m.db.ensureColumns();
    await m.schema.ensureRankSchema();
    await m.db.pool.query(`INSERT INTO users (id, email, plan) VALUES ($1, $2, 'pro')`, [user, `${user}@test.local`]);
    await m.db.pool.query(`INSERT INTO brands (id, user_id, data) VALUES ($1, $2, $3)`, [brand, user, JSON.stringify({ name: 'Example', website: 'https://www.example.com', queries: [] })]);
    await m.db.pool.query(
      `INSERT INTO prompt_runs (id, brand_id, prompt, platform, mentioned, recommended, success) VALUES ($1, $2, 'best ac repair austin', 'chatgpt', TRUE, FALSE, TRUE)`,
      ['pr_' + user, brand]);
  }, 30_000);

  afterAll(async () => {
    if (m) {
      await m.db.pool.query(`DELETE FROM rt_websites WHERE account_id = $1`, [user]);
      await m.db.pool.query(`DELETE FROM rt_alert_rules WHERE account_id = $1`, [user]);
      await m.db.pool.query(`DELETE FROM prompt_runs WHERE brand_id = $1`, [brand]);
      await m.db.pool.query(`DELETE FROM brands WHERE id = $1`, [brand]);
      await m.db.pool.query(`DELETE FROM users WHERE id = $1`, [user]);
    }
    server?.close();
  });

  let websiteId = '';

  it('adds keywords from a city, with volume and AI prompts', async () => {
    const r = await m.kw.addKeywords({
      accountId: user, plan: 'pro', domain: 'https://www.example.com/', keywords: ['ac repair austin', 'furnace repair austin', 'ghost keyword'],
      location: { name: 'Austin, TX' }, device: 'desktop', frequency: 'weekly', depth: 30, checkAi: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    websiteId = r.websiteId;
    expect(r.added).toHaveLength(3);
    expect(r.location).toBe('Austin,Texas,United States');
    expect(r.ai?.added).toBe(3);
    const vol = await m.db.pool.query(`SELECT volume, location_code FROM rt_keywords WHERE website_id = $1`, [websiteId]);
    expect(vol.rows.every((x) => x.volume === 880 && x.location_code === 1026201)).toBe(true);
    const again = await m.kw.addKeywords({ accountId: user, plan: 'pro', domain: 'example.com', keywords: ['ac repair austin'], location: { code: 1026201 }, device: 'desktop', frequency: 'weekly', depth: 30 });
    expect(again.ok && again.added.length).toBe(0);
  });

  it('refuses keywords past the plan limit', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => `kw ${i}`);
    const r = await m.kw.addKeywords({ accountId: user, plan: 'pro', domain: 'example.com', keywords: many, location: { code: 1026201 }, device: 'desktop', frequency: 'weekly', depth: 30 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(402);
  });

  it('checks through the queue and stops early', async () => {
    const d = await m.sched.dispatchDue(50);
    expect(d.queued).toBe(3);
    // Two collectors at once (cron + a first check) must not store a check twice.
    for (let i = 0; i < 5; i++) await Promise.all([m.sched.collectReady(), m.sched.collectReady()]);
    const rows = await m.db.pool.query(
      `SELECT k.keyword, c.rank, c.url, c.pages_fetched, c.cost_usd::float AS cost, c.credits, k.pending_task_id, k.next_check_at
         FROM rt_checks c JOIN rt_keywords k ON k.id = c.keyword_id WHERE k.website_id = $1 ORDER BY k.keyword`, [websiteId]);
    const by = Object.fromEntries(rows.rows.map((r) => [r.keyword, r]));
    expect(by['ac repair austin']).toMatchObject({ rank: 4, pages_fetched: 1, credits: 1, url: 'https://www.example.com/p4/' });
    expect(by['furnace repair austin']).toMatchObject({ rank: 17, pages_fetched: 2 });
    expect(by['ghost keyword']).toMatchObject({ rank: null, pages_fetched: 3 });
    expect(by['ghost keyword'].cost).toBeCloseTo(0.0018);
    expect(rows.rows.every((r) => r.pending_task_id === null)).toBe(true);
    expect(rows.rows).toHaveLength(3);
    const gap = new Date(by['ac repair austin'].next_check_at).getTime() - Date.now();
    expect(gap).toBeGreaterThan(6 * 86400e3);
    const spend = await m.db.pool.query(`SELECT SUM(units)::int AS pages FROM rt_spend WHERE account_id = $1 AND kind = 'serp'`, [user]);
    expect(spend.rows[0].pages).toBe(6);
  });

  it('reads back ranks, AI status and the summary', async () => {
    const d = await m.q.websiteDetail(user, websiteId, 'last');
    expect(d?.stats).toMatchObject({ total: 3, ranking: 2, top10: 1 });
    const ac = d?.keywords.find((k) => k.keyword === 'ac repair austin');
    expect(ac).toMatchObject({ rank: 4, ai: 'mentioned', city: 'Austin, TX', volume: 880 });
    const s = await m.q.rankSummary(user, 'pro', 'last');
    expect(s.spread).toEqual([0, 1, 1, 0, 1]);
    expect(s.websites[0]).toMatchObject({ domain: 'example.com', keywords: 3, avg: 10.5, sov: 100 });
    expect(s.credits).toMatchObject({ allowance: 4000, committed: 12, usedThisMonth: 3 });
  });

  it('fires a rule when a later check enters the top 3', async () => {
    await m.db.pool.query(`INSERT INTO rt_alert_rules (id, account_id, type, threshold, channels) VALUES ($1, $2, 'enters_top', 3, ARRAY['email'])`, ['rule_' + user, user]);
    const k = await m.db.pool.query(
      `SELECT k.id, k.website_id, w.account_id, w.domain, k.keyword, k.location_code, k.location_name, k.device, k.language, k.frequency, k.depth, k.fail_count,
              k.pending_provider, k.pending_task_id, k.pending_page, k.pending_cost, k.pending_pages
         FROM rt_keywords k JOIN rt_websites w ON w.id = k.website_id WHERE k.website_id = $1 AND k.keyword = 'ac repair austin'`, [websiteId]);
    await m.sched.finalizeCheck(k.rows[0], { rank: 2, url: 'https://www.example.com/p2/', pagesFetched: 1, provider: 'dataforseo', cost: 0.0006 });
    const log = await m.db.pool.query(`SELECT message FROM rt_alert_log WHERE account_id = $1 AND kind = 'alert'`, [user]);
    expect(log.rows.map((r) => r.message)).toEqual(['ac repair austin entered the top 3 on example.com (now #2)']);
    const ov = await m.q.rankOverview(user, 'last');
    expect(ov.gainers[0]).toMatchObject({ keyword: 'ac repair austin', change: 2 });
  });

  it('builds every report format', async () => {
    for (const format of m.rep.REPORT_FORMATS) {
      const r = await m.rep.createReport(user, { title: 'Example rankings', format, websiteId, groupId: null, starredOnly: false, includeAi: true, useLogo: true, start: null, end: null, schedule: null, recipients: [] });
      const f = await m.rep.buildReport(r);
      if (format.startsWith('csv')) expect(String(f.body)).toContain('ac repair austin');
      if (format.startsWith('html')) expect(String(f.body)).toContain('<table>');
      if (format.startsWith('pdf')) expect((f.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    }
  });

  it('imports a Serpfox CSV with history', async () => {
    const parsed = m.imp.readSerpfoxCsv('Keyword,URL,Location,2026-10-12,2026-10-19\nplumber denver,https://example.com/plumbing,"Denver, CO",12,9\n');
    const r = await m.imp.importKeywords(user, 'pro', parsed.keywords, '');
    expect(r).toMatchObject({ ok: true, keywords: 1, checks: 2 });
  });

  it('shows a client only what they were given', async () => {
    const created = await m.cl.createClientUser(user, { name: 'Client', email: null, scope: 'starred', websiteIds: [websiteId], groupIds: [] });
    const token = created.url.split('/client/')[1];
    const c = await m.cl.clientByToken(token);
    expect(c?.status).toBe('active');
    await m.db.pool.query(`UPDATE rt_keywords SET starred = TRUE WHERE website_id = $1 AND keyword = 'ac repair austin'`, [websiteId]);
    const d = await m.q.websiteDetail(user, websiteId, 'last', m.acc.clientScopeSql(c!, 1));
    expect(d?.keywords.map((k) => k.keyword)).toEqual(['ac repair austin']);
    expect(await m.cl.clientByToken('not-a-real-token-at-all-123')).toBeNull();
  });
});
