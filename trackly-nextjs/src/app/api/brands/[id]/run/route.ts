import { pool, auditLog } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, uid, decryptApiKeys } from '@/lib/helpers';
import { getPlanLimits } from '@/lib/constants';
import { queryAI, getDefaultModel, estimateCost } from '@/lib/ai-platforms';
import { parseResponse, buildBrandMatcher, detectCompetitors } from '@/lib/parser';
import {
  activeRuns, acquireBrandLock, releaseBrandLock, cleanupStaleRuns,
  type ActiveRun, type RunResult,
} from '@/lib/run-state';

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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id } = await params;
  const url = new URL(request.url);
  const streaming = url.searchParams.get('stream') === '1';
  const forceRun = url.searchParams.get('force') === '1';

  // --- Validation ---
  const access = await getBrandWithAccess(id, user.id);
  if (!access) {
    if (streaming) return sseErrorResponse('Brand not found');
    return Response.json({ error: 'Brand not found' }, { status: 404 });
  }
  if (access.role === 'viewer') {
    if (streaming) return sseErrorResponse('Viewers cannot run queries');
    return Response.json({ error: 'Viewers cannot run queries' }, { status: 403 });
  }

  const brand = access.brand;
  const planResult = await pool.query('SELECT plan, api_keys FROM users WHERE id = $1', [user.id]);
  const plan = planResult.rows[0]?.plan || 'free';
  const limits = getPlanLimits(plan);

  const queries: string[] = brand.queries || [];
  if (!queries.length) {
    if (streaming) return sseErrorResponse('No queries configured. Add queries in Brand Setup.');
    return Response.json({ error: 'No queries configured. Add queries in Brand Setup.' }, { status: 400 });
  }

  const userKeys = decryptApiKeys(planResult.rows[0]?.api_keys || {});
  const serverKeys = getServerKeys();

  const activePlatforms = PLATFORMS.filter(p => {
    const keyName = PLATFORM_KEY_MAP[p];
    return (serverKeys[keyName]?.length || userKeys[keyName]) ? true : false;
  }).slice(0, limits.platforms);

  if (!activePlatforms.length) {
    if (streaming) return sseErrorResponse('No API keys configured.');
    return Response.json({ error: 'No API keys configured. Add keys in your account settings or contact admin.' }, { status: 400 });
  }

  // --- Locking ---
  cleanupStaleRuns();
  if (!acquireBrandLock(id, forceRun)) {
    if (streaming) return sseErrorResponse('A run is already in progress for this brand.');
    return Response.json({ error: 'A run is already in progress for this brand. Please wait for it to finish.' }, { status: 409 });
  }

  const runId = uid();
  const totalExpected = queries.length * activePlatforms.length;
  const matcher = buildBrandMatcher(brand);

  // Register active run
  const runState: ActiveRun = {
    status: 'running', brandId: id, userId: user.id, runId,
    totalExpected, received: 0, foundCount: 0, errorCount: 0,
    platforms: activePlatforms, queries: [...queries],
    results: [], finalData: null, error: null,
    startedAt: Date.now(), completedAt: null,
  };
  activeRuns.set(runId, runState);

  // Build interleaved task list (query-first order to spread across platforms)
  const tasks: Array<{ plat: string; q: string }> = [];
  for (const q of queries) {
    for (const plat of activePlatforms) {
      tasks.push({ plat, q });
    }
  }

  if (streaming) {
    // --- SSE streaming response ---
    const encoder = new TextEncoder();
    let controllerRef: ReadableStreamDefaultController | null = null;
    let clientConnected = true;

    const stream = new ReadableStream({
      start(controller) {
        controllerRef = controller;

        function sendEvent(type: string, data: Record<string, unknown>) {
          if (!clientConnected) return;
          try {
            controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type, ...data }) + '\n\n'));
          } catch { clientConnected = false; }
        }

        // Send start event immediately
        sendEvent('start', { runId, totalExpected, platforms: activePlatforms, queries });

        // Fire-and-forget execution
        executeRun(brand, id, user, runId, runState, tasks, activePlatforms, queries, matcher, serverKeys, userKeys, sendEvent)
          .then(finalResult => {
            sendEvent('done', { result: finalResult, warnings: [] });
            try { controller.close(); } catch { /* already closed */ }
          })
          .catch(err => {
            sendEvent('error', { error: 'Failed to run queries: ' + (err as Error).message });
            try { controller.close(); } catch { /* already closed */ }
          });
      },
      cancel() {
        clientConnected = false;
        // Execution continues in the background even if client disconnects
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } else {
    // --- Non-streaming: wait for completion, return JSON ---
    try {
      const finalResult = await executeRun(brand, id, user, runId, runState, tasks, activePlatforms, queries, matcher, serverKeys, userKeys, () => {});
      return Response.json({ run: { id: runId, ...finalResult }, runId });
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }
  }
}

// --- Core execution logic (shared by streaming and non-streaming) ---
async function executeRun(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  brand: any, brandId: string, user: { id: string }, runId: string,
  runState: ActiveRun, tasks: Array<{ plat: string; q: string }>,
  activePlatforms: string[], queries: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matcher: any, serverKeys: Record<string, string[]>,
  userKeys: Record<string, string | null>,
  sendEvent: (type: string, data: Record<string, unknown>) => void,
): Promise<Record<string, unknown>> {
  const allResults: RunResult[] = [];
  const platFailCount: Record<string, number> = {};
  const platMentionCount: Record<string, number> = {};
  let totalQ = 0;
  let totalM = 0;
  let nextIdx = 0;

  for (const plat of activePlatforms) platFailCount[plat] = 0;

  function processResult(plat: string, q: string, result: { text: string; model: string; tokensIn: number; tokensOut: number; citations?: string[] }) {
    const parsed = parseResponse(result.text, brand, q, matcher);
    const competitors = detectCompetitors(result.text, matcher);
    const cost = estimateCost(result.model, result.tokensIn, result.tokensOut);
    const ctxLen = parsed.mentioned ? 300 : 150;
    const entry: RunResult = {
      platform: plat, query: q, model: result.model,
      mentioned: parsed.mentioned, recommended: parsed.recommended,
      sentiment: parsed.sentiment, listPosition: parsed.listPosition,
      citations: parsed.cites, competitorMentions: competitors,
      context: result.text.substring(0, ctxLen),
      snippet: result.text.substring(0, 200),
      tokensIn: result.tokensIn, tokensOut: result.tokensOut, cost,
    };
    allResults.push(entry);
    totalQ++;
    if (parsed.mentioned) { totalM++; platMentionCount[plat] = (platMentionCount[plat] || 0) + 1; }
    runState.received++;
    if (parsed.mentioned) runState.foundCount++;
    runState.results.push(entry);
    sendEvent('result', { result: entry, totalQ, totalM });
  }

  function processError(plat: string, q: string, err: Error) {
    platFailCount[plat] = (platFailCount[plat] || 0) + 1;
    const errObj: RunResult = {
      platform: plat, query: q, model: getDefaultModel(plat),
      mentioned: false, sentiment: 'neutral', recommended: false,
      citations: [], error: true, errorMessage: err.message,
    };
    allResults.push(errObj);
    totalQ++;
    runState.received++;
    runState.errorCount++;
    runState.results.push(errObj);
    sendEvent('result', { result: errObj, totalQ, totalM });
  }

  async function runWorker() {
    while (nextIdx < tasks.length) {
      if (runState.aborted) return;
      const idx = nextIdx++;
      if (idx >= tasks.length) return;
      const { plat, q } = tasks[idx];
      try {
        if (platFailCount[plat] >= FAIL_THRESHOLD) {
          throw new Error(`Skipped — ${plat} had ${FAIL_THRESHOLD} consecutive failures`);
        }
        const keyName = PLATFORM_KEY_MAP[plat];
        const rawKey = userKeys[keyName] || serverKeys[keyName]?.[0];
        if (!rawKey) throw new Error('No API key available for ' + plat);
        const apiKey = rawKey;
        const model = getDefaultModel(plat);
        const result = await queryAI(plat, q, apiKey, model, brand);
        platFailCount[plat] = 0;
        processResult(plat, q, result);
      } catch (err) {
        processError(plat, q, err as Error);
      }
    }
  }

  try {
    const CONCURRENCY = Math.max(activePlatforms.length, 8);
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, () => runWorker()));

    // Calculate per-platform SOV
    const platformStats: Record<string, { queries: number; mentions: number; sov: number; errors: number }> = {};
    for (const plat of activePlatforms) {
      const platTotal = queries.length;
      const platMentions = platMentionCount[plat] || 0;
      const platErrors = allResults.filter(r => r.platform === plat && r.error).length;
      platformStats[plat] = {
        queries: platTotal, mentions: platMentions,
        sov: platTotal > 0 ? Math.round((platMentions / platTotal) * 100) : 0,
        errors: platErrors,
      };
    }

    const overallSov = totalQ > 0 ? Math.round((totalM / totalQ) * 100) : 0;
    const errorCount = allResults.filter(r => r.error).length;
    const durationMs = Date.now() - runState.startedAt;

    // Save run to DB
    const run = {
      id: runId, date: new Date().toISOString().split('T')[0],
      time: new Date().toISOString(), durationMs,
      sov: overallSov, totalQ, totalM,
      platforms: platformStats,
      allResults: allResults.map(({ tokensIn, tokensOut, cost, ...rest }) => rest),
      queries: [...queries], activePlatforms: [...activePlatforms],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brandData = { ...brand } as any;
    delete brandData.id; delete brandData.userId;
    delete brandData.createdAt; delete brandData.updatedAt;
    if (!brandData.runs) brandData.runs = [];
    brandData.runs.push(run);
    if (brandData.runs.length > 30) brandData.runs = brandData.runs.slice(-30);

    // SOV history
    if (!brandData.sovHistory) brandData.sovHistory = [];
    const today = run.date;
    brandData.sovHistory = brandData.sovHistory.filter((h: { date: string }) => h.date !== today);
    brandData.sovHistory.push({
      date: today, overall: overallSov,
      platforms: Object.fromEntries(Object.entries(platformStats).map(([k, v]) => [k, v.sov])),
    });
    if (brandData.sovHistory.length > 90) brandData.sovHistory = brandData.sovHistory.slice(-90);

    // Mentions
    if (!brandData.mentions) brandData.mentions = [];
    const newMentions = allResults
      .filter(r => r.mentioned && !r.error)
      .map(r => ({
        id: uid(), platform: r.platform, query: r.query,
        context: r.context || '', sentiment: r.sentiment,
        recommended: r.recommended, citations: r.citations,
        model: r.model, time: new Date().toISOString(),
      }));
    const existingKeys = new Set(brandData.mentions.map((m: { platform: string; query: string; time: string }) =>
      m.platform + '|' + m.query + '|' + m.time.split('T')[0]));
    const deduped = newMentions.filter(m => !existingKeys.has(m.platform + '|' + m.query + '|' + m.time.split('T')[0]));
    brandData.mentions = [...deduped, ...brandData.mentions].slice(0, 500);

    brandData.updatedAt = new Date().toISOString();

    if (!runState.aborted) {
      await pool.query('UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(brandData), brandId]);
    }

    // Persist prompt_runs in batches
    for (let i = 0; i < allResults.length; i += 100) {
      const batch = allResults.slice(i, i + 100);
      const values: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any[] = [];
      let pi = 1;
      for (const r of batch) {
        const prId = uid();
        values.push(`($${pi},$${pi + 1},$${pi + 2},$${pi + 3},$${pi + 4},$${pi + 5},$${pi + 6},$${pi + 7},$${pi + 8},$${pi + 9},$${pi + 10},$${pi + 11},$${pi + 12})`);
        p.push(prId, brandId, r.query, r.platform, r.model || null,
          r.mentioned || false, r.sentiment || 'neutral', r.recommended || false,
          r.listPosition || null, JSON.stringify(r.citations || []),
          JSON.stringify(r.competitorMentions || []), !r.error, runId);
        pi += 13;
      }
      try {
        await pool.query(
          `INSERT INTO prompt_runs (id, brand_id, prompt, platform, model, mentioned, sentiment, recommended, list_position, citations, competitor_mentions, success, batch_id) VALUES ${values.join(',')}`,
          p,
        );
      } catch { /* ignore batch insert errors */ }
    }

    const finalResult = {
      totalQ, totalM, sov: overallSov,
      newMentions: newMentions.length,
      activePlatforms: activePlatforms.length,
      errorCount,
      platformErrors: {} as Record<string, string[]>,
    };

    // Collect platform errors for the summary
    for (const r of allResults) {
      if (r.error && r.errorMessage) {
        if (!finalResult.platformErrors[r.platform]) finalResult.platformErrors[r.platform] = [];
        finalResult.platformErrors[r.platform].push(r.errorMessage);
      }
    }

    // Update run state for polling
    runState.status = 'done';
    runState.finalData = { result: finalResult };
    runState.completedAt = Date.now();
    releaseBrandLock(brandId);

    const ip = ''; // Not easily available in Next.js App Router
    auditLog(user.id, 'run_queries', 'brand', brandId, { runId, queries: totalQ, mentions: totalM, sov: overallSov }, ip);

    return finalResult;
  } catch (err) {
    runState.status = 'error';
    runState.error = (err as Error).message;
    runState.completedAt = Date.now();
    releaseBrandLock(brandId);

    // Emergency save partial results
    if (allResults.length > 0) {
      try {
        const emergSov = totalQ > 0 ? Math.round((totalM / totalQ) * 100) : 0;
        const emergResults = allResults.map(({ tokensIn, tokensOut, cost, ...rest }) => rest);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const brandData = { ...brand } as any;
        delete brandData.id; delete brandData.userId; delete brandData.createdAt; delete brandData.updatedAt;
        if (!brandData.runs) brandData.runs = [];
        brandData.runs.push({
          id: runId, date: new Date().toISOString().split('T')[0],
          time: new Date().toISOString(), allResults: emergResults,
          sov: emergSov, totalQ, totalM, queries: brand.queries || [],
          activePlatforms: [], emergencySave: true, crashError: (err as Error).message,
        });
        brandData.updatedAt = new Date().toISOString();
        await pool.query('UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(brandData), brandId]);
      } catch { /* ignore emergency save errors */ }
    }

    throw err;
  }
}

function sseErrorResponse(msg: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'error', error: msg }) + '\n\n'));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
