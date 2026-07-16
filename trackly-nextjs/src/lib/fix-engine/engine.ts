/**
 * Fix Engine - the runner.
 *
 * Drives every fix through the same state machine the same way:
 *   detect (scan) → generate → approve → ship → recheck
 *
 * Concurrency + idempotency model mirrors geo-audits:
 *   - POST .../scan inserts a fix_batch in 'queued', then after()
 *     fires runScan() in-process; /api/cron/fix-engine-worker is the
 *     cold-restart safety net for stuck 'queued' batches.
 *   - Per-stage transitions are claimed atomically (claimFixTransition)
 *     so after() and cron can't double-run a stage.
 *
 * Credits: a flat per-module generation estimate is reserved before
 * generate() and refunded on failure (the real provider spend is
 * recorded by queryAI's own recordCostEvent during the call).
 */

import { after } from 'next/server';
import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { reserveCredits, refundCredits } from '@/lib/credits';
import { getUserEffectivePlan } from '@/lib/helpers';
import { getModule, listModules, generateCost } from './registry';
import {
  ensureFixEngineSchema,
  claimBatchForRunning,
  finalizeBatch,
  getBatch,
  upsertDetectedFix,
  getFix,
  updateFix,
  restoreDismissedFixes,
  claimFixTransition,
  resetConnectorDelivery,
  logFixEvent,
  isEdgeServeableModule,
} from './schema';
import { getConnection } from './connections';
import { CmsUnsupportedError } from './cms/types';
import { probeEdgeMarker } from './cms/edge';
import { syncBrandSeoToRepo } from './git/sync';
import { getBrandAiVisibility } from './ai-visibility';
import { applyBrandRules } from './rules';
import type { DetectedIssue, FixBrand, FixContext, FixModule, FixRow } from './types';

// Generation cost lives in the registry (single source of truth) and is
// imported as generateCost().

interface BrandRow { id: string; user_id: string; data: Record<string, unknown> }

async function loadBrand(brandId: string): Promise<BrandRow | null> {
  const res = await pool.query(
    `SELECT id, user_id, data FROM brands WHERE id = $1 LIMIT 1`,
    [brandId],
  );
  return (res.rows[0] as BrandRow | undefined) ?? null;
}

/** The brand owner's user id (tenant key), or null when the brand is gone. */
export async function getOwnerId(brandId: string): Promise<string | null> {
  const row = await loadBrand(brandId);
  return row ? row.user_id : null;
}

/**
 * Build the runtime context for a brand: the brand view, the owner's
 * tenant id, and legacy per-user provider keys (same path as the
 * geo-audits worker).
 */
export async function buildContext(brandId: string, signal?: AbortSignal): Promise<FixContext | null> {
  await ensureFixEngineSchema();
  const row = await loadBrand(brandId);
  if (!row) return null;
  const d = row.data || {};
  const brand: FixBrand = {
    id: row.id,
    userId: row.user_id,
    name: typeof d.name === 'string' ? d.name : (d.brandName as string | undefined),
    website: typeof d.website === 'string' ? d.website : undefined,
    industry: typeof d.industry === 'string' ? d.industry : null,
    city: typeof d.city === 'string' ? d.city : null,
    country: typeof d.country === 'string' ? d.country : null,
    description: typeof d.description === 'string' ? d.description : undefined,
    queries: Array.isArray(d.queries) ? (d.queries as string[]) : [],
    competitors: Array.isArray(d.competitors) ? (d.competitors as string[]) : [],
  };
  const keysRes = await pool.query(`SELECT api_keys FROM users WHERE id = $1 LIMIT 1`, [row.user_id]);
  const userKeysLegacy = ((keysRes.rows[0] as { api_keys?: Record<string, string> } | undefined)?.api_keys) || {};
  return { pool, brand, tenantId: row.user_id, userKeysLegacy, signal };
}

// ── scan (detect across modules) ─────────────────────────────────

export interface RunScanOptions {
  /** Restrict to these module keys; default = all registered modules. */
  moduleKeys?: string[];
}

/**
 * Process one scan batch end-to-end. Idempotent: returns early if the
 * batch was already claimed/terminal.
 */
export async function runScan(batchId: string, opts: RunScanOptions = {}): Promise<void> {
  await ensureFixEngineSchema();
  const batch = await getBatch(batchId);
  if (!batch) return;
  if (batch.status !== 'queued') return; // already running/terminal
  if (!(await claimBatchForRunning(batchId))) return; // lost the race

  const ctx = await buildContext(batch.brandId);
  if (!ctx) {
    await finalizeBatch(batchId, 'failed', 0, 0, 'Brand not found');
    return;
  }

  const keys = opts.moduleKeys?.length ? opts.moduleKeys : batch.modules.length ? batch.modules : listModules().map((m) => m.key);
  let received = 0;
  let totalExpected = 0;
  const errors: string[] = [];

  // Every module re-crawls the same targets; the scan-scoped cache makes
  // that one fetch per page for the whole scan (see crawl.ts).
  const { beginCrawlCache, endCrawlCache } = await import('./crawl');
  beginCrawlCache();
  try {
  for (const key of keys) {
    const mod = getModule(key);
    if (!mod) continue;
    try {
      const issues = await mod.detect(ctx);
      totalExpected += issues.length;
      for (const issue of issues) {
        await upsertDetectedFix({
          userId: ctx.brand.userId,
          brandId: ctx.brand.id,
          batchId,
          moduleKey: mod.key,
          channel: mod.channel,
          targetUrl: issue.targetUrl,
          dedupeKey: issue.key,
          severity: issue.severity,
          summary: issue.summary,
          detected: issue.detected,
          before: issue.before,
        });
        received++;
      }
    } catch (e) {
      errors.push(`${key}: ${(e as Error).message}`);
      logger.error('fix_engine.detect_failed', { module: key, brandId: ctx.brand.id, err: (e as Error).message });
    }
  }
  } finally {
    endCrawlCache();
  }

  await finalizeBatch(batchId, errors.length && received === 0 ? 'failed' : 'done', received, totalExpected, errors.slice(0, 5).join('; ') || null);
  await logFixEvent(null, ctx.brand.id, ctx.brand.userId, 'scan.done', { received, totalExpected, modules: keys });
}

/** Create a scan batch and dispatch it in-process via after(). */
export async function dispatchScan(userId: string, brandId: string, moduleKeys: string[]): Promise<string> {
  const { createBatch } = await import('./schema');
  const batchId = await createBatch(userId, brandId, moduleKeys);
  after(async () => {
    try { await runScan(batchId, { moduleKeys }); }
    catch (e) { logger.error('fix_engine.scan_after_failed', { batchId, err: (e as Error).message }); }
  });
  return batchId;
}

// Reconstruct the in-memory DetectedIssue a module's stages expect from
// a persisted fix row.
function issueFromRow(fix: FixRow): DetectedIssue {
  return {
    key: fix.dedupeKey,
    targetUrl: fix.targetUrl,
    severity: fix.severity,
    summary: fix.summary,
    detected: fix.detected,
    before: fix.beforeSnapshot ?? undefined,
  };
}

// ── generate ─────────────────────────────────────────────────────

export async function generateFix(fixId: string, brandId: string, instruction?: string): Promise<FixRow> {
  const fix = await getFix(fixId, brandId);
  if (!fix) throw new Error('Fix not found');
  const mod = getModule(fix.moduleKey);
  if (!mod) throw new Error(`Unknown module: ${fix.moduleKey}`);
  // Allow (re)generate from detected, a prior draft, a failed attempt, or an
  // already-live fix the user wants to revise. Revising a live fix is only
  // safe when the module OVERWRITES on ship (has a revert() — title/meta):
  // re-shipping replaces the live value cleanly. Append-style modules would
  // duplicate content, so they must be Undone first, not revised in place.
  const priorStatus = fix.status;
  const wasLive = priorStatus === 'shipped' || priorStatus === 'verified';
  if (!['detected', 'generated', 'failed', 'shipped', 'verified'].includes(priorStatus)) {
    throw new Error(`Cannot generate a fix in status '${priorStatus}'`);
  }
  if (wasLive && typeof mod.revert !== 'function') {
    throw new Error('This fix type can’t be revised in place after shipping — Undo it first, then regenerate.');
  }
  // Where to return the fix if this attempt can't complete: a live fix must
  // stay exactly as it shipped (never fall back to detected/failed), otherwise
  // roll to the requested status (detected = retry later, failed = actionable).
  const rollback = (status: 'detected' | 'failed', error: string | null) =>
    updateFix(fix.id, { status: wasLive ? priorStatus : status, error: wasLive ? null : error });
  if (!(await claimFixTransition(fix.id, priorStatus, 'generating'))) {
    return (await getFix(fixId, brandId))!; // lost the race
  }

  const ctx = await buildContext(brandId);
  if (!ctx) {
    await rollback('failed', 'Brand not found');
    throw new Error('Brand not found');
  }

  const plan = await getUserEffectivePlan(ctx.brand.userId);
  const cost = generateCost(mod.key);
  const reservation = await reserveCredits(ctx.brand.userId, plan, cost, 'manual');
  if (!reservation.ok) {
    // Roll the status back so the user can retry once they have credits (a
    // live fix returns to its shipped state, nothing lost).
    await rollback('detected', reservation.message);
    throw Object.assign(new Error(reservation.message), {
      code: reservation.code, paymentRequired: true,
    });
  }

  try {
    // Steerable regeneration: when the reviewer supplies guidance ("keep it
    // under 55 chars", "lead with the keyword"), persist it onto the detected
    // issue so the module's generate() can honor it (the text modules read
    // `detected.instruction`). An empty string clears any prior guidance so a
    // plain regenerate starts fresh; `undefined` leaves the last one in place.
    let detected = fix.detected;
    if (instruction !== undefined) {
      detected = { ...fix.detected };
      const trimmed = instruction.trim().slice(0, 2000);
      if (trimmed) detected.instruction = trimmed; else delete detected.instruction;
      await updateFix(fix.id, { detected });
    }
    const issue = issueFromRow({ ...fix, detected });
    const draft = await mod.generate(issue, ctx);
    // Brand guardrails: deterministic post-generation policies (title suffix,
    // length caps, banned phrases). Dynamic import avoids the automation ⇄
    // engine module cycle.
    let generated = draft.generated;
    try {
      const { getAutomation } = await import('./automation');
      const auto = await getAutomation(brandId);
      const ruled = applyBrandRules(generated, auto.rules);
      generated = ruled.generated;
      if (ruled.applied.length) {
        await logFixEvent(fix.id, brandId, ctx.brand.userId, 'rules.applied', { applied: ruled.applied });
      }
    } catch (e) {
      logger.warn('fix_engine.rules_apply_failed', { fixId: fix.id, err: (e as Error).message });
    }
    // A revised live fix returns to review; the site keeps the shipped copy
    // until this new draft is approved and re-shipped.
    await updateFix(fix.id, { status: 'generated', generated, error: null });
    await logFixEvent(fix.id, brandId, ctx.brand.userId, 'generated', { module: mod.key, cost, steered: !!detected.instruction, revisedFrom: wasLive ? priorStatus : undefined });
    return (await getFix(fixId, brandId))!;
  } catch (e) {
    await refundCredits(ctx.brand.userId, cost, 'manual');
    // Generation failed: a live fix stays live (its shipped value is fine);
    // a not-yet-live one goes to 'failed' so it's actionable.
    await rollback('failed', (e as Error).message);
    await logFixEvent(fix.id, brandId, ctx.brand.userId, 'generate.failed', { error: (e as Error).message });
    throw e;
  }
}

// ── approve ──────────────────────────────────────────────────────

export async function approveFix(fixId: string, brandId: string, userId: string | null): Promise<FixRow> {
  const fix = await getFix(fixId, brandId);
  if (!fix) throw new Error('Fix not found');
  if (fix.status !== 'generated') throw new Error(`Only a generated fix can be approved (status: ${fix.status})`);
  if (!(await claimFixTransition(fix.id, 'generated', 'approved'))) {
    return (await getFix(fixId, brandId))!;
  }
  await logFixEvent(fix.id, brandId, userId, 'approved', {});
  return (await getFix(fixId, brandId))!;
}

// ── ship ─────────────────────────────────────────────────────────

/**
 * Mark a fix shipped and record the post-ship baselines, shared by both the
 * edge-publish fast-path and the CMS-write success path so they stay identical:
 * snapshot the brand's AI visibility (SOV) + the page's 28-day GSC metrics for
 * the before/after, persist the shipped row, and (Channel A) queue an auto-
 * recheck that confirms the change is actually live by re-crawling the page —
 * so a write that didn't really persist can't sit at "shipped" unnoticed.
 * Channel B is auto-rechecked when the Connector acks (see the ack route).
 */
async function finalizeShippedFix(
  fix: FixRow,
  brandId: string,
  userId: string | null,
  mod: FixModule,
  shipResult: Record<string, unknown> | null | undefined,
  afterSnapshot: Record<string, unknown> | null,
): Promise<void> {
  const aiBefore = await getBrandAiVisibility(brandId);
  let gscBefore: Record<string, unknown> | null = null;
  if (fix.targetUrl) {
    try {
      const { getPageMetrics, normUrl } = await import('./page-metrics');
      const m = (await getPageMetrics(brandId, [fix.targetUrl])).get(normUrl(fix.targetUrl));
      if (m) gscBefore = { clicks: m.clicks, impressions: m.impressions, ctr: m.ctr, position: m.position, at: new Date().toISOString() };
    } catch { /* enrichment only */ }
  }
  await updateFix(fix.id, {
    status: 'shipped',
    shipResult: shipResult ?? null,
    afterSnapshot,
    aiBefore: aiBefore ? { ...aiBefore } : null,
    gscBefore,
    error: null,
  });
  await logFixEvent(fix.id, brandId, userId, 'shipped', { channel: mod.channel, detail: shipResult });
  if (mod.channel === 'A') {
    after(async () => {
      try { await recheckFix(fix.id, brandId, userId); }
      catch (e) { logger.warn('fix_engine.ship_autorecheck_failed', { fixId: fix.id, err: (e as Error).message }); }
    });
  }
}

export async function shipFix(fixId: string, brandId: string, userId: string | null): Promise<FixRow> {
  const fix = await getFix(fixId, brandId);
  if (!fix) throw new Error('Fix not found');
  const mod = getModule(fix.moduleKey);
  if (!mod) throw new Error(`Unknown module: ${fix.moduleKey}`);
  if (!fix.generated) throw new Error('Fix has no generated content to ship');
  // Ship is allowed from approved (human gate) or a failed prior ship.
  if (!['approved', 'failed'].includes(fix.status)) {
    throw new Error(`Cannot ship a fix in status '${fix.status}'`);
  }
  if (!(await claimFixTransition(fix.id, fix.status, 'shipping'))) {
    return (await getFix(fixId, brandId))!;
  }

  const ctx = await buildContext(brandId);
  if (!ctx) { await updateFix(fix.id, { status: 'failed', error: 'Brand not found' }); throw new Error('Brand not found'); }

  // Edge-fronted publishing (custom / edge CMS). An edge-serveable Channel-A
  // fix on a domain the Livesov Worker fronts is delivered by the Worker
  // rewriting the page in transit — the shipped row IS the override
  // (getEdgeSeoOverrides). There is no origin write to make, and the site's CMS
  // usually can't make one (a static/custom endpoint 422s on update_body /
  // inject_schema), so publish to the edge and skip the CMS write. Gated on
  // (a) the brand's CMS being an edge-fronted stack — 'edge' or 'custom'; real
  // CMS APIs (wordpress/shopify/ghost/webflow) keep their origin write, so
  // there's no regression — and (b) the Worker actually being live on the page
  // (marker probe), so we never claim a change is live where it isn't. If the
  // Worker isn't live, fall through to the normal CMS write (today's behavior).
  if (mod.channel === 'A' && isEdgeServeableModule(fix.moduleKey) && fix.targetUrl) {
    const cmsConn = await getConnection(brandId, 'cms');

    // Git-fronted publishing (durable/"owned"). Same contract as edge — the
    // shipped row IS the override — but delivered by committing the per-path
    // manifest into the customer's repo via a PR (so it lives in their source
    // and survives snippet/Worker removal). Mark shipped, then sync the repo
    // best-effort: a GitHub hiccup never fails the ship (the fix is already
    // shipped; the manifest catches up on the next ship or a manual re-sync).
    if (cmsConn?.status === 'active' && cmsConn.cmsType === 'git') {
      await finalizeShippedFix(fix, brandId, userId, mod, { delivery: 'git', module: fix.moduleKey, url: fix.targetUrl }, null);
      void syncBrandSeoToRepo(brandId).catch((e) => logger.warn('fix_engine.git_sync_dispatch_failed', { fixId: fix.id, err: (e as Error).message }));
      return (await getFix(fixId, brandId))!;
    }

    const edgeFronted = cmsConn?.status === 'active'
      && (cmsConn.cmsType === 'edge' || cmsConn.cmsType === 'custom');
    if (edgeFronted) {
      const probe = await probeEdgeMarker(fix.targetUrl);
      if (probe.routed) {
        await finalizeShippedFix(fix, brandId, userId, mod, { delivery: 'edge', module: fix.moduleKey, url: fix.targetUrl }, null);
        return (await getFix(fixId, brandId))!;
      }
      logger.info('fix_engine.edge_publish_skipped_worker_absent', { fixId: fix.id, url: fix.targetUrl, status: probe.status, err: probe.error });
    }
  }

  try {
    const issue = issueFromRow(fix);
    const result = await mod.ship(issue, { generated: fix.generated }, ctx);
    if (result.ok) {
      await finalizeShippedFix(fix, brandId, userId, mod, result.detail, result.after ?? null);
    } else {
      await updateFix(fix.id, { status: 'failed', shipResult: result.detail, error: result.error ?? 'Ship failed' });
      await logFixEvent(fix.id, brandId, userId, 'ship.failed', { error: result.error, detail: result.detail });
    }
    return (await getFix(fixId, brandId))!;
  } catch (e) {
    // A CMS/endpoint that can't perform this op (CmsUnsupportedError — e.g. a
    // static site whose endpoint doesn't implement update_body) is not proof
    // the change is absent: the content is often already live, published by
    // hand. Verify by fetching the live page (the module's own recheck)
    // before declaring failure, so such fixes resolve instead of sticking in
    // ATTENTION forever. Every other error keeps the existing behavior.
    if (e instanceof CmsUnsupportedError) {
      try {
        const issue = issueFromRow(fix);
        const verdict = await mod.recheck(issue, { generated: fix.generated }, ctx);
        if (verdict.verified) {
          await updateFix(fix.id, {
            status: 'verified',
            shipResult: { delivery: 'verify_by_fetch', unsupportedOp: e.message },
            scoreAfter: verdict.scoreAfter ?? null,
            error: null,
          });
          await logFixEvent(fix.id, brandId, userId, 'ship.verified_by_fetch', { op: e.message, note: verdict.note });
          return (await getFix(fixId, brandId))!;
        }
      } catch (re) {
        logger.warn('fix_engine.verify_by_fetch_failed', { fixId: fix.id, err: (re as Error).message });
      }
      const manual = `${e.message}. Publish the change manually on the page, then hit Re-check — it will verify the live page and resolve this fix.`;
      await updateFix(fix.id, { status: 'failed', error: manual });
      await logFixEvent(fix.id, brandId, userId, 'ship.failed', { error: manual, unsupportedOp: true });
      return (await getFix(fixId, brandId))!;
    }
    await updateFix(fix.id, { status: 'failed', error: (e as Error).message });
    await logFixEvent(fix.id, brandId, userId, 'ship.failed', { error: (e as Error).message });
    throw e;
  }
}

// ── stage (ship-as-draft via the Connector) ──────────────────────

/**
 * Stage an approved fix as a DRAFT revision instead of writing it live.
 * Requires (a) the module to express its change as a ContentPatch and
 * (b) an active Connector — the plugin creates a draft revision and returns
 * a preview URL (captured on ack). The fix moves to 'staged'; the user
 * later calls publishStagedFix to promote it live.
 */
export async function stageFix(fixId: string, brandId: string, userId: string | null): Promise<FixRow> {
  const fix = await getFix(fixId, brandId);
  if (!fix) throw new Error('Fix not found');
  const mod = getModule(fix.moduleKey);
  if (!mod) throw new Error(`Unknown module: ${fix.moduleKey}`);
  if (!fix.generated) throw new Error('Fix has no generated content to stage');
  if (typeof mod.contentPatch !== 'function') {
    throw new Error('This fix type can’t be staged as a draft — ship it live instead.');
  }
  if (!['approved', 'failed'].includes(fix.status)) {
    throw new Error(`Cannot stage a fix in status '${fix.status}'`);
  }
  const conn = await getConnection(brandId, 'connector');
  if (!conn || conn.status !== 'active') {
    throw new Error('Staging needs the Connector plugin. Pair the Connector (Connections), or ship live.');
  }

  const issue = issueFromRow(fix);
  const patch = mod.contentPatch(issue, { generated: fix.generated });
  if (!patch || !patch.url) {
    throw new Error('This change can’t be staged (the target isn’t an editable page body). Ship it live or edit manually.');
  }

  if (!(await claimFixTransition(fix.id, fix.status, 'shipping'))) {
    return (await getFix(fixId, brandId))!;
  }
  await updateFix(fix.id, {
    status: 'staged',
    shipMode: 'draft',
    shipResult: { op: 'stage_content', channel: 'draft', delivery: 'connector_pull' },
    // `content` is the exact string both sides HMAC-sign over (PHP's
    // wp_json_encode escapes '/' differently from JSON.stringify, so we never
    // sign the whole payload object for these ops — only this string).
    afterSnapshot: { url: patch.url, patch, content: JSON.stringify(patch) },
    previewUrl: null,
    error: null,
  });
  await resetConnectorDelivery(fix.id); // ensure the Connector pulls it
  await logFixEvent(fix.id, brandId, userId, 'staged', { url: patch.url });
  return (await getFix(fixId, brandId))!;
}

/**
 * Promote a staged draft to live. Re-queues the fix for the Connector with
 * the 'publish_content' op; on ack the fix flips to 'shipped' and auto-
 * rechecks (handled in the ack route).
 */
export async function publishStagedFix(fixId: string, brandId: string, userId: string | null): Promise<FixRow> {
  const fix = await getFix(fixId, brandId);
  if (!fix) throw new Error('Fix not found');
  if (fix.status !== 'staged') throw new Error(`Only a staged fix can be published (status: ${fix.status})`);
  const conn = await getConnection(brandId, 'connector');
  if (!conn || conn.status !== 'active') {
    throw new Error('Publishing a staged draft needs the Connector plugin to be active.');
  }
  const url = (fix.afterSnapshot as { url?: string } | null)?.url;
  if (!url) throw new Error('Staged fix is missing its target URL');
  const patch = (fix.afterSnapshot as { patch?: unknown } | null)?.patch;
  await updateFix(fix.id, {
    shipResult: { op: 'publish_content', channel: 'draft', delivery: 'connector_pull' },
    // Stable signed string (see stageFix): publish carries the same patch so
    // the plugin can apply it even if it never saw the stage step.
    afterSnapshot: { url, patch, content: `publish:${url}` },
    error: null,
  });
  await resetConnectorDelivery(fix.id); // re-pull for the publish op
  await logFixEvent(fix.id, brandId, userId, 'publish.requested', { url });
  return (await getFix(fixId, brandId))!;
}

// ── recheck ──────────────────────────────────────────────────────

export async function recheckFix(fixId: string, brandId: string, userId: string | null): Promise<FixRow> {
  const fix = await getFix(fixId, brandId);
  if (!fix) throw new Error('Fix not found');
  const mod = getModule(fix.moduleKey);
  if (!mod) throw new Error(`Unknown module: ${fix.moduleKey}`);
  if (!fix.generated) throw new Error('Fix has no generated content to recheck');
  // 'failed' is allowed so a fix whose automatic write wasn't possible
  // (e.g. a static site) can be resolved by publishing the content manually
  // and re-checking — the live page is the source of truth.
  if (!['shipped', 'verified', 'failed'].includes(fix.status)) {
    throw new Error(`Cannot recheck a fix in status '${fix.status}'`);
  }

  const ctx = await buildContext(brandId);
  if (!ctx) throw new Error('Brand not found');

  const issue = issueFromRow(fix);
  const verdict = await mod.recheck(issue, { generated: fix.generated }, ctx);
  const aiAfter = await getBrandAiVisibility(brandId);
  // Conservative mapping: verified is earned by the live page; an
  // unverified 'failed' fix STAYS failed (never promoted to shipped).
  const nextStatus = verdict.verified ? 'verified' : (fix.status === 'failed' ? 'failed' : 'shipped');
  await updateFix(fix.id, {
    status: nextStatus,
    scoreAfter: verdict.scoreAfter ?? null,
    aiAfter: aiAfter ? { ...aiAfter } : null,
    // A fix that just verified is resolved — clear the stale failure text.
    ...(verdict.verified ? { error: null } : {}),
  });
  await logFixEvent(fix.id, brandId, userId, 'rechecked', { verified: verdict.verified, score: verdict.scoreAfter, note: verdict.note });
  return (await getFix(fixId, brandId))!;
}

// ── revert (undo a shipped fix) ──────────────────────────────────

export async function revertFix(fixId: string, brandId: string, userId: string | null): Promise<FixRow> {
  const fix = await getFix(fixId, brandId);
  if (!fix) throw new Error('Fix not found');
  const mod = getModule(fix.moduleKey);
  if (!mod) throw new Error(`Unknown module: ${fix.moduleKey}`);
  if (!['shipped', 'verified'].includes(fix.status)) {
    throw new Error(`Only a shipped fix can be reverted (status: ${fix.status})`);
  }

  // Edge-fronted un-publish fast-path (symmetric with shipFix's edge publish).
  // An edge-serveable Channel-A fix on a Worker-fronted domain was delivered by
  // the Worker reading the shipped row (getEdgeSeoOverrides) — there was no
  // origin write. So reverting it is simply dropping the row out of the shipped
  // set: mark it 'reverted' and it falls out of getEdgeSeoOverrides, so the
  // Worker stops injecting on the next request (subject to the ~5-min edge
  // cache). No mod.revert needed, and the custom endpoint can't cleanly remove
  // an appended block anyway. Gated exactly like the ship path: an edge/custom
  // CMS connection that's active. Real CMS APIs keep the mod.revert path below.
  if (mod.channel === 'A' && isEdgeServeableModule(fix.moduleKey) && fix.targetUrl) {
    const cmsConn = await getConnection(brandId, 'cms');
    const edgeFronted = cmsConn?.status === 'active'
      && (cmsConn.cmsType === 'edge' || cmsConn.cmsType === 'custom');
    if (edgeFronted) {
      if (!(await claimFixTransition(fix.id, fix.status, 'shipping'))) {
        return (await getFix(fixId, brandId))!;
      }
      await updateFix(fix.id, {
        status: 'reverted',
        shipResult: { delivery: 'edge', reverted: true, module: fix.moduleKey, url: fix.targetUrl },
        error: null,
      });
      await logFixEvent(fix.id, brandId, userId, 'reverted', { detail: { delivery: 'edge', url: fix.targetUrl } });
      return (await getFix(fixId, brandId))!;
    }
  }

  if (!mod.revert) throw new Error('This fix type cannot be auto-reverted — undo it manually on your site.');
  if (!fix.generated) throw new Error('Fix has no record to revert');
  if (!(await claimFixTransition(fix.id, fix.status, 'shipping'))) {
    return (await getFix(fixId, brandId))!;
  }

  const ctx = await buildContext(brandId);
  if (!ctx) { await updateFix(fix.id, { status: 'failed', error: 'Brand not found' }); throw new Error('Brand not found'); }

  try {
    const issue = issueFromRow(fix);
    const result = await mod.revert(issue, { generated: fix.generated }, ctx);
    if (result.ok) {
      await updateFix(fix.id, { status: 'reverted', shipResult: result.detail, error: null });
      await logFixEvent(fix.id, brandId, userId, 'reverted', { detail: result.detail });
    } else {
      // Put it back to shipped so the user can retry / handle manually.
      await updateFix(fix.id, { status: 'shipped', error: result.error ?? 'Revert failed' });
      await logFixEvent(fix.id, brandId, userId, 'revert.failed', { error: result.error });
    }
    return (await getFix(fixId, brandId))!;
  } catch (e) {
    await updateFix(fix.id, { status: 'shipped', error: (e as Error).message });
    await logFixEvent(fix.id, brandId, userId, 'revert.failed', { error: (e as Error).message });
    throw e;
  }
}

/**
 * Mark a fix as dismissed ("ignore" — the AI got this one wrong or the user
 * doesn't want it). It's hidden from the default lists but kept (not deleted)
 * so it can be restored, and so a re-scan won't silently resurface it as a
 * brand-new detection. A fix that's already live must be reverted, not
 * dismissed — dismissing wouldn't undo the on-site change.
 */
export async function dismissFix(fixId: string, brandId: string, userId: string | null): Promise<FixRow> {
  const fix = await getFix(fixId, brandId);
  if (!fix) throw new Error('Fix not found');
  if (['shipping', 'staged', 'shipped', 'verified'].includes(fix.status)) {
    throw new Error('This fix is already applied to your site — use Undo/revert instead of ignoring.');
  }
  if (fix.status === 'dismissed') return fix;
  await updateFix(fix.id, { status: 'dismissed', error: null });
  await logFixEvent(fix.id, brandId, userId, 'dismissed', {});
  return (await getFix(fixId, brandId))!;
}

/** Restore a previously dismissed fix back into the normal workflow. */
export async function restoreFix(fixId: string, brandId: string, userId: string | null): Promise<FixRow> {
  const fix = await getFix(fixId, brandId);
  if (!fix) throw new Error('Fix not found');
  if (fix.status !== 'dismissed') return fix;
  // Back to 'detected' so the user can generate/approve it again. A
  // generated draft (if any) is preserved on the row.
  await updateFix(fix.id, { status: 'detected', error: null });
  await logFixEvent(fix.id, brandId, userId, 'restored', {});
  return (await getFix(fixId, brandId))!;
}

/**
 * Restore many dismissed fixes at once ("Restore all" in the Ignored tab).
 * Does a single scoped UPDATE (dismissed → detected) so restoring 100s of
 * ignored fixes is one round-trip, not one request per fix. Pass `ids` to
 * restore a selection; omit for every dismissed fix on the brand. Returns the
 * count restored. Drafts on each row are preserved.
 */
export async function restoreAllDismissed(brandId: string, userId: string | null, ids?: string[]): Promise<number> {
  const restored = await restoreDismissedFixes(brandId, ids);
  if (restored.length > 0) {
    // One brand-level audit entry instead of N — keeps the bulk op fast.
    await logFixEvent(null, brandId, userId, 'restored_bulk', { count: restored.length, ids: restored });
  }
  return restored.length;
}
