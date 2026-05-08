/**
 * BullMQ worker that processes 'brand-runs' jobs.
 * Moves the actual run execution logic out of the Next.js after() callback
 * so results are not held in the server's memory.
 *
 * Start this as a separate process: npx tsx src/lib/run-worker.ts
 */
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { pool } from './db';
import { queryAI, getDefaultModel, estimateCost, resolveChatGPTModel, withCacheAndRetry, type AiError } from './ai-platforms';
import { isSearchEnabled } from './response-cache';
import { getAdminModel } from './site-config';
import { parseResponse, buildBrandMatcher, detectCompetitors, aggregateCompetitorCounts } from './parser';
import { uid, decryptApiKeys, loadTenantFairnessSettings } from './helpers';
import { circuitBreakerCheck, recordApiKeyFailure, resetApiKeyFailures, acquirePlatformSlot } from './ai-platforms';
import { setTenantFairness } from './fairness-scheduler';
import { logger } from './logger';
import { getServerKeys } from './server-keys';
import { resolveKeysForTenant, recordTenantKeyResult } from './tenant-keys';
import type { BrandRunJobData } from './job-queue';

const PLATFORM_KEY_MAP: Record<string, string> = {
  ChatGPT: 'openai', Perplexity: 'perplexity', Claude: 'claude',
  Gemini: 'gemini', Grok: 'grok',
};
const FAIL_THRESHOLD = Number(process.env.RUN_PLATFORM_FAIL_THRESHOLD) || 5;
const WORKER_TIMEOUT_MS = Number(process.env.RUN_PER_QUERY_TIMEOUT_MS) || 180000;

async function processRun(job: Job<BrandRunJobData>) {
  const { brandId, runId } = job.data;

  // Load run + brand + owner keys from the DB. The enqueue payload
  // intentionally carries no secrets - Redis is not a secrets store.
  const runRow = await pool.query(
    `SELECT id, user_id, total_expected, platforms, queries
       FROM active_runs WHERE id = $1 LIMIT 1`,
    [runId]
  );
  if (!runRow.rows.length) {
    logger.error('worker.run_not_found', { run_id: runId });
    return;
  }
  const userId: string = runRow.rows[0].user_id;
  const totalExpected: number = runRow.rows[0].total_expected || 0;
  const activePlatforms: string[] = Array.isArray(runRow.rows[0].platforms) ? runRow.rows[0].platforms : [];
  const queries: string[] = Array.isArray(runRow.rows[0].queries) ? runRow.rows[0].queries : [];

  const brandRow = await pool.query('SELECT id, user_id, data FROM brands WHERE id = $1 LIMIT 1', [brandId]);
  if (!brandRow.rows.length) {
    await pool.query(
      `UPDATE active_runs SET status = 'error', error = 'Brand not found at worker pickup', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [runId]
    );
    return;
  }
  const brandData = typeof brandRow.rows[0].data === 'string'
    ? JSON.parse(brandRow.rows[0].data)
    : (brandRow.rows[0].data || {});
  const brand = { id: brandId, userId: brandRow.rows[0].user_id, ...brandData };

  const serverKeys = getServerKeys();

  // Decrypt user keys from the brand owner's record.
  const ownerRow = await pool.query('SELECT api_keys FROM users WHERE id = $1', [brand.userId]);
  const userKeys = decryptApiKeys(ownerRow.rows[0]?.api_keys || {});

  const startTime = Date.now();
  const matcher = buildBrandMatcher(brand);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allResults: any[] = [];
  const platFailCount: Record<string, number> = {};
  const platMentionCount: Record<string, number> = {};
  let totalQ = 0, totalM = 0, nextIdx = 0;
  let received = 0, foundCount = 0, errorCount = 0;

  const adminModels: Record<string, string> = {};
  for (const plat of activePlatforms) {
    adminModels[plat] = await getAdminModel(plat);
    platFailCount[plat] = 0;
  }

  // Per-tenant fairness settings (issue #410). Loaded once per run
  // and pinned to the brand owner so team-member triggered runs
  // count against the owner's share.
  const fairnessTenantId = brand.userId || userId;
  const fairnessSettings = await loadTenantFairnessSettings(fairnessTenantId);
  setTenantFairness(fairnessTenantId, fairnessSettings);

  // Per-platform task queues (perf fix: workers were stuck serialising on the slowest platform).
  // Each platform owns its own queue; spawn its own workers up to maxConcurrent.
  const tasksByPlat: Record<string, string[]> = {};
  for (const plat of activePlatforms) tasksByPlat[plat] = [...queries];
  const tasks: Array<{ plat: string; q: string }> = [];
  for (let qi = 0; qi < queries.length; qi++) {
    for (let pi = 0; pi < activePlatforms.length; pi++) {
      tasks.push({ plat: activePlatforms[pi], q: queries[qi] });
    }
  }

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
    } catch (e) {
      logger.error('worker.progress_update_failed', {
        run_id: runId,
        error: (e as Error).message,
      });
    }
  }

  function processResult(plat: string, q: string, result: { text: string; model: string; tokensIn: number; tokensOut: number; citations?: string[] }, fromCache = false) {
    const parsed = parseResponse(result.text, brand, q, matcher);
    const competitors = detectCompetitors(result.text, matcher);
    const cost = fromCache ? 0 : estimateCost(result.model, result.tokensIn, result.tokensOut);
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
      cacheHit: fromCache,
    };
    allResults.push(entry);
    totalQ++;
    if (parsed.mentioned) { totalM++; platMentionCount[plat] = (platMentionCount[plat] || 0) + 1; }
    received++;
    if (parsed.mentioned) foundCount++;
    pendingResults.push({
      platform: plat, query: q, model: result.model,
      mentioned: parsed.mentioned, recommended: parsed.recommended,
      sentiment: parsed.sentiment, error: false,
      context: result.text.substring(0, 150),
    });
  }

  function processError(plat: string, q: string, err: Error) {
    // Distinguish rate-limit failures (transient, retried via deferred queue)
    // from generic errors so the UI/telemetry can render them differently.
    const aiErr = err as AiError;
    const errorType = aiErr.isRateLimit ? 'rate_limited' : 'error';
    // Only count NON-rate-limit failures toward the consecutive-failure
    // breaker. A burst of 429s should slow us down (Retry-After is already
    // honoured inside fetchAI), not kill the rest of the platform's queries.
    if (!aiErr.isRateLimit) {
      platFailCount[plat] = (platFailCount[plat] || 0) + 1;
    }
    allResults.push({
      platform: plat, query: q, model: getDefaultModel(plat),
      mentioned: false, sentiment: 'neutral', recommended: false,
      citations: [], error: true, errorMessage: err.message, errorType,
    });
    totalQ++;
    received++;
    errorCount++;
    pendingResults.push({
      platform: plat, query: q, model: getDefaultModel(plat),
      mentioned: false, error: true, errorMessage: err.message, errorType,
    });
  }

  const platLastCall: Record<string, number> = {};
  const PLATFORM_STAGGER_MS = 500;

  async function runWorker(assignedPlat: string) {
    while (tasksByPlat[assignedPlat] && tasksByPlat[assignedPlat].length > 0) {
      const q = tasksByPlat[assignedPlat].shift()!;
      const plat = assignedPlat;
      const idx = nextIdx++;
      try {
        if (platFailCount[plat] >= FAIL_THRESHOLD) {
          throw new Error(`Skipped - ${plat} had ${FAIL_THRESHOLD} consecutive failures`);
        }
        const lastCall = platLastCall[plat] || 0;
        const elapsed = Date.now() - lastCall;
        if (elapsed < PLATFORM_STAGGER_MS) {
          await new Promise(r => setTimeout(r, PLATFORM_STAGGER_MS - elapsed));
        }
        const keyName = PLATFORM_KEY_MAP[plat];
        const serverKeyList = serverKeys[keyName] || [];
        const resolved = await resolveKeysForTenant({
          tenantId: brand.userId || null,
          platformKeyName: keyName,
          legacyUserKeys: userKeys as Record<string, string | null | undefined>,
          serverKeys: serverKeyList,
        });
        if (!resolved) throw new Error('No API key available for ' + plat);
        const rawKey = resolved.key;

        // Circuit breaker check. Only consult the global breaker for
        // server (env) keys — tenant-supplied keys have their own
        // (tenant, platform) failure counter so a bad customer key
        // does not pollute the platform-wide breaker.
        if (resolved.source === 'server' && circuitBreakerCheck(rawKey)) {
          throw new Error(`Circuit breaker open for API key - too many auth failures`);
        }

        platLastCall[plat] = Date.now();

        // Resolve the model: for ChatGPT this may downshift from
        // search-preview to gpt-4o when the query has clear non-search
        // intent. Smart routing is ON by default; set
        // CHATGPT_SMART_MODEL_ROUTING=false to disable.
        const baseModel = adminModels[plat] || getDefaultModel(plat);
        const modelForTask = plat === 'ChatGPT' ? resolveChatGPTModel(q, baseModel) : baseModel;
        // Correlation ID for ChatGPT rate-limit log grep.
        const queryId = `${runId}:${idx}`;

        // Worker-level timeout: per-task budget. The AbortController is
        // plumbed into both acquirePlatformSlot (so a stuck slot does
        // not deadlock the queue) and into queryAI/fetchAI (so an
        // in-flight HTTP call is cancelled when the budget fires).
        const taskController = new AbortController();
        const taskTimer = setTimeout(
          () => taskController.abort(new Error(`${plat} timed out after ${WORKER_TIMEOUT_MS}ms`)),
          WORKER_TIMEOUT_MS,
        );
        let release: (() => void) | null = null;
        try {
          release = await acquirePlatformSlot(plat, taskController.signal, {
            tenantId: fairnessTenantId,
            weight: fairnessSettings.weight,
            maxQueueDepth: fairnessSettings.maxQueueDepth,
          });
          // Wrap the queryAI call with the shared response cache. On a hit,
          // the provider is never invoked and we skip key-success bookkeeping
          // (no key was used). On a miss, the live result is cached on the
          // way out — errors are not cached. The worker has no withDeepRetry
          // wrapper today (separate concern from caching).
          const cached = await withCacheAndRetry(
            {
              prompt: q,
              platform: plat,
              model: modelForTask,
              searchEnabled: isSearchEnabled(plat, modelForTask),
              brandId: brand?.id ?? null,
              city: brand?.city ?? null,
            },
            () => queryAI(
              plat, q, rawKey, modelForTask, brand,
              {
                queryId,
                signal: taskController.signal,
                tenantId: userId,
                runId,
              },
            ),
          );
          const result = cached.data;
          platFailCount[plat] = 0;
          // Skip key-success/health bookkeeping on cache hits — no provider
          // call was made, so the key wasn't exercised.
          if (!cached.fromCache) {
            if (resolved.source === 'server') resetApiKeyFailures(rawKey);
            if (resolved.source === 'tenant' && brand.userId) {
              recordTenantKeyResult(brand.userId, keyName, { ok: true })
                .catch(() => { /* health is best-effort */ });
            }
          }
          processResult(plat, q, result, cached.fromCache);
        } catch (err) {
          if (resolved.source === 'tenant' && brand.userId) {
            recordTenantKeyResult(brand.userId, keyName, {
              ok: false,
              error: (err as Error).message,
            }).catch(() => { /* health is best-effort */ });
          }
          throw err;
        } finally {
          clearTimeout(taskTimer);
          if (release) release();
        }
      } catch (err) {
        processError(plat, q, err as Error);
      }
      if (pendingResults.length >= 3) await flushProgress();
    }
  }

  try {
    // Spawn N workers PER platform where N = that platform's maxConcurrent
    // (clamped to its task count). Each worker only pulls from its own queue,
    // so a slow platform can't block fast ones.
    const PLATFORM_WORKERS: Record<string, number> = {
      ChatGPT: Number(process.env.AI_LIMITS_CHATGPT_CONCURRENCY) || Number(process.env.AI_CHATGPT_MAX_CONCURRENT) || 1,
      Claude: Number(process.env.AI_LIMITS_CLAUDE_CONCURRENCY) || 3,
      Gemini: Number(process.env.AI_LIMITS_GEMINI_CONCURRENCY) || 6,
      Grok: Number(process.env.AI_LIMITS_GROK_CONCURRENCY) || 3,
      Perplexity: Number(process.env.AI_LIMITS_PERPLEXITY_CONCURRENCY) || 3,
    };
    const workerPromises: Promise<void>[] = [];
    for (const plat of activePlatforms) {
      const slots = Math.max(1, Math.min(PLATFORM_WORKERS[plat] || 2, tasksByPlat[plat]?.length || 0));
      for (let i = 0; i < slots; i++) workerPromises.push(runWorker(plat));
    }
    await Promise.all(workerPromises);
    await flushProgress(true);

    // Verify this run is still active before saving
    const activeCheck = await pool.query(
      'SELECT id FROM active_runs WHERE brand_id = $1 AND status = $2 ORDER BY started_at DESC LIMIT 1',
      [brandId, 'running']
    );
    if (activeCheck.rows.length > 0 && activeCheck.rows[0].id !== runId) {
      logger.warn('worker.run_superseded', {
        run_id: runId,
        superseded_by: activeCheck.rows[0].id,
      });
      await pool.query(
        `UPDATE active_runs SET status = 'error', error = 'Superseded by newer run', completed_at = NOW() WHERE id = $1`,
        [runId]
      );
      return;
    }

    // Calculate SOV and save
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

    // Re-read the brand from the database to get the LATEST data (user may have
    // added queries, competitors, etc. while the run was in progress). Only merge
    // run-specific fields (runs, sovHistory, mentions) to avoid overwriting user edits.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let brandData: any;
    try {
      const freshBrand = await pool.query('SELECT data FROM brands WHERE id = $1', [brandId]);
      brandData = freshBrand.rows[0]?.data || {};
      if (typeof brandData === 'string') brandData = JSON.parse(brandData);
    } catch {
      // Fallback to in-memory copy if re-read fails
      brandData = { ...brand } as any;
      delete brandData.id; delete brandData.userId; delete brandData.createdAt; delete brandData.updatedAt;
    }
    if (!brandData.runs) brandData.runs = [];
    const lightResults = allResults.map(({ tokensIn, tokensOut, cost, ...rest }: Record<string, unknown>) => rest);

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

    const competitorCounts = aggregateCompetitorCounts(allResults);

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

    await pool.query(
      `UPDATE active_runs SET status = 'done', final_data = $1, received = $2,
       found_count = $3, error_count = $4, completed_at = NOW(), updated_at = NOW()
       WHERE id = $5`,
      [JSON.stringify(finalResult), received, foundCount, errorCount, runId]
    );

    // Persist prompt_runs in batches
    for (let i = 0; i < allResults.length; i += 100) {
      const batch = allResults.slice(i, i + 100);
      const values: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any[] = [];
      let pi = 1;
      for (const r of batch) {
        const prId = uid();
        values.push(`($${pi},$${pi+1},$${pi+2},$${pi+3},$${pi+4},$${pi+5},$${pi+6},$${pi+7},$${pi+8},$${pi+9},$${pi+10},$${pi+11},$${pi+12},$${pi+13},$${pi+14})`);
        p.push(prId, brandId, r.query, r.platform, r.model || null,
          r.mentioned || false, r.sentiment || 'neutral', r.recommended || false,
          r.listPosition || null, JSON.stringify(r.citations || []),
          JSON.stringify(r.competitorMentions || []), !r.error, runId,
          r.raw || null, r.cacheHit || false);
        pi += 15;
      }
      try {
        await pool.query(
          `INSERT INTO prompt_runs (id, brand_id, prompt, platform, model, mentioned, sentiment, recommended, list_position, citations, competitor_mentions, success, batch_id, response_raw, cache_hit) VALUES ${values.join(',')}`, p,
        );
      } catch (e) {
        logger.error('worker.prompt_runs_batch_failed', {
          run_id: runId,
          brand_id: brandId,
          error: (e as Error).message,
        });
      }
    }

    console.log(`[Worker] Run ${runId} complete: ${totalQ} queries, ${totalM} mentions, ${totalErrors} errors, ${Math.round(durationMs/1000)}s`);

  } catch (err) {
    try {
      await pool.query(
        `UPDATE active_runs SET status = 'error', error = $1, received = $2,
         found_count = $3, error_count = $4, completed_at = NOW(), updated_at = NOW()
         WHERE id = $5`,
        [(err as Error).message, received, foundCount, errorCount, runId]
      );
    } catch (e) {
      logger.error('worker.mark_run_error_failed', {
        run_id: runId,
        error: (e as Error).message,
      });
    }
    logger.error('worker.run_failed', {
      run_id: runId,
      brand_id: brandId,
      error: (err as Error).message,
    });
  }
}

// --- Worker startup ---
const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker('brand-runs', processRun, {
    connection,
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error('worker.job_failed', { job_id: job?.id, error: err.message });
  });

  // Graceful shutdown
  async function shutdown() {
    console.log('[Worker] Shutting down gracefully...');
    await worker.close();
    await connection.quit();
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log('[Worker] BullMQ worker started, listening for brand-runs jobs');
} else {
  console.warn('[Worker] REDIS_URL not set - worker not started');
}
