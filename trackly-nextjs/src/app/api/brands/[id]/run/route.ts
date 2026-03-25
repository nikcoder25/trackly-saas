import { pool, auditLog } from '@/lib/db';
import { verifyRequestAuth } from '@/lib/auth';
import { getBrandWithAccess, uid, decryptApiKeys } from '@/lib/helpers';
import { getPlanLimits } from '@/lib/constants';
import { queryAI, getDefaultModel, estimateCost } from '@/lib/ai-platforms';
import { parseResponse, buildBrandMatcher, detectCompetitors } from '@/lib/parser';

const PLATFORM_KEY_MAP: Record<string, string> = {
  ChatGPT: 'openai', Perplexity: 'perplexity', Claude: 'claude', Gemini: 'gemini', Grok: 'grok',
};
const PLATFORMS = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok'];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  const { id } = await params;

  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot run queries' }, { status: 403 });

  const brand = access.brand;
  const planResult = await pool.query('SELECT plan, api_keys FROM users WHERE id = $1', [user.id]);
  const plan = planResult.rows[0]?.plan || 'free';
  const limits = getPlanLimits(plan);
  const queries = brand.queries || [];

  if (!queries.length) return Response.json({ error: 'No queries configured. Add queries in Brand Setup.' }, { status: 400 });

  // Get API keys (server keys + user keys)
  const userKeys = decryptApiKeys(planResult.rows[0]?.api_keys || {});
  const serverKeys: Record<string, string[]> = {};
  for (const [plat, envKey] of Object.entries(PLATFORM_KEY_MAP)) {
    const envVar = `${envKey.toUpperCase()}_API_KEY`;
    const keys = (process.env[envVar] || '').split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length) serverKeys[plat] = keys;
  }

  // Determine active platforms
  const activePlatforms = PLATFORMS.filter(p => {
    const keyName = PLATFORM_KEY_MAP[p];
    return (serverKeys[p]?.length || userKeys[keyName]) ? true : false;
  }).slice(0, limits.platforms);

  if (!activePlatforms.length) return Response.json({ error: 'No API keys configured. Add keys in your account settings or contact admin.' }, { status: 400 });

  const runId = uid();
  const matcher = buildBrandMatcher(brand);
  const allResults: Array<Record<string, unknown>> = [];
  const platformStats: Record<string, { queries: number; mentions: number; sov: number; errors: number }> = {};
  let totalMentions = 0;
  let totalQueries = 0;

  // Execute queries across platforms
  for (const platform of activePlatforms) {
    const keyName = PLATFORM_KEY_MAP[platform];
    const apiKey = userKeys[keyName] || serverKeys[platform]?.[0];
    if (!apiKey) continue;

    const model = getDefaultModel(platform);
    let platMentions = 0;
    let platErrors = 0;

    for (const query of queries) {
      try {
        const result = await queryAI(platform, query, apiKey, model, brand);
        const parsed = parseResponse(result.text, brand, query, matcher);
        const competitors = detectCompetitors(result.text, matcher);
        const cost = estimateCost(result.model, result.tokensIn, result.tokensOut);

        const entry = {
          query, platform, model: result.model, mentioned: parsed.mentioned,
          recommended: parsed.recommended, sentiment: parsed.sentiment,
          position: parsed.listPosition, citations: parsed.cites,
          competitors, snippet: result.text.substring(0, 200),
          tokensIn: result.tokensIn, tokensOut: result.tokensOut, cost,
        };
        allResults.push(entry);

        if (parsed.mentioned) { platMentions++; totalMentions++; }
        totalQueries++;

        // Store in prompt_runs table
        const prId = uid();
        await pool.query(
          `INSERT INTO prompt_runs (id, brand_id, prompt, platform, model, mentioned, sentiment, recommended, list_position, citations, competitor_mentions, success, batch_id, meta)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, $12, $13)`,
          [prId, id, query, platform, result.model, parsed.mentioned, parsed.sentiment, parsed.recommended,
           parsed.listPosition, JSON.stringify(parsed.cites), JSON.stringify(competitors), runId,
           JSON.stringify({ tokensIn: result.tokensIn, tokensOut: result.tokensOut, cost })]
        );
      } catch (e) {
        platErrors++;
        allResults.push({ query, platform, model, mentioned: false, error: (e as Error).message });
        totalQueries++;
      }
    }

    const platTotal = queries.length;
    platformStats[platform] = {
      queries: platTotal, mentions: platMentions,
      sov: platTotal > 0 ? Math.round((platMentions / platTotal) * 100) : 0,
      errors: platErrors,
    };
  }

  // Calculate overall SOV
  const overallSov = totalQueries > 0 ? Math.round((totalMentions / totalQueries) * 100) : 0;

  // Save run to brand data
  const run = {
    id: runId, date: new Date().toISOString(), sov: overallSov,
    totalQ: totalQueries, totalM: totalMentions,
    platforms: platformStats, allResults,
  };

  // Update brand in DB
  const brandData = { ...brand };
  delete brandData.id; delete brandData.userId; delete brandData.createdAt; delete brandData.updatedAt;
  if (!brandData.runs) brandData.runs = [];
  brandData.runs.push(run);
  // Keep SOV history
  if (!brandData.sovHistory) brandData.sovHistory = [];
  brandData.sovHistory.push({ date: run.date, sov: overallSov, platforms: Object.fromEntries(Object.entries(platformStats).map(([k, v]) => [k, v.sov])) });

  await pool.query('UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(brandData), id]);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  auditLog(user.id, 'run_queries', 'brand', id, { runId, queries: totalQueries, mentions: totalMentions, sov: overallSov }, ip);

  return Response.json({ run, runId });
}
