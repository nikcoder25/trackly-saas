/**
 * The Livesov MCP tools. Every tool goes through `ctx.api`, which calls the
 * app's own API route handlers as the key's owner, so plan limits, team
 * access, credits and rate limits are enforced exactly as in the dashboard.
 */

import { ToolError, textResult, type ToolDef } from './protocol';
import {
  brandBrief, competitorSummary, mentionList, questionSummary, sourceSummary, visibilitySummary, ENGINES,
} from './summarize';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ApiResponse { status: number; data: any }
export interface McpContext {
  api: (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) => Promise<ApiResponse>;
}

const BRAND_ID = {
  type: 'string',
  description: 'Brand id from list_brands. Optional when the account has exactly one brand.',
};

function apiError(res: ApiResponse, fallback: string): never {
  const msg = (res.data && typeof res.data.error === 'string' && res.data.error) || fallback;
  throw new ToolError(msg);
}

async function allBrands(ctx: McpContext): Promise<any[]> {
  const res = await ctx.api('GET', '/api/brands');
  if (res.status !== 200) apiError(res, 'Could not load your brands.');
  return [...(res.data.brands || []), ...(res.data.sharedBrands || [])];
}

/** Resolves the brand id argument, defaulting to the only brand. */
async function resolveBrandId(ctx: McpContext, raw: unknown): Promise<string> {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  const brands = await allBrands(ctx);
  if (brands.length === 1) return String(brands[0].id);
  if (brands.length === 0) throw new ToolError('This account has no brands yet. Add one in the Livesov dashboard first.');
  throw new ToolError(`This account has ${brands.length} brands. Pass brand_id (from list_brands): ${brands.map(b => `${b.name} = ${b.id}`).join('; ')}`);
}

async function loadBrand(ctx: McpContext, rawId: unknown): Promise<any> {
  const id = await resolveBrandId(ctx, rawId);
  const res = await ctx.api('GET', `/api/brands/${encodeURIComponent(id)}`);
  if (res.status === 404) throw new ToolError(`No brand with id ${id} on this account. Call list_brands to see valid ids.`);
  if (res.status !== 200) apiError(res, 'Could not load that brand.');
  return res.data.brand;
}

const NOT_SCANNED = (name: string) => `${name} has not been scanned yet. Call start_scan to run the first scan.`;

const pct = (n: number | null | undefined) => (n == null ? 'n/a' : `${n}%`);
const pts = (n: number) => `${n} pt${Math.abs(n) === 1 ? '' : 's'}`;
const signed = (n: number | null | undefined) => (n == null ? 'no earlier scan' : n === 0 ? 'no change' : `${n > 0 ? '+' : '-'}${pts(Math.abs(n))}`);

/* ─── Rank tracking helpers ─── */

const WEBSITE = {
  type: 'string',
  description: 'Website id or domain (like example.com) from list_rank_websites. Optional when only one website is tracked.',
};

const bareDomain = (s: string) => s.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];

async function rankWebsites(ctx: McpContext): Promise<{ id: string; domain: string }[]> {
  const res = await ctx.api('GET', '/api/rank-tracking/websites');
  if (res.status !== 200) apiError(res, 'Could not load your tracked websites.');
  return res.data.websites || [];
}

/** Website id from an id, a domain or nothing (the only website). */
async function resolveWebsiteId(ctx: McpContext, raw: unknown): Promise<string> {
  const sites = await rankWebsites(ctx);
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (v) {
    const hit = sites.find(s => s.id === v) || sites.find(s => bareDomain(s.domain) === bareDomain(v));
    if (hit) return hit.id;
    throw new ToolError(`No tracked website matches "${v}". Tracked: ${sites.map(s => s.domain).join(', ') || 'none yet'}. Add keywords with add_rank_keywords to start tracking a site.`);
  }
  if (sites.length === 1) return sites[0].id;
  if (!sites.length) throw new ToolError('No websites are tracked yet. Call add_rank_keywords with a domain and keywords to start.');
  throw new ToolError(`This account tracks ${sites.length} websites. Pass website: ${sites.map(s => s.domain).join(', ')}`);
}

const rankText = (r: number | null | undefined) => (r == null ? 'not in results' : `#${r}`);
const moveText = (c: number) => (c === 0 ? 'no change' : c > 0 ? `up ${c}` : `down ${-c}`);

export const TOOLS: ToolDef<McpContext>[] = [
  {
    name: 'list_brands',
    title: 'List brands',
    description: 'Lists the brands on this Livesov account (own and team-shared) with their latest share of voice and last scan time. Use the returned id as brand_id in other tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(_args, ctx) {
      const brands = (await allBrands(ctx)).map(brandBrief);
      const lines = brands.map(b => `- ${b.name} (id ${b.id})${b.location ? `, ${b.location}` : ''}: ${b.sov == null ? 'not scanned yet' : `SOV ${b.sov}%, last scan ${b.lastScanAt}`}${b.locked ? ' [locked by plan]' : ''}${b.shared ? ' [shared with you]' : ''}`);
      return textResult(brands.length ? `${brands.length} brand(s):\n${lines.join('\n')}` : 'No brands yet.', { brands });
    },
  },
  {
    name: 'get_visibility',
    title: 'Get AI visibility',
    description: 'Headline AI visibility for a brand from its latest scan: share of voice (percent of AI answers naming the brand), change since the previous scan, per-engine scores, tone, goal progress and recent history.',
    inputSchema: { type: 'object', properties: { brand_id: BRAND_ID }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, ctx) {
      const brand = await loadBrand(ctx, args.brand_id);
      const s = visibilitySummary(brand);
      if (!s.scanned) return textResult(NOT_SCANNED(s.brand), s);
      const eng = s.engines.map(e => `${e.engine} ${pct(e.sov)} (${signed(e.change)})`).join(', ');
      return textResult(
        `${s.brand}: share of voice ${s.shareOfVoice}% (${signed(s.changeSinceLastScan)}), named in ${s.answersNamingBrand} of ${s.answersTotal} answers. ` +
        `By engine: ${eng || 'none'}. Positive tone: ${pct(s.positiveTonePercent)}.` +
        (s.goal ? ` Goal ${s.goal}%: ${s.pointsToGoal ? `${pts(s.pointsToGoal)} to go` : 'reached'}.` : '') +
        ` Last scan ${s.lastScanAt}.`,
        s,
      );
    },
  },
  {
    name: 'get_competitors',
    title: 'Get competitor ranking',
    description: 'Ranks the brand against the rivals AI engines named in the latest scan, by share of mentions, with change since the previous scan and the gap to the next rival above.',
    inputSchema: { type: 'object', properties: { brand_id: BRAND_ID }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, ctx) {
      const brand = await loadBrand(ctx, args.brand_id);
      const s = competitorSummary(brand);
      if (!s.scanned) return textResult(NOT_SCANNED(s.brand), s);
      const lines = s.rows.slice(0, 10).map(r => `${r.rank}. ${r.name}${r.you ? ' (you)' : ''}: ${r.share}% (${signed(r.change)})`);
      const head = s.rows.length <= 1 ? `No rivals were named in the last scan.`
        : `${s.brand} ranks #${s.rank} of ${s.of}.${s.nextRivalToPass ? ` ${pts(s.nextRivalToPass.pointsBehind)} behind ${s.nextRivalToPass.name}.` : ' Leading the category.'}`;
      return textResult(`${head}\n${lines.join('\n')}`, s);
    },
  },
  {
    name: 'get_questions',
    title: 'Get buyer questions',
    description: 'Per tracked buyer question, which AI engines named the brand in the latest scan and which rivals they named instead. A question is "winning" when at least half the engines named the brand. Filter to the losing ones to find gaps.',
    inputSchema: {
      type: 'object',
      properties: { brand_id: BRAND_ID, filter: { type: 'string', enum: ['all', 'winning', 'losing'], default: 'all' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, ctx) {
      const brand = await loadBrand(ctx, args.brand_id);
      const f = args.filter === 'winning' || args.filter === 'losing' ? args.filter : 'all';
      const s = questionSummary(brand, f);
      if (!s.scanned) return textResult(NOT_SCANNED(s.brand), s);
      const lines = s.questions.slice(0, 25).map(q =>
        `- "${q.question}": named by ${q.enginesNamingBrand.join(', ') || 'no engine'}` +
        (q.rivalsNamedInstead.length ? `; rivals named: ${q.rivalsNamedInstead.join(', ')}` : ''));
      return textResult(`${s.winningCount} winning, ${s.losingCount} losing.\n${lines.join('\n') || 'No questions match.'}`, s);
    },
  },
  {
    name: 'get_mentions',
    title: 'Get AI answers',
    description: 'The actual AI answers from the latest scan, with an excerpt, whether the brand was named, its position in the list, tone, rivals named and cited sources. Filter by engine, question text or named/not named.',
    inputSchema: {
      type: 'object',
      properties: {
        brand_id: BRAND_ID,
        engine: { type: 'string', enum: [...ENGINES] },
        question: { type: 'string', description: 'Only answers whose question contains this text.' },
        named: { type: 'boolean', description: 'true: only answers that named the brand; false: only answers that did not.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, ctx) {
      const brand = await loadBrand(ctx, args.brand_id);
      const s = mentionList(brand, {
        engine: typeof args.engine === 'string' ? args.engine : undefined,
        question: typeof args.question === 'string' ? args.question : undefined,
        named: typeof args.named === 'boolean' ? args.named : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      if (!s.scanned) return textResult(NOT_SCANNED(s.brand), s);
      const lines = s.answers.map(a => `- ${a.engine} on "${a.question}": ${a.namedBrand ? `named${a.position ? ` at #${a.position}` : ''}${a.sentiment ? `, ${a.sentiment}` : ''}` : 'not named'}. ${a.excerpt.slice(0, 200)}`);
      return textResult(`${s.answers.length} of ${s.total} matching answers:\n${lines.join('\n')}`, s);
    },
  },
  {
    name: 'get_cited_sources',
    title: 'Get cited sources',
    description: 'The websites AI engines cited most in the brand\'s latest scan, with citation counts and whether each is the brand\'s own site. Useful for choosing where to get listed or mentioned.',
    inputSchema: {
      type: 'object',
      properties: { brand_id: BRAND_ID, limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, ctx) {
      const brand = await loadBrand(ctx, args.brand_id);
      const s = sourceSummary(brand, typeof args.limit === 'number' ? args.limit : 15);
      if (!s.scanned) return textResult(NOT_SCANNED(s.brand), s);
      const lines = s.sources.map(x => `- ${x.domain}: ${x.citations} (${x.share}%)${x.isYourSite ? ' [your site]' : ''}`);
      return textResult(`${s.totalCitations} citations, ${s.ownSiteCitations} to your own site.\n${lines.join('\n')}`, s);
    },
  },
  {
    name: 'get_recommendations',
    title: 'Get recommendations',
    description: 'The fix list Livesov generated for the brand: changes most likely to get AI engines to name it, most severe first.',
    inputSchema: {
      type: 'object',
      properties: { brand_id: BRAND_ID, status: { type: 'string', enum: ['open', 'in_progress', 'done', 'ignored', 'all'], default: 'open' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, ctx) {
      const id = await resolveBrandId(ctx, args.brand_id);
      const wanted = typeof args.status === 'string' ? args.status : 'open';
      const status = wanted === 'all' ? '' : wanted;
      const res = await ctx.api('GET', `/api/brands/${encodeURIComponent(id)}/recommendations${status ? `?status=${encodeURIComponent(status)}` : ''}`);
      if (res.status === 403) throw new ToolError('Recommendations are not included in this plan. Upgrade in Livesov to use them.');
      if (res.status !== 200) apiError(res, 'Could not load recommendations.');
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      const recs = (res.data.recommendations || [])
        .map((r: any) => ({ id: r.id, title: r.title, description: r.description || '', severity: r.severity, status: r.status, category: r.category || null, engine: r.platform || null }))
        .sort((a: any, b: any) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
      const lines = recs.map((r: any) => `- [${r.severity}] ${r.title} (id ${r.id}, ${r.status})${r.description ? `: ${r.description}` : ''}`);
      return textResult(recs.length ? `${recs.length} recommendation(s):\n${lines.join('\n')}` : 'No recommendations with that status.', { recommendations: recs });
    },
  },
  {
    name: 'update_recommendation',
    title: 'Update a recommendation',
    description: 'Sets the status of one recommendation, for example marking it done after the change is made on the website.',
    inputSchema: {
      type: 'object',
      properties: {
        brand_id: BRAND_ID,
        recommendation_id: { type: 'string', description: 'id from get_recommendations' },
        status: { type: 'string', enum: ['open', 'in_progress', 'done', 'ignored'] },
      },
      required: ['recommendation_id', 'status'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async handler(args, ctx) {
      const statuses = ['open', 'in_progress', 'done', 'ignored'];
      if (typeof args.recommendation_id !== 'string' || !args.recommendation_id) throw new ToolError('recommendation_id is required.');
      if (typeof args.status !== 'string' || !statuses.includes(args.status)) throw new ToolError(`status must be one of ${statuses.join(', ')}.`);
      const id = await resolveBrandId(ctx, args.brand_id);
      const res = await ctx.api('PUT', `/api/brands/${encodeURIComponent(id)}/recommendations`, { id: args.recommendation_id, status: args.status });
      if (res.status !== 200) apiError(res, 'Could not update that recommendation.');
      return textResult(`Recommendation ${args.recommendation_id} is now ${args.status}.`, { id: args.recommendation_id, status: args.status });
    },
  },
  {
    name: 'get_accuracy',
    title: 'Get accuracy issues',
    description: 'Wrong facts AI engines state about the brand (hours, prices, locations and so on), compared with the facts saved in Livesov, plus the overall accuracy rate.',
    inputSchema: {
      type: 'object',
      properties: { brand_id: BRAND_ID, include_fixed: { type: 'boolean', default: false } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, ctx) {
      const id = await resolveBrandId(ctx, args.brand_id);
      const res = await ctx.api('GET', `/api/brands/${encodeURIComponent(id)}/accuracy`);
      if (res.status === 403) throw new ToolError('The accuracy monitor is not included in this plan.');
      if (res.status !== 200) apiError(res, 'Could not load accuracy data.');
      const all: any[] = Array.isArray(res.data.issues) ? res.data.issues : [];
      const issues = all.filter(i => args.include_fixed === true || !i.fixed).map(i => ({
        engine: i.platform, fact: i.fact_key, aiSaid: i.found, truth: i.expected, severity: i.severity, question: i.query || null, fixed: !!i.fixed,
      }));
      const lines = issues.slice(0, 25).map(i => `- [${i.severity}] ${i.engine} says ${i.fact} is "${i.aiSaid}" (truth: "${i.truth}")${i.fixed ? ' [fixed]' : ''}`);
      const rate = res.data.accuracyRate;
      return textResult(
        `Accuracy rate: ${rate == null ? 'not checked yet' : `${rate}%`}. ${all.filter(i => !i.fixed).length} open issue(s).${lines.length ? '\n' + lines.join('\n') : ''}`,
        { accuracyRate: rate ?? null, openIssues: all.filter(i => !i.fixed).length, issues },
      );
    },
  },
  {
    name: 'get_credits',
    title: 'Get scan credits',
    description: 'The account\'s plan, remaining scan credits this month, manual scans left today and when credits reset.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(_args, ctx) {
      const res = await ctx.api('GET', '/api/credits/status');
      if (res.status !== 200) apiError(res, 'Could not load credit status.');
      const d = res.data || {};
      const out = {
        plan: d.label || d.plan, creditsRemaining: d.remaining, monthlyCredits: d.monthlyCap, manualScansLeftToday: d.manualRemainingToday,
        scheduledScans: !!d.scheduledRuns, resetsAt: d.nextResetAt || null,
      };
      return textResult(`${out.plan} plan: ${out.creditsRemaining} of ${out.monthlyCredits} credits left, ${out.manualScansLeftToday} manual scans left today. Resets ${out.resetsAt}.`, out);
    },
  },
  {
    name: 'start_scan',
    title: 'Start a scan',
    description: 'Starts a fresh scan: asks every tracked question to the brand\'s AI engines. Spends scan credits, so only call it when the user asks for new data. Returns a run_id; check progress with get_scan_status. A scan usually takes a few minutes.',
    inputSchema: { type: 'object', properties: { brand_id: BRAND_ID }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async handler(args, ctx) {
      const id = await resolveBrandId(ctx, args.brand_id);
      const res = await ctx.api('POST', `/api/brands/${encodeURIComponent(id)}/run`, {});
      if (res.status === 409) throw new ToolError('A scan is already running for this brand. Check it with get_scan_status, or wait for it to finish.');
      if (res.status === 429) throw new ToolError('Too many scans started recently. Wait a few minutes and try again.');
      if (res.status !== 200) apiError(res, 'Could not start the scan.');
      const d = res.data || {};
      return textResult(
        d.syncCompleted
          ? `Scan finished right away (results were cached). Run id ${d.runId}. Call get_visibility for the new numbers.`
          : `Scan started for ${Array.isArray(d.queries) ? d.queries.length : '?'} question(s) on ${Array.isArray(d.platforms) ? d.platforms.join(', ') : 'the brand\'s engines'}. Run id ${d.runId}. Check progress with get_scan_status.`,
        { runId: d.runId, brandId: id, expectedAnswers: d.totalExpected ?? null, engines: d.platforms || [], finished: !!d.syncCompleted },
      );
    },
  },
  {
    name: 'get_scan_status',
    title: 'Get scan status',
    description: 'Progress of a scan started with start_scan.',
    inputSchema: {
      type: 'object',
      properties: { brand_id: BRAND_ID, run_id: { type: 'string', description: 'run_id from start_scan' } },
      required: ['run_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, ctx) {
      if (typeof args.run_id !== 'string' || !args.run_id) throw new ToolError('run_id is required.');
      const id = await resolveBrandId(ctx, args.brand_id);
      // since=a large offset keeps the per-answer payload out of the response.
      const res = await ctx.api('GET', `/api/brands/${encodeURIComponent(id)}/run-status/${encodeURIComponent(args.run_id)}?since=1000000`);
      if (res.status === 404 || res.status === 403 || res.status === 400) throw new ToolError('No scan with that run_id for this brand.');
      if (res.status !== 200) apiError(res, 'Could not load scan status.');
      const d = res.data || {};
      const status = d.status === 'done' ? 'finished' : d.status === 'error' ? 'failed' : 'running';
      const out = {
        runId: args.run_id, status, finished: status !== 'running',
        answersIn: Number(d.received) || 0, answersExpected: Number(d.totalExpected) || null,
        answersNamingBrand: Number(d.foundCount) || 0, errors: Number(d.errorCount) || 0,
        error: status === 'failed' ? String(d.error || 'unknown error') : null,
      };
      return textResult(
        status === 'finished' ? `Scan finished: ${out.answersIn} answers, ${out.answersNamingBrand} named the brand. Call get_visibility for the full picture.`
          : status === 'failed' ? `Scan failed: ${out.error}.`
          : `Scan running: ${out.answersIn}${out.answersExpected ? ` of ${out.answersExpected}` : ''} answers in so far.`,
        out,
      );
    },
  },
  {
    name: 'list_rank_websites',
    title: 'List rank-tracked websites',
    description: 'Websites tracked in Google rank tracking with keyword count, average position, keywords in the top 3 and top 10, and average change. Use the domain as website in get_rank_positions.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(_args, ctx) {
      const res = await ctx.api('GET', '/api/rank-tracking/summary');
      if (res.status !== 200) apiError(res, 'Could not load rank tracking.');
      const d = res.data || {};
      const sites = (d.websites || []).map((w: any) => ({
        id: w.id, domain: w.domain, trackedFrom: w.city || null, keywords: w.keywords, averagePosition: w.avg,
        top3: w.top3, top10: w.top10, averageChange: w.change, aiShareOfVoice: w.sov,
      }));
      const lines = sites.map((w: any) => `- ${w.domain} (id ${w.id}): ${w.keywords} keywords, avg position ${w.averagePosition ?? 'n/a'}, ${w.top3} in top 3, ${w.top10} in top 10, ${moveText(Math.round(w.averageChange || 0))}${w.trackedFrom ? `, from ${w.trackedFrom}` : ''}`);
      return textResult(
        sites.length ? `${sites.length} website(s). Last check ${d.lastCheck || 'not yet'}, next ${d.nextCheck || 'n/a'}.\n${lines.join('\n')}` : 'No websites are tracked yet. Call add_rank_keywords to start.',
        { websites: sites, lastCheck: d.lastCheck || null, nextCheck: d.nextCheck || null },
      );
    },
  },
  {
    name: 'get_rank_positions',
    title: 'Get Google rank positions',
    description: 'Google position of every tracked keyword for a website from the latest check: rank, change since the previous check, best rank, ranking URL, location and device. Keywords whose first check has not run yet show as pending.',
    inputSchema: {
      type: 'object',
      properties: {
        website: WEBSITE,
        keyword: { type: 'string', description: 'Only keywords containing this text.' },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Max keywords to return (default 100).' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(args, ctx) {
      const id = await resolveWebsiteId(ctx, args.website);
      const res = await ctx.api('GET', `/api/rank-tracking/websites/${encodeURIComponent(id)}`);
      if (res.status === 404) throw new ToolError('That website is not tracked on this account.');
      if (res.status !== 200) apiError(res, 'Could not load rank positions.');
      const d = res.data || {};
      const filter = typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : '';
      const limit = Math.min(500, Math.max(1, Number(args.limit) || 100));
      const all = (d.keywords || []).filter((k: any) => !filter || String(k.keyword).toLowerCase().includes(filter));
      const rows = all.slice(0, limit).map((k: any) => ({
        keyword: k.keyword, rank: k.rank, change: k.change, best: k.best, url: k.url, location: k.city || k.locationName,
        device: k.device, depth: k.depth, checkedAt: k.checkedAt, nextCheckAt: k.nextCheckAt, pending: !!k.pending, error: k.error || null,
      }));
      const lines = rows.map((k: any) => `- ${k.keyword}: ${k.pending ? 'first check pending' : k.error ? `check failed (${k.error})` : `${rankText(k.rank)} (${moveText(k.change || 0)})`}${k.url ? ` ${k.url}` : ''}`);
      const st = d.stats || {};
      return textResult(
        `${d.website?.domain}: ${st.ranking ?? 0} of ${st.total ?? 0} keywords ranking, ${st.top10 ?? 0} in top 10, ${st.up ?? 0} up, ${st.down ?? 0} down. Next check ${st.nextCheck || 'n/a'}.` +
          (rows.length ? `\n${lines.join('\n')}` : '\nNo keywords match.') +
          (all.length > rows.length ? `\n(${all.length - rows.length} more not shown; raise limit or filter by keyword.)` : ''),
        { website: d.website, stats: st, keywords: rows, total: all.length },
      );
    },
  },
  {
    name: 'add_rank_keywords',
    title: 'Track keywords on Google',
    description: 'Starts tracking Google positions for keywords on a website. The first check runs within about 10 minutes, then weekly or daily. Uses rank tracking credits (keywords x checks a month, x2 for top 100), so only call it when the user asks.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Website to track, like example.com.' },
        keywords: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 1000, description: 'Keywords to track.' },
        location: { type: 'string', description: 'Where to search from: a city, state or country like "Berlin, Germany" or "United States". Default United States.' },
        device: { type: 'string', enum: ['desktop', 'mobile'], description: 'Default desktop.' },
        frequency: { type: 'string', enum: ['weekly', 'daily'], description: 'Default weekly.' },
        depth: { type: 'integer', enum: [30, 100], description: 'How many results to check. Default 30.' },
      },
      required: ['domain', 'keywords'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async handler(args, ctx) {
      const domain = typeof args.domain === 'string' ? args.domain.trim() : '';
      if (!domain) throw new ToolError('domain is required, like example.com.');
      const keywords = Array.isArray(args.keywords) ? args.keywords.filter((k: unknown) => typeof k === 'string' && k.trim()) : [];
      if (!keywords.length) throw new ToolError('Pass at least one keyword.');
      const res = await ctx.api('POST', '/api/rank-tracking/keywords', {
        domain, keywords,
        locationName: typeof args.location === 'string' && args.location.trim() ? args.location.trim() : 'United States',
        device: args.device === 'mobile' ? 'mobile' : 'desktop',
        frequency: args.frequency === 'daily' ? 'daily' : 'weekly',
        depth: Number(args.depth) === 100 ? 100 : 30,
        checkAi: false,
      });
      if (res.status !== 200 && res.status !== 201) apiError(res, 'Could not add the keywords.');
      const d = res.data || {};
      return textResult(
        `Tracking ${d.added ?? 0} new keyword(s) on ${domain} from ${d.location || 'the chosen location'}.` +
          (d.skipped ? ` ${d.skipped} were already tracked.` : '') +
          ' The first check runs within about 10 minutes; then call get_rank_positions.',
        { websiteId: d.websiteId, added: d.added ?? 0, skipped: d.skipped ?? 0, location: d.location || null },
      );
    },
  },
  {
    name: 'get_rank_credits',
    title: 'Get rank tracking credits',
    description: 'Rank tracking credits: monthly allowance, credits the tracked keywords use each month, credits charged so far, and whether daily and top 100 checks are on the plan.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async handler(_args, ctx) {
      const res = await ctx.api('GET', '/api/rank-tracking/credits');
      if (res.status !== 200) apiError(res, 'Could not load rank tracking credits.');
      const d = res.data || {};
      const out = {
        plan: d.plan, allowance: d.allowance, committedPerMonth: d.committed, usedThisMonth: d.usedThisMonth,
        left: Math.max(0, (d.allowance || 0) - (d.committed || 0)), resetsAt: d.resetsAt, dailyChecks: !!d.allowsDaily, top100: !!d.allowsTop100,
      };
      return textResult(`Rank tracking: ${out.committedPerMonth} of ${out.allowance} credits a month in use (${out.left} free), ${out.usedThisMonth} charged this month. Daily checks ${out.dailyChecks ? 'on' : 'off'}, top 100 ${out.top100 ? 'on' : 'off'}. Resets ${out.resetsAt}.`, out);
    },
  },
];
