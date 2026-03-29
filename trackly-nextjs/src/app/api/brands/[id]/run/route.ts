import { pool, auditLog } from '@/lib/db';
import { verifyRequestAuth, requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, uid, decryptApiKeys } from '@/lib/helpers';
import { getPlanLimits } from '@/lib/constants';
import { queryAI, getDefaultModel, estimateCost } from '@/lib/ai-platforms';
import { parseResponse, buildBrandMatcher, detectCompetitors } from '@/lib/parser';

const PLATFORM_KEY_MAP: Record<string, string> = {
    ChatGPT: 'openai',
    Perplexity: 'perplexity',
    Claude: 'claude',
    Gemini: 'gemini',
    Grok: 'grok',
};

const PLATFORMS = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok'];

// Parse server API keys from environment variables
// Supports: 1. Comma-separated: OPENAI_API_KEY=sk-key1,sk-key2
//           2. Numbered vars:   OPENAI_API_KEY_1=sk-key1, OPENAI_API_KEY_2=sk-key2
//           Both formats can be combined — all unique keys are merged.
function parseKeys(envVar: string): string[] {
    const keys: string[] = [];
    // Parse comma-separated keys from base var
  const raw = (process.env[envVar] || '').trim();
    if (raw) {
          raw.split(',').map(k => k.trim()).filter(k => k.length > 0).forEach(k => keys.push(k));
    }
    // Parse numbered vars: ENVVAR_1, ENVVAR_2, ... ENVVAR_10
  for (let i = 1; i <= 10; i++) {
        const numbered = (process.env[envVar + '_' + i] || '').trim();
        if (numbered) {
                numbered.split(',').map(k => k.trim()).filter(k => k.length > 0).forEach(k => keys.push(k));
        }
  }
    // Deduplicate
  return [...new Set(keys)];
}

function getServerKeys(): Record<string, string[]> {
    return {
          openai: parseKeys('OPENAI_API_KEY'),
          perplexity: parseKeys('PERPLEXITY_API_KEY'),
          gemini: parseKeys('GEMINI_API_KEY'),
          claude: parseKeys('CLAUDE_API_KEY'),
          grok: parseKeys('GROK_API_KEY'),
    };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    const user = authResult;

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
    const serverKeys = getServerKeys();

  // Determine active platforms
  const activePlatforms = PLATFORMS.filter(p => {
        const keyName = PLATFORM_KEY_MAP[p];
        return (serverKeys[keyName]?.length || userKeys[keyName]) ? true : false;
  }).slice(0, limits.platforms);

  if (!activePlatforms.length) return Response.json({ error: 'No API keys configured. Add keys in your account settings or contact admin.' }, { status: 400 });

  const runId = uid();
    const matcher = buildBrandMatcher(brand);
    const allResults: Array<Record<string, unknown>> = [];
    const platformStats: Record<string, { queries: number; mentions: number; sov: number; errors: number }> = {};
    let totalMentions = 0;
    let totalQueries = 0;

  // Execute queries across all platforms concurrently
  // Each platform runs its queries sequentially (to respect rate limits per API key),
  // but all platforms run in parallel with each other
  await Promise.all(activePlatforms.map(async (platform) => {
        const keyName = PLATFORM_KEY_MAP[platform];
        const apiKey = userKeys[keyName] || serverKeys[keyName]?.[0];
        if (!apiKey) return;

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
                                                                  query, platform, model: result.model,
                                                                  mentioned: parsed.mentioned, recommended: parsed.recommended,
                                                                  sentiment: parsed.sentiment, position: parsed.listPosition,
                                                                  citations: parsed.cites, competitors,
                                                                  snippet: result.text.substring(0, 200),
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
  }));

  // Calculate overall SOV
  const overallSov = totalQueries > 0 ? Math.round((totalMentions / totalQueries) * 100) : 0;

  // Save run to brand data
  const run = {
        id: runId, date: new Date().toISOString(),
        sov: overallSov, totalQ: totalQueries, totalM: totalMentions,
        platforms: platformStats, allResults,
  };

  // Update brand in DB
  const brandData = { ...brand };
    delete brandData.id; delete brandData.userId;
    delete brandData.createdAt; delete brandData.updatedAt;
    if (!brandData.runs) brandData.runs = [];
    brandData.runs.push(run);

  // Keep SOV history
  if (!brandData.sovHistory) brandData.sovHistory = [];
    brandData.sovHistory.push({ date: run.date, sov: overallSov,
                                   platforms: Object.fromEntries(Object.entries(platformStats).map(([k, v]) => [k, v.sov])) });

  await pool.query('UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(brandData), id]);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    auditLog(user.id, 'run_queries', 'brand', id, { runId, queries: totalQueries, mentions: totalMentions, sov: overallSov }, ip);

  return Response.json({ run, runId });
}
