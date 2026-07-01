/**
 * Fix Engine - automation (scheduled scans + auto-pilot).
 *
 * Per-brand settings stored in `fix_automation`:
 *   - scheduled scans: re-scan on a cadence (daily/weekly) via cron.
 *   - auto-pilot: after a scheduled scan, auto-generate detected fixes,
 *     and optionally auto-ship the SAFE deterministic ones (cost 0, no
 *     LLM content — robots-ai-access, noindex-removal, canonical-fix).
 *
 * Auto-ship is intentionally limited to deterministic fixes so the engine
 * never publishes LLM-written content to a live site without human review.
 */

import { pool } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createBatch, listFixes } from './schema';
import { runScan, generateFix, approveFix, shipFix } from './engine';
import { generateCost, listModules } from './registry';
import { getConnection } from './connections';
import { notifyBrand } from './notify';

export type ScanFrequency = 'daily' | 'weekly';

export interface Automation {
  brandId: string;
  scanEnabled: boolean;
  scanFrequency: ScanFrequency;
  scanModules: string[];          // empty = all available
  autopilotGenerate: boolean;     // auto-generate detected fixes
  autopilotShipDeterministic: boolean; // auto-ship cost-0 fixes
  notifyOnScan: boolean;          // send a digest to the brand's webhook/tracker after each scheduled scan
  lastScanAt: string | null;
  nextScanAt: string | null;
}

let schemaEnsured = false;
async function ensureAutomationSchema(): Promise<void> {
  if (schemaEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fix_automation (
      brand_id                    TEXT PRIMARY KEY,
      scan_enabled                BOOLEAN NOT NULL DEFAULT FALSE,
      scan_frequency              TEXT NOT NULL DEFAULT 'weekly'
                                   CHECK (scan_frequency IN ('daily','weekly')),
      scan_modules                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      autopilot_generate          BOOLEAN NOT NULL DEFAULT FALSE,
      autopilot_ship_deterministic BOOLEAN NOT NULL DEFAULT FALSE,
      last_scan_at                TIMESTAMPTZ,
      next_scan_at                TIMESTAMPTZ,
      updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fix_automation_brand_fk
        FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_fix_automation_due
      ON fix_automation (next_scan_at) WHERE scan_enabled = TRUE
  `);
  await pool.query(`ALTER TABLE fix_automation ADD COLUMN IF NOT EXISTS notify_on_scan BOOLEAN NOT NULL DEFAULT FALSE`);
  schemaEnsured = true;
}

function mapRow(r: Record<string, unknown>): Automation {
  return {
    brandId: String(r.brand_id),
    scanEnabled: !!r.scan_enabled,
    scanFrequency: (r.scan_frequency as ScanFrequency) || 'weekly',
    scanModules: (r.scan_modules as string[]) ?? [],
    autopilotGenerate: !!r.autopilot_generate,
    autopilotShipDeterministic: !!r.autopilot_ship_deterministic,
    notifyOnScan: !!r.notify_on_scan,
    lastScanAt: (r.last_scan_at as string | null) ?? null,
    nextScanAt: (r.next_scan_at as string | null) ?? null,
  };
}

const DEFAULT_AUTOMATION = (brandId: string): Automation => ({
  brandId, scanEnabled: false, scanFrequency: 'weekly', scanModules: [],
  autopilotGenerate: false, autopilotShipDeterministic: false, notifyOnScan: false, lastScanAt: null, nextScanAt: null,
});

export async function getAutomation(brandId: string): Promise<Automation> {
  await ensureAutomationSchema();
  const res = await pool.query(`SELECT * FROM fix_automation WHERE brand_id = $1`, [brandId]);
  return res.rows[0] ? mapRow(res.rows[0]) : DEFAULT_AUTOMATION(brandId);
}

export interface AutomationPatch {
  scanEnabled?: boolean;
  scanFrequency?: ScanFrequency;
  scanModules?: string[];
  autopilotGenerate?: boolean;
  autopilotShipDeterministic?: boolean;
  notifyOnScan?: boolean;
}

export async function setAutomation(brandId: string, patch: AutomationPatch): Promise<Automation> {
  await ensureAutomationSchema();
  const cur = await getAutomation(brandId);
  const next: Automation = { ...cur, ...patch };
  // (Re)compute next_scan_at from the frequency whenever enabled.
  const interval = next.scanFrequency === 'daily' ? '1 day' : '7 days';
  await pool.query(
    `INSERT INTO fix_automation
       (brand_id, scan_enabled, scan_frequency, scan_modules, autopilot_generate, autopilot_ship_deterministic, notify_on_scan, next_scan_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$8, CASE WHEN $2 THEN NOW() + ($7)::interval ELSE NULL END, NOW())
     ON CONFLICT (brand_id) DO UPDATE
       SET scan_enabled = EXCLUDED.scan_enabled,
           scan_frequency = EXCLUDED.scan_frequency,
           scan_modules = EXCLUDED.scan_modules,
           autopilot_generate = EXCLUDED.autopilot_generate,
           autopilot_ship_deterministic = EXCLUDED.autopilot_ship_deterministic,
           notify_on_scan = EXCLUDED.notify_on_scan,
           next_scan_at = CASE WHEN EXCLUDED.scan_enabled THEN NOW() + ($7)::interval ELSE NULL END,
           updated_at = NOW()`,
    [brandId, next.scanEnabled, next.scanFrequency, next.scanModules, next.autopilotGenerate, next.autopilotShipDeterministic, interval, next.notifyOnScan],
  );
  return getAutomation(brandId);
}

/** Brands whose scheduled scan is due. */
export async function findDueScans(limit = 10): Promise<string[]> {
  await ensureAutomationSchema();
  const res = await pool.query(
    `SELECT brand_id FROM fix_automation
      WHERE scan_enabled = TRUE AND next_scan_at IS NOT NULL AND next_scan_at <= NOW()
      ORDER BY next_scan_at ASC LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => String(r.brand_id));
}

async function bumpNextScan(brandId: string, frequency: ScanFrequency): Promise<void> {
  const interval = frequency === 'daily' ? '1 day' : '7 days';
  await pool.query(
    `UPDATE fix_automation
        SET last_scan_at = NOW(), next_scan_at = NOW() + ($2)::interval, updated_at = NOW()
      WHERE brand_id = $1`,
    [brandId, interval],
  );
}

/**
 * Run one brand's scheduled scan to completion, then apply auto-pilot.
 * Always reschedules next_scan_at, even on partial failure, so a stuck
 * brand doesn't wedge the queue.
 */
export async function processScheduledScan(brandId: string): Promise<{ scanned: boolean; generated: number; shipped: number }> {
  const auto = await getAutomation(brandId);
  if (!auto.scanEnabled) return { scanned: false, generated: 0, shipped: 0 };

  const modules = auto.scanModules.length ? auto.scanModules : listModules().map((m) => m.key);
  let generated = 0, shipped = 0;
  try {
    const ownerRes = await pool.query(`SELECT user_id FROM brands WHERE id = $1 LIMIT 1`, [brandId]);
    const ownerId = String(ownerRes.rows[0]?.user_id || '');
    if (!ownerId) return { scanned: false, generated: 0, shipped: 0 };

    const batchId = await createBatch(ownerId, brandId, modules);
    await runScan(batchId, { moduleKeys: modules });

    if (auto.autopilotGenerate || auto.autopilotShipDeterministic) {
      const result = await applyAutopilot(brandId, auto);
      generated = result.generated; shipped = result.shipped;
    }

    // Opt-in digest: summarise the scan to the brand's tracker/webhook so the
    // customer gets progress without logging in. Best-effort.
    if (auto.notifyOnScan) {
      try {
        const all = await listFixes(brandId);
        const live = all.filter((f) => f.status === 'shipped' || f.status === 'verified').length;
        const review = all.filter((f) => f.status === 'generated' || f.status === 'preview_ready').length;
        const detected = all.filter((f) => f.status === 'detected').length;
        await notifyBrand(brandId, {
          title: 'Fix Engine — scan complete',
          description: [
            `${all.length} fixes tracked`,
            `${detected} newly detected · ${review} in review · ${live} live`,
            shipped ? `${shipped} safe fix(es) auto-applied this run` : null,
          ].filter(Boolean).join('\n'),
        });
      } catch (e) {
        logger.warn('fix_engine.scan_digest_failed', { brandId, err: (e as Error).message });
      }
    }
  } catch (e) {
    logger.error('fix_engine.scheduled_scan_failed', { brandId, err: (e as Error).message });
  } finally {
    await bumpNextScan(brandId, auto.scanFrequency);
  }
  return { scanned: true, generated, shipped };
}

/**
 * Auto-pilot: generate detected fixes, and auto-ship ONLY deterministic
 * (cost-0, no-LLM-content) fixes when a ship channel is connected. Each
 * step is best-effort and isolated so one failure doesn't stop the rest.
 */
export async function applyAutopilot(brandId: string, auto: Automation): Promise<{ generated: number; shipped: number }> {
  let generated = 0, shipped = 0;
  const canShip = await brandCanShip(brandId);

  // 1) Generate detected fixes (respects credits inside generateFix).
  if (auto.autopilotGenerate) {
    const detected = await listFixes(brandId, { status: 'detected' });
    for (const f of detected) {
      try { await generateFix(f.id, brandId); generated++; }
      catch (e) { logger.warn('fix_engine.autopilot_generate_skip', { fixId: f.id, err: (e as Error).message }); }
    }
  }

  // 2) Auto-ship deterministic fixes only (never LLM-written content).
  if (auto.autopilotShipDeterministic && canShip) {
    const generatedFixes = await listFixes(brandId, { status: 'generated' });
    for (const f of generatedFixes) {
      if (generateCost(f.moduleKey) !== 0) continue; // deterministic only
      try {
        await approveFix(f.id, brandId, null);
        const after = await shipFix(f.id, brandId, null);
        if (after.status === 'shipped') shipped++;
      } catch (e) { logger.warn('fix_engine.autopilot_ship_skip', { fixId: f.id, err: (e as Error).message }); }
    }
  }
  return { generated, shipped };
}

async function brandCanShip(brandId: string): Promise<boolean> {
  const cms = await getConnection(brandId, 'cms');
  if (cms && cms.status === 'active') return true;
  const conn = await getConnection(brandId, 'connector');
  return !!conn && conn.status === 'active';
}
