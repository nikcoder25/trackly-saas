import crypto from 'crypto';
import { pool, auditLog } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, uid, decryptApiKeys } from '@/lib/helpers';
import { getPlanLimits } from '@/lib/constants';
import { queryAI, getDefaultModel, estimateCost } from '@/lib/ai-platforms';
import { parseResponse, buildBrandMatcher, detectCompetitors } from '@/lib/parser';
import { after } from 'next/server';

const PLATFORM_KEY_MAP: Record<string, string> = {
  ChatGPT: 'openai', Perplexity: 'perplexity', Claude: 'claude',
  Gemini: 'gemini', Grok: 'grok',
};
const PLATFORMS = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok'];
const FAIL_THRESHOLD = 5;

function parseKeys(envVar: string): string[] {
  const keys: string[] = [];
  const raw = (process.env[envVar] || '').trim();
  if (raw) raw.split(',').map(k => k.trim()).filter(k => k.length > 0).forEach(k => keys.push(k));
  for (let i = 1; i <= 10; i++) {
    const numbered = (process.env[envVar + '_' + i] || '').trim();
    if (numbered) numbered.split(',').map(k => k.trim()).filter(k => k.length > 0).forEach(k => keys.push(k));
  }
  return [...new Set(keys)];
}

function getServerKeys(): Record<string, string[]> {
  return {
    openai: parseKeys('OPENAI_API_KEY'), perplexity: parseKeys('PERPLEXITY_API_KEY'),
    gemini: parseKeys('GEMINI_API_KEY'), claude: parseKeys('CLAUDE_API_KEY'),
    grok: parseKeys('GROK_API_KEY'),
  };
}

// Auto-create the active_runs table if it doesn't exist
async function ensureActiveRunsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS active_runs (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      total_expected INT DEFAULT 0,
      received INT DEFAULT 0,
      found_count INT DEFAULT 0,
      error_count INT DEFAULT 0,
      results JSONB DEFAULT '[]'::jsonb,
      final_data JSONB,
      error TEXT,
      platforms JSONB DEFAULT '[]'::jsonb,
      queries JSONB DEFAULT '[]'::jsonb,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// Ensure table exists on first call (cached in globalThis)
const g = globalThis as unknown as { _activeRunsTableReady?: boolean };
async function initTable() {
  if (g._activeRunsTableReady) return;
  await ensureActiveRunsTable();
  g._activeRunsTableReady = true;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Allow internal cron calls authenticated via x-cron-secret header
  const cronSecret = process.env.CRON_SECRET;
  const cronHeader = request.headers.get('x-cron-secret');
  let user: { id: string; email?: string };

  if (cronSecret && cronHeader && cronSecret.length === cronHeader.length &&
      crypto.timingSafeEqual(Buffer.from(cronSecret), Buffer.from(cronHeader))) {
    // Internal cron call — resolve brand owner from the brand record
    const { id: brandId } = await params;
    const brandRow = await pool.query('SELECT user_id FROM brands WHERE id = $1', [brandId]);
    if (!brandRow.rows.length) return Response.json({ error: 'Brand not found' }, { status: 404 });
    user = { id: brandRow.rows[0].user_id };
  } else {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    user = authResult;
  }

  const { id } = await params;
  const forceRun = new URL(request.url).searchParams.get('force') === '1';

  // --- Validation ---
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot run queries' }, { status: 403 });

  const brand = access.brand;
  const ownerId = brand.userId || user.id;
  // Use brand owner's plan for limits (not team member's plan)
  const planResult = await pool.query('SELECT u.plan, u.api_keys FROM users u JOIN brands b ON b.user_id = u.id WHERE b.id = $1', [id]);
  const ownerPlan = planResult.rows[0]?.plan || 'free';
  const limits = getPlanLimits(ownerPlan);

  // Check if this brand is beyond the owner's plan limit (soft-locked after downgrade)
  const countResult = await pool.query(
    `SELECT id FROM brands WHERE user_id = $1 ORDER BY created_at, id`,
    [ownerId]
  );
  const brandIds = countResult.rows.map((r: { id: string }) => r.id);
  const brandIndex = brandIds.indexOf(id);
  if (brandIndex >= limits.brands) {
    return Response.json({
      error: `This brand is locked because the ${ownerPlan} plan allows up to ${limits.brands} brand(s). Upgrade the plan or delete unused brands to run queries.`,
      planLimit: true,
    }, { status: 403 });
  }

  const queries: string[] = brand.queries || [];
  if (!queries.length) return Response.json({ error: 'No queries configured. Add queries in Brand Setup.' }, { status: 400 });

  const userKeys = decryptApiKeys(planResult.rows[0]?.api_keys || {});
  const serverKeys = getServerKeys();

  const activePlatforms = PLATFORMS.filter(p => {
    const keyName = PLATFORM_KEY_MAP[p];
    return (serverKeys[keyName]?.length || userKeys[keyName]) ? true : false;
  }).slice(0, limits.platforms);

  if (!activePlatforms.length) return Response.json({ error: 'No API keys configured.' }, { status: 400 });

  // --- Check per-period prompt usage ---
  try {
    const usageResult = await pool.query(
      `SELECT COUNT(*) as used FROM prompt_runs pr JOIN brands b ON pr.brand_id = b.id WHERE b.user_id = $1 AND pr.created_at >= NOW() - INTERVAL '30 days'`,
      [user.id]
    );
    const used = parseInt(usageResult.rows[0]?.used, 10) || 0;
    const requested = queries.length * activePlatforms.length;
    if (used + requested > limits.prompts) {
      return Response.json({ error: 'Monthly prompt limit reached. Please upgrade your plan.' }, { status: 429 });
    }
  } catch {
    // If prompt_runs table doesn't exist yet, skip the check
  }

  // --- Check for existing active run (DB-based locking) ---
  await initTable();

  // Force: mark any existing runs as error
  if (forceRun) {
    await pool.query(
      `UPDATE active_runs SET status = 'error', error = 'Force-released by user', completed_at = NOW() WHERE brand_id = $1 AND status = 'running'`,
      [id]
    );
  }

  const runId = uid();
  const totalExpected = queries.length * activePlatforms.length;

  // --- Atomically check lock and create run record in DB ---
  // Uses a CTE to avoid race conditions between checking and inserting
  const lockResult = await pool.query(
    `WITH lock_check AS (
      SELECT id FROM active_runs WHERE brand_id = $1 AND status = 'running' AND started_at > NOW() - INTERVAL '10 minutes'
    )
    INSERT INTO active_runs (id, brand_id, user_id, status, total_expected, platforms, queries)
    SELECT $2, $1, $3, 'running', $4, $5, $6
    WHERE NOT EXISTS (SELECT 1 FROM lock_check)
    RETURNING id`,
    [id, runId, user.id, totalExpected, JSON.stringify(activePlatforms), JSON.stringify(queries)]
  );

  if (lockResult.rows.length === 0) {
    return Response.json({ error: 'A run is already in progress for this brand. Please wait for it to finish.' }, { status: 409 });
  }

  // --- Return immediately, execute in background via after() ---
  after(async () => {
    await executeRunBackground(brand, id, user.id, runId, totalExpected, activePlatforms, queries, serverKeys, userKeys);
  });

  return Response.json({ runId, totalExpected, platforms: activePlatforms, queries });
}

// --- Background execution: writes progress to DB as results come in ---
async function executeRunBackground(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  brand: any, brandId: string, userId: string, runId: string,
  totalExpected: number, activePlatforms: string[], queries: string[],
  serverKeys: Record<string, string[]>, userKeys: Record<string, string | null>,
) {
  const startTime = Date.now();
  const matcher = buildBrandMatcher(brand);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allResults: any[] = [];
  const platFailCount: Record<string, number> = {};
  const platMentionCount: Record<string, number> = {};
  let totalQ = 0, totalM = 0, nextIdx = 0;
  let received = 0, foundCount = 0, errorCount = 0;

  for (const plat of activePlatforms) platFailCount[plat] = 0;

  // Build interleaved task list
  const tasks: Array<{ plat: string; q: string }> = [];
  for (const q of queries) {
    for (const plat of activePlatforms) {
      tasks.push({ plat, q });
    }
  }

  // Batch DB progress updates (every 3 results or on completion)
  let pendingResults: unknown[] = [];
  async function flushProgress(force = false) {
    if (pendingResults.length === 0 && !force) return;
    try {
      await pool.query(
        `UPDATE active_runs SET received = $1, found_count = $2, error_count = $3,
         results = (SELECT COALESCE(results, '[]'::jsonb) FROM active_runs WHERE id = $4) || $5::jsonb,
         updated_at = NOW() WHERE id = $4`,
        [received, foundCount, errorCount, runId, JSON.stringify(pendingResults)]
      );
      pendingResults = [];
    } catch (e) { console.error('[Run] DB progress update failed:', (e as Error).message); }
  }

  function processResult(plat: string, q: string, result: { text: string; model: string; tokensIn: number; tokensOut: number; citations?: string[] }) {
    const parsed = parseResponse(result.text, brand, q, matcher);
    const competitors = detectCompetitors(result.text, matcher);
    const cost = estimateCost(result.model, result.tokensIn, result.tokensOut);
    const ctxLen = parsed.mentioned ? 300 : 150;
    const entry = {
      platform: plat, query: q, model: result.model,
      mentioned: parsed.mentioned, recommended: parsed.recommended,
      sentiment: parsed.sentiment, listPosition: parsed.listPosition,
      citations: parsed.cites, competitorMentions: competitors,
      context: result.text.substring(0, ctxLen),
      snippet: result.text.substring(0, 200),
      raw: result.text,
      tokensIn: result.tokensIn, tokensOut: result.tokensOut, cost,
    };
    allResults.push(entry);
    totalQ++;
    if (parsed.mentioned) { totalM++; platMentionCount[plat] = (platMentionCount[plat] || 0) + 1; }
    received++;
    if (parsed.mentioned) foundCount++;
    // Queue for DB flush (strip heavy fields for the live results array)
    pendingResults.push({
      platform: plat, query: q, model: result.model,
      mentioned: parsed.mentioned, recommended: parsed.recommended,
      sentiment: parsed.sentiment, error: false,
      context: result.text.substring(0, 150),
    });
  }

  function processError(plat: string, q: string, err: Error) {
    platFailCount[plat] = (platFailCount[plat] || 0) + 1;
    allResults.push({
      platform: plat, query: q, model: getDefaultModel(plat),
      mentioned: false, sentiment: 'neutral', recommended: false,
      citations: [], error: true, errorMessage: err.message,
    });
    totalQ++;
    received++;
    errorCount++;
    pendingResults.push({
      platform: plat, query: q, model: getDefaultModel(plat),
      mentioned: false, error: true, errorMessage: err.message,
    });
  }

  async function runWorker() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      if (idx >= tasks.length) return;
      const { plat, q } = tasks[idx];
      try {
        if (platFailCount[plat] >= FAIL_THRESHOLD) {
          throw new Error(`Skipped — ${plat} had ${FAIL_THRESHOLD} consecutive failures`);
        }
        const keyName = PLATFORM_KEY_MAP[plat];
        const serverKeyList = serverKeys[keyName] || [];
        const rawKey = userKeys[keyName] || (serverKeyList.length > 0 ? serverKeyList[Math.floor(Math.random() * serverKeyList.length)] : undefined);
        if (!rawKey) throw new Error('No API key available for ' + plat);
        const result = await queryAI(plat, q, rawKey, getDefaultModel(plat), brand);
        platFailCount[plat] = 0;
        processResult(plat, q, result);
      } catch (err) {
        processError(plat, q, err as Error);
      }
      // Flush to DB every 3 results
      if (pendingResults.length >= 3) await flushProgress();
    }
  }

  try {
    const CONCURRENCY = Math.max(activePlatforms.length, 8);
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, () => runWorker()));

    // Final flush
    await flushProgress(true);

    // Calculate SOV
    const platformStats: Record<string, { queries: number; mentions: number; sov: number; errors: number }> = {};
    for (const plat of activePlatforms) {
      const platTotal = queries.length;
      const platMentions = platMentionCount[plat] || 0;
      const platErrors = allResults.filter((r: { platform: string; error?: boolean }) => r.platform === plat && r.error).length;
      platformStats[plat] = {
        queries: platTotal, mentions: platMentions,
        sov: platTotal > 0 ? Math.round((platMentions / platTotal) * 100) : 0,
        errors: platErrors,
      };
    }
    const overallSov = totalQ > 0 ? Math.round((totalM / totalQ) * 100) : 0;
    const totalErrors = allResults.filter((r: { error?: boolean }) => r.error).length;
    const durationMs = Date.now() - startTime;
    const newMentions = allResults
      .filter((r: { mentioned?: boolean; error?: boolean }) => r.mentioned && !r.error)
      .map((r: { platform: string; query: string; context?: string; sentiment?: string; recommended?: boolean; citations?: string[]; model?: string }) => ({
        id: uid(), platform: r.platform, query: r.query,
        context: r.context || '', sentiment: r.sentiment,
        recommended: r.recommended, citations: r.citations,
        model: r.model, time: new Date().toISOString(),
      }));

    const finalResult = {
      totalQ, totalM, sov: overallSov,
      newMentions: newMentions.length,
      activePlatforms: activePlatforms.length,
      errorCount: totalErrors,
    };

    // Mark run as done in DB
    await pool.query(
      `UPDATE active_runs SET status = 'done', final_data = $1, received = $2,
       found_count = $3, error_count = $4, completed_at = NOW(), updated_at = NOW()
       WHERE id = $5`,
      [JSON.stringify(finalResult), received, foundCount, errorCount, runId]
    );

    // Save to brand data (same as before)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brandData = { ...brand } as any;
    delete brandData.id; delete brandData.userId; delete brandData.createdAt; delete brandData.updatedAt;
    if (!brandData.runs) brandData.runs = [];
    const lightResults = allResults.map(({ tokensIn, tokensOut, cost, ...rest }: Record<string, unknown>) => rest);

    // Aggregate citation URLs into domain counts for the dashboard
    const citationCounts: Record<string, number> = {};
    for (const r of allResults) {
      const cites = (r as { citations?: string[] }).citations || [];
      for (const url of cites) {
        try {
          const domain = new URL(url).hostname.replace(/^www\./, '');
          citationCounts[domain] = (citationCounts[domain] || 0) + 1;
        } catch { /* skip invalid URLs */ }
      }
    }

    // Aggregate competitor mentions into counts for the dashboard
    const competitorCounts: Record<string, number> = {};
    for (const r of allResults) {
      const comps = (r as { competitorMentions?: string[] }).competitorMentions || [];
      for (const c of comps) {
        competitorCounts[c] = (competitorCounts[c] || 0) + 1;
      }
    }

    brandData.runs.push({
      id: runId, date: new Date().toISOString().split('T')[0],
      time: new Date().toISOString(), durationMs,
      sov: overallSov, totalQ, totalM,
      platforms: platformStats, allResults: lightResults,
      queries: [...queries], activePlatforms: [...activePlatforms],
      citations: citationCounts, competitors: competitorCounts,
    });
    if (brandData.runs.length > 30) brandData.runs = brandData.runs.slice(-30);

    if (!brandData.sovHistory) brandData.sovHistory = [];
    const today = new Date().toISOString().split('T')[0];
    brandData.sovHistory = brandData.sovHistory.filter((h: { date: string }) => h.date !== today);
    brandData.sovHistory.push({
      date: today, overall: overallSov,
      platforms: Object.fromEntries(Object.entries(platformStats).map(([k, v]) => [k, v.sov])),
    });
    if (brandData.sovHistory.length > 90) brandData.sovHistory = brandData.sovHistory.slice(-90);

    if (!brandData.mentions) brandData.mentions = [];
    const existingKeys = new Set(brandData.mentions.map((m: { platform: string; query: string; time: string }) =>
      m.platform + '|' + m.query + '|' + m.time.split('T')[0]));
    const deduped = newMentions.filter(m => !existingKeys.has(m.platform + '|' + m.query + '|' + m.time.split('T')[0]));
    brandData.mentions = [...deduped, ...brandData.mentions].slice(0, 500);
    brandData.updatedAt = new Date().toISOString();

    await pool.query('UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(brandData), brandId]);

    // Persist prompt_runs in batches
    for (let i = 0; i < allResults.length; i += 100) {
      const batch = allResults.slice(i, i + 100);
      const values: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any[] = [];
      let pi = 1;
      for (const r of batch) {
        const prId = uid();
        values.push(`($${pi},$${pi+1},$${pi+2},$${pi+3},$${pi+4},$${pi+5},$${pi+6},$${pi+7},$${pi+8},$${pi+9},$${pi+10},$${pi+11},$${pi+12},$${pi+13})`);
        p.push(prId, brandId, r.query, r.platform, r.model || null,
          r.mentioned || false, r.sentiment || 'neutral', r.recommended || false,
          r.listPosition || null, JSON.stringify(r.citations || []),
          JSON.stringify(r.competitorMentions || []), !r.error, runId,
          r.raw || null);
        pi += 14;
      }
      try {
        await pool.query(
          `INSERT INTO prompt_runs (id, brand_id, prompt, platform, model, mentioned, sentiment, recommended, list_position, citations, competitor_mentions, success, batch_id, response_raw) VALUES ${values.join(',')}`, p,
        );
      } catch { /* ignore */ }
    }

    auditLog(userId, 'run_queries', 'brand', brandId, { runId, queries: totalQ, mentions: totalM, sov: overallSov }, '');

  } catch (err) {
    // Mark run as error in DB
    try {
      await pool.query(
        `UPDATE active_runs SET status = 'error', error = $1, received = $2,
         found_count = $3, error_count = $4, completed_at = NOW(), updated_at = NOW()
         WHERE id = $5`,
        [(err as Error).message, received, foundCount, errorCount, runId]
      );
    } catch { /* ignore */ }

    // Emergency save partial results to brand data
    if (allResults.length > 0) {
      try {
        const emergSov = totalQ > 0 ? Math.round((totalM / totalQ) * 100) : 0;
        const emergResults = allResults.map(({ tokensIn, tokensOut, cost, ...rest }: Record<string, unknown>) => rest);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const brandData = { ...brand } as any;
        delete brandData.id; delete brandData.userId; delete brandData.createdAt; delete brandData.updatedAt;
        if (!brandData.runs) brandData.runs = [];
        // Emergency competitor aggregation
        const emergCompCounts: Record<string, number> = {};
        for (const r of allResults) {
          const comps = (r as { competitorMentions?: string[] }).competitorMentions || [];
          for (const c of comps) { emergCompCounts[c] = (emergCompCounts[c] || 0) + 1; }
        }
        brandData.runs.push({
          id: runId, date: new Date().toISOString().split('T')[0],
          time: new Date().toISOString(), allResults: emergResults,
          sov: emergSov, totalQ, totalM, queries: brand.queries || [],
          activePlatforms: [], emergencySave: true, crashError: (err as Error).message,
          competitors: emergCompCounts,
        });
        brandData.updatedAt = new Date().toISOString();
        await pool.query('UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(brandData), brandId]);
      } catch { /* ignore */ }
    }
    console.error('[Run] Background execution failed:', (err as Error).message);
  }
}
