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
  claimFixTransition,
  logFixEvent,
} from './schema';
import type { DetectedIssue, FixBrand, FixContext, FixRow } from './types';

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

export async function generateFix(fixId: string, brandId: string): Promise<FixRow> {
  const fix = await getFix(fixId, brandId);
  if (!fix) throw new Error('Fix not found');
  const mod = getModule(fix.moduleKey);
  if (!mod) throw new Error(`Unknown module: ${fix.moduleKey}`);
  // Allow (re)generate from detected, a prior draft, or a failed attempt.
  if (!['detected', 'generated', 'failed'].includes(fix.status)) {
    throw new Error(`Cannot generate a fix in status '${fix.status}'`);
  }
  if (!(await claimFixTransition(fix.id, fix.status, 'generating'))) {
    return (await getFix(fixId, brandId))!; // lost the race
  }

  const ctx = await buildContext(brandId);
  if (!ctx) {
    await updateFix(fix.id, { status: 'failed', error: 'Brand not found' });
    throw new Error('Brand not found');
  }

  const plan = await getUserEffectivePlan(ctx.brand.userId);
  const cost = generateCost(mod.key);
  const reservation = await reserveCredits(ctx.brand.userId, plan, cost, 'manual');
  if (!reservation.ok) {
    // Roll the status back so the user can retry once they have credits.
    await updateFix(fix.id, { status: 'detected', error: reservation.message });
    throw Object.assign(new Error(reservation.message), {
      code: reservation.code, paymentRequired: true,
    });
  }

  try {
    const issue = issueFromRow(fix);
    const draft = await mod.generate(issue, ctx);
    await updateFix(fix.id, { status: 'generated', generated: draft.generated, error: null });
    await logFixEvent(fix.id, brandId, ctx.brand.userId, 'generated', { module: mod.key, cost });
    return (await getFix(fixId, brandId))!;
  } catch (e) {
    await refundCredits(ctx.brand.userId, cost, 'manual');
    await updateFix(fix.id, { status: 'failed', error: (e as Error).message });
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

  try {
    const issue = issueFromRow(fix);
    const result = await mod.ship(issue, { generated: fix.generated }, ctx);
    if (result.ok) {
      await updateFix(fix.id, {
        status: 'shipped',
        shipResult: result.detail,
        afterSnapshot: result.after ?? null,
        error: null,
      });
      await logFixEvent(fix.id, brandId, userId, 'shipped', { channel: mod.channel, detail: result.detail });
    } else {
      await updateFix(fix.id, { status: 'failed', shipResult: result.detail, error: result.error ?? 'Ship failed' });
      await logFixEvent(fix.id, brandId, userId, 'ship.failed', { error: result.error, detail: result.detail });
    }
    return (await getFix(fixId, brandId))!;
  } catch (e) {
    await updateFix(fix.id, { status: 'failed', error: (e as Error).message });
    await logFixEvent(fix.id, brandId, userId, 'ship.failed', { error: (e as Error).message });
    throw e;
  }
}

// ── recheck ──────────────────────────────────────────────────────

export async function recheckFix(fixId: string, brandId: string, userId: string | null): Promise<FixRow> {
  const fix = await getFix(fixId, brandId);
  if (!fix) throw new Error('Fix not found');
  const mod = getModule(fix.moduleKey);
  if (!mod) throw new Error(`Unknown module: ${fix.moduleKey}`);
  if (!fix.generated) throw new Error('Fix has no generated content to recheck');
  if (!['shipped', 'verified'].includes(fix.status)) {
    throw new Error(`Cannot recheck a fix in status '${fix.status}'`);
  }

  const ctx = await buildContext(brandId);
  if (!ctx) throw new Error('Brand not found');

  const issue = issueFromRow(fix);
  const verdict = await mod.recheck(issue, { generated: fix.generated }, ctx);
  await updateFix(fix.id, {
    status: verdict.verified ? 'verified' : 'shipped',
    scoreAfter: verdict.scoreAfter ?? null,
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
  if (!mod.revert) throw new Error('This fix type cannot be auto-reverted — undo it manually on your site.');
  if (!['shipped', 'verified'].includes(fix.status)) {
    throw new Error(`Only a shipped fix can be reverted (status: ${fix.status})`);
  }
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
