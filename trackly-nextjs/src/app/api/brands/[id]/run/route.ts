import crypto from 'crypto';
import { pool, auditLog, ensureColumns } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, uid, decryptApiKeys } from '@/lib/helpers';
import { getPlanLimits, getEffectivePlan } from '@/lib/constants';
import { reserveTrialPromptBudget } from '@/lib/anti-abuse';
import { queryAI, getDefaultModel, estimateCost, circuitBreakerCheck, resetApiKeyFailures, isDataForSEOConfigured, pickBestKey, withDeepRetry, isTransientError, acquirePlatformSlot } from '@/lib/ai-platforms';
import { getAdminModel } from '@/lib/site-config';
import { parseResponse, buildBrandMatcher, detectCompetitors, aggregateCompetitorCounts } from '@/lib/parser';
import { after } from 'next/server';
import { isQueueAvailable, enqueueBrandRun } from '@/lib/job-queue';
import { logger } from '@/lib/logger';

const PLATFORM_KEY_MAP: Record<string, string> = {
  ChatGPT: 'openai', Perplexity: 'perplexity', Claude: 'claude',
  Gemini: 'gemini', Grok: 'grok', 'Google AI Overviews': 'dataforseo',
};
const PLATFORMS = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok', 'Google AI Overviews'];
const PLAN_DEFAULT_PLATFORMS: Record<string, string[]> = {
  starter: ['ChatGPT', 'Claude'],
  free:    ['Gemini', 'Grok'],
};
const FAIL_THRESHOLD = 5;

// TTL for AI/DB response cache entries. No prior constant existed in this
// route, so default to 3600s per the backend caching policy.
const RESPONSE_CACHE_TTL_SECONDS = 3600;

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
    dataforseo: isDataForSEOConfigured() ? ['dataforseo-configured'] : [],
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
  let isCronCall = false;
  let callerIsAdminOrOwner = false;

  if (cronSecret && cronHeader && cronSecret.length === cronHeader.length &&
      crypto.timingSafeEqual(Buffer.from(cronSecret), Buffer.from(cronHeader))) {
    // Internal cron call - resolve brand owner from the brand record
    isCronCall = true;
    const { id: brandId } = await params;
    const brandRow = await pool.query('SELECT user_id FROM brands WHERE id = $1', [brandId]);
    if (!brandRow.rows.length) return Response.json({ error: 'Brand not found' }, { status: 404 });
    user = { id: brandRow.rows[0].user_id };
  } else {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    user = authResult;

    // Load caller's plan/role once - used for manual-run gating AND for the
    // admin/owner limit bypass further down.
    const roleResult = await pool.query('SELECT plan, role FROM users WHERE id = $1', [user.id]);
    const userPlan = roleResult.rows[0]?.plan || 'free';
    const userRole = roleResult.rows[0]?.role || '';
    callerIsAdminOrOwner = userPlan === 'owner' || userRole === 'admin';

    // Auto-triggered runs (brand creation, new queries) are allowed for all users.
    // Manual "Run Queries" button is admin/owner only.
    const isAutoRun = new URL(request.url).searchParams.get('auto') === '1';
    if (!isAutoRun && !callerIsAdminOrOwner) {
      return Response.json({ error: 'Runs are automated on your plan schedule. Manual runs are not available.' }, { status: 403 });
    }
  }

  const { id } = await params;
  const url = new URL(request.url);
  const forceRun = url.searchParams.get('force') === '1';

  // --- Validation ---
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
  if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot run queries' }, { status: 403 });

  const brand = access.brand;
  const ownerId = brand.userId || user.id;
  // Use brand owner's plan for limits (not team member's plan).
  // Admins/owners bypass this and use the unlimited owner-plan limits so they
  // can manage client brands without being clamped by the client's tier.
  await ensureColumns();
  const planResult = await pool.query('SELECT u.plan, u.trial_ends_at, u.api_keys FROM users u JOIN brands b ON b.user_id = u.id WHERE b.id = $1', [id]);
  const ownerPlan = getEffectivePlan(planResult.rows[0]?.plan, planResult.rows[0]?.trial_ends_at);
  const effectivePlan = callerIsAdminOrOwner ? 'owner' : ownerPlan;
  const limits = getPlanLimits(effectivePlan);

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

  // Support running only specific queries (e.g. newly added ones) via request body
  let body: { queries?: string[]; platforms?: string[] } = {};
  try { body = await request.json(); } catch { /* no body or invalid JSON is fine */ }
  const allQueries: string[] = brand.queries || [];
  const queries: string[] = (body.queries && Array.isArray(body.queries) && body.queries.length > 0)
    ? body.queries.filter((q: string) => allQueries.includes(q))  // only allow queries that exist on the brand
    : allQueries;
  if (!queries.length) return Response.json({ error: 'No queries configured. Add queries in Brand Setup.' }, { status: 400 });

  const userKeys = decryptApiKeys(planResult.rows[0]?.api_keys || {});
  const serverKeys = getServerKeys();

  const runnablePlatforms = PLATFORMS.filter(p => {
    const keyName = PLATFORM_KEY_MAP[p];
    return (serverKeys[keyName]?.length || userKeys[keyName]) ? true : false;
  });

  // User's saved selection (or an override in the request body) is authoritative -
  // plan defaults only apply when the user has not chosen anything.
  const requestedPlatforms: string[] | null = Array.isArray(body.platforms)
    ? (body.platforms as string[])
    : (Array.isArray(brand.platforms) ? (brand.platforms as string[]) : null);

  let activePlatforms: string[];
  if (requestedPlatforms && requestedPlatforms.length) {
    activePlatforms = requestedPlatforms.filter(p => runnablePlatforms.includes(p));
    if (activePlatforms.length > limits.platforms) {
      activePlatforms = activePlatforms.slice(0, limits.platforms);
    }
    if (!activePlatforms.length) {
      return Response.json({ error: 'None of the selected AI platforms have API keys configured.' }, { status: 400 });
    }
  } else {
    const planDefaults = PLAN_DEFAULT_PLATFORMS[ownerPlan];
    let defaults = planDefaults
      ? planDefaults.filter(p => runnablePlatforms.includes(p))
      : runnablePlatforms.slice();
    if (!defaults.length) defaults = runnablePlatforms.slice();
    activePlatforms = defaults.slice(0, limits.platforms);
    if (!activePlatforms.length) return Response.json({ error: 'No API keys configured.' }, { status: 400 });
  }

  // --- Atomic monthly run limit check (prevents race condition with concurrent requests) ---
  try {
    const runsResult = await pool.query(
      `SELECT COUNT(*) as used FROM active_runs ar JOIN brands b ON ar.brand_id = b.id
       WHERE b.user_id = $1 AND ar.started_at >= NOW() - INTERVAL '30 days'
       AND ar.status IN ('done', 'running')
       FOR UPDATE`,
      [ownerId]
    );
    const runsUsed = parseInt(runsResult.rows[0]?.used, 10) || 0;
    if (runsUsed >= limits.runsPerMonth) {
      return Response.json({
        error: `Monthly run limit reached (${runsUsed}/${limits.runsPerMonth} runs used). Upgrade your plan or wait for the monthly reset.`,
        planLimit: true,
        runsUsed,
        runsLimit: limits.runsPerMonth,
      }, { status: 429 });
    }
  } catch {
    // If active_runs table doesn't exist yet, skip the check
  }

  // --- Per-user concurrency limit (max 3 simultaneous runs) ---
  try {
    const concurrentResult = await pool.query(
      `SELECT COUNT(*) as active FROM active_runs ar JOIN brands b ON ar.brand_id = b.id
       WHERE b.user_id = $1 AND ar.status = 'running' AND ar.started_at > NOW() - INTERVAL '15 minutes'`,
      [ownerId]
    );
    const activeRuns = parseInt(concurrentResult.rows[0]?.active, 10) || 0;
    if (activeRuns >= 3) {
      return Response.json({
        error: `Too many concurrent runs (${activeRuns}/3). Please wait for a run to finish before starting another.`,
      }, { status: 429 });
    }
  } catch {
    // Skip if table doesn't exist
  }

  // --- Check per-brand query limit ---
  if (queries.length > limits.queries) {
    return Response.json({
      error: `Your ${ownerPlan} plan allows up to ${limits.queries} queries per brand. You have ${queries.length}. Remove some queries or upgrade.`,
      planLimit: true,
    }, { status: 403 });
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

  // --- Trial prompt budgets (per-user daily + global daily) ---
  // Reserved against the brand owner so team runs still count against it.
  const budgetCheck = await reserveTrialPromptBudget(ownerId, ownerPlan, totalExpected);
  if (!budgetCheck.allowed) {
    return Response.json(
      { error: budgetCheck.reason, planLimit: true, code: budgetCheck.code },
      { status: 429 }
    );
  }

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

  // --- Return immediately, execute in background ---
  // Default policy: run in-process via Next.js after(), which is the
  // safest path because it doesn't depend on a separate worker dyno
  // being alive. Enqueue to BullMQ only when QUEUE_MODE=auto|always
  // explicitly opts in. See src/lib/job-queue.ts for mode semantics.
  const shouldEnqueue = await isQueueAvailable();
  const runInProcess = () => {
    after(async () => {
      await executeRunBackground(brand, id, user.id, runId, totalExpected, activePlatforms, queries, serverKeys, userKeys);
    });
  };
  if (shouldEnqueue) {
    try {
      await enqueueBrandRun({
        brand, brandId: id, userId: user.id, runId, totalExpected,
        activePlatforms, queries, serverKeys, userKeys,
      });
    } catch (e) {
      // Redis went down between the availability check and the enqueue.
      // Fall back to in-process so the run still completes this tick.
      logger.warn('run.enqueue_failed_falling_back', {
        brand_id: id,
        run_id: runId,
        error: (e as Error).message,
      });
      runInProcess();
    }
  } else {
    // Not alarming under QUEUE_MODE=never (the default); only warn if
    // the operator opted into auto mode but no consumer is healthy.
    if (process.env.QUEUE_MODE === 'auto' && process.env.REDIS_URL) {
      logger.warn('run.queue_unhealthy_inprocess_fallback', {
        brand_id: id,
        run_id: runId,
      });
    }
    runInProcess();
  }

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

  // Pre-load admin-selected models for all platforms
  const adminModels: Record<string, string> = {};
  for (const plat of activePlatforms) {
    adminModels[plat] = await getAdminModel(plat);
    platFailCount[plat] = 0;
  }

  // Build round-robin task list - cycle through platforms so concurrent
  // workers hit different platforms rather than hammering the same one
  const tasks: Array<{ plat: string; q: string }> = [];
  for (let qi = 0; qi < queries.length; qi++) {
    for (let pi = 0; pi < activePlatforms.length; pi++) {
      tasks.push({ plat: activePlatforms[pi], q: queries[qi] });
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
    // Transient errors (429, 503, capacity) don't count toward the
    // consecutive-failure threshold - the platform isn't broken, just busy.
    if (!isTransientError(err)) {
      platFailCount[plat] = (platFailCount[plat] || 0) + 1;
    }
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

  // 10 min cap to accommodate the 8-min deep-retry budget in queryAI plus
  // headroom for slow providers. Transient rate limits can take several
  // minutes to clear under sustained provider-side load.
  const WORKER_TIMEOUT_MS = 600000;

  async function runWorker() {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      if (idx >= tasks.length) return;
      const { plat, q } = tasks[idx];
      try {
        if (platFailCount[plat] >= FAIL_THRESHOLD) {
          throw new Error(`Skipped - ${plat} had ${FAIL_THRESHOLD} consecutive failures`);
        }

        // Build the per-attempt call: pick a healthy key (skips circuit-broken
        // and cooling keys), acquire a platform slot (semaphore + RPM window),
        // then call the provider. Wrapped in withDeepRetry so transient errors
        // keep retrying until the wall-clock budget expires.
        const keyName = PLATFORM_KEY_MAP[plat];
        const userKey = userKeys[keyName];
        const serverKeyList = serverKeys[keyName] || [];
        const keyPool: string[] = userKey ? [userKey] : serverKeyList;
        if (!keyPool.length) throw new Error('No API key available for ' + plat);

        const singleAttempt = async () => {
          const rawKey = pickBestKey(keyPool);
          if (!rawKey) throw new Error('No usable API key for ' + plat);
          if (circuitBreakerCheck(rawKey)) {
            throw new Error('Circuit breaker open for API key - too many auth failures');
          }
          const release = await acquirePlatformSlot(plat);
          try {
            const r = await queryAI(plat, q, rawKey, adminModels[plat] || getDefaultModel(plat), brand);
            resetApiKeyFailures(rawKey);
            return r;
          } finally {
            release();
          }
        };

        const result = await Promise.race([
          withDeepRetry(plat, singleAttempt),
          new Promise<never>((_, rej) => setTimeout(
            () => rej(new Error(`Worker timeout after ${Math.round(WORKER_TIMEOUT_MS / 60000)} minutes`)),
            WORKER_TIMEOUT_MS,
          )),
        ]);
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
    // Cap concurrency at 8 workers; platform-level semaphore in queryAI
    // further limits per-provider parallelism to avoid 429s.
    const CONCURRENCY = Math.min(activePlatforms.length, 8);
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

    // Verify this run is still the active one before saving - prevents data
    // corruption if a newer run took over while this one was executing
    const activeCheck = await pool.query(
      'SELECT id FROM active_runs WHERE brand_id = $1 AND status = $2 ORDER BY started_at DESC LIMIT 1',
      [brandId, 'running']
    );
    if (activeCheck.rows.length > 0 && activeCheck.rows[0].id !== runId) {
      console.warn(`[Run] Run ${runId} superseded by ${activeCheck.rows[0].id} - skipping final save`);
      await pool.query(
        `UPDATE active_runs SET status = 'error', error = 'Superseded by newer run', completed_at = NOW() WHERE id = $1`,
        [runId]
      );
      return;
    }

    // Save to brand data FIRST - must complete before marking active_runs as
    // done, because the client polls active_runs status and immediately calls
    // refreshBrands() when it sees "done". If brand data isn't saved yet, the
    // dashboard shows stale "Last Run" data.
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

    // NOW mark run as done - client will see this and call refreshBrands(),
    // which will find the already-updated brand data above
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
      } catch (e) { console.error('[Run] Failed to persist prompt_runs batch:', (e as Error).message); }
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
    } catch (e) { console.error('[Run] Failed to mark run as error:', (e as Error).message); }

    // Emergency save partial results to brand data
    if (allResults.length > 0) {
      try {
        const emergSov = totalQ > 0 ? Math.round((totalM / totalQ) * 100) : 0;
        const emergResults = allResults.map(({ tokensIn, tokensOut, cost, ...rest }: Record<string, unknown>) => rest);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const brandData = { ...brand } as any;
        delete brandData.id; delete brandData.userId; delete brandData.createdAt; delete brandData.updatedAt;
        if (!brandData.runs) brandData.runs = [];
        brandData.runs.push({
          id: runId, date: new Date().toISOString().split('T')[0],
          time: new Date().toISOString(), allResults: emergResults,
          sov: emergSov, totalQ, totalM, queries: brand.queries || [],
          activePlatforms: [], emergencySave: true, crashError: (err as Error).message,
          competitors: aggregateCompetitorCounts(allResults),
        });
        brandData.updatedAt = new Date().toISOString();
        await pool.query('UPDATE brands SET data = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(brandData), brandId]);
      } catch (e) { console.error('[Run] Emergency save failed:', (e as Error).message); }
    }
    console.error('[Run] Background execution failed:', (err as Error).message);
  }
}
