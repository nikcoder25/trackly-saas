/**
 * Scheduled-report runner — generates the standard AI Visibility PDF for every
 * brand whose auto-generate schedule matches the given cadence and saves it to
 * report history. Invoked from the existing /api/cron/reports cron (which fires
 * weekly on Monday and monthly on the 1st), so no new schedule/infra is needed.
 */
import { pool } from './db';
import { logger } from './logger';
import { getEffectivePlan } from './constants';
import { generateReport } from './pdf-report';
import { ensureReportSchema, recordReport, markScheduleRun } from './report-builder';

const PRO_PLANS = new Set(['pro', 'agency', 'enterprise', 'owner']);
// Guard against a manual re-trigger re-generating within the same period.
const MIN_GAP_MS: Record<'weekly' | 'monthly', number> = {
  weekly: 6 * 24 * 60 * 60 * 1000,
  monthly: 27 * 24 * 60 * 60 * 1000,
};

function streamToBuffer(doc: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

export async function runDueReportSchedules(frequency: 'weekly' | 'monthly'): Promise<{ generated: number; skipped: number; failed: number }> {
  await ensureReportSchema();
  let generated = 0, skipped = 0, failed = 0;

  let rows: Array<Record<string, unknown>> = [];
  try {
    const res = await pool.query(
      `SELECT s.brand_id, s.last_run_at, b.user_id, b.data, u.plan, u.trial_ends_at
         FROM report_schedules s
         JOIN brands b ON b.id = s.brand_id
         JOIN users  u ON u.id = b.user_id
        WHERE s.frequency = $1`,
      [frequency]
    );
    rows = res.rows;
  } catch (e) {
    logger.error('cron.reports.schedule_query_failed', { error: (e as Error).message, frequency });
    return { generated, skipped, failed };
  }

  for (const row of rows) {
    try {
      // Plan gate — only Pro+ brands auto-generate (matches the manual download).
      const plan = getEffectivePlan(row.plan as string, row.trial_ends_at as string | undefined);
      if (!PRO_PLANS.has(plan)) { skipped++; continue; }

      // Skip if we already generated within this period (manual re-trigger guard).
      if (row.last_run_at) {
        const since = Date.now() - new Date(row.last_run_at as string).getTime();
        if (since < MIN_GAP_MS[frequency]) { skipped++; continue; }
      }

      const data = (row.data || {}) as { name?: string; website?: string; runs?: Array<{ sov?: number }> };
      const runs = Array.isArray(data.runs) ? data.runs : [];
      if (!runs.length) { skipped++; continue; }

      const brand = { id: row.brand_id as string, name: data.name, website: data.website, runs };
      const buffer = await streamToBuffer(generateReport(brand));

      const safeName = String(data.name || 'report').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `${safeName}_AI_Visibility_Report_${dateStr}.pdf`;
      const lastSov = Math.round(runs[runs.length - 1].sov || 0);

      await recordReport(row.brand_id as string, row.user_id as string, 'standard',
        `${data.name || 'Brand'} — AI Visibility Report`, filename, buffer, { sov: lastSov, auto: true });
      await markScheduleRun(row.brand_id as string);
      generated++;
    } catch (e) {
      failed++;
      logger.error('cron.reports.schedule_generate_failed', { error: (e as Error).message, brand_id: row.brand_id });
    }
  }

  logger.info('cron.reports.schedules', { frequency, generated, skipped, failed });
  return { generated, skipped, failed };
}
