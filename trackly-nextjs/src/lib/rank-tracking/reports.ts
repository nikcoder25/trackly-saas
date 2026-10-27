/**
 * Rank tracking reports: CSV, CSV (changes), HTML, HTML (graphs), PDF,
 * PDF (graphs). A report row stores what to include; the file is built
 * when it is downloaded, so a saved report never goes stale and nothing
 * needs file storage. Scheduled reports (weekly on Monday, monthly on
 * the 1st) are emailed as a signed download link covering the last week
 * or the last month.
 */
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { pool } from '@/lib/db';
import { enqueueEmail } from '@/lib/email';
import { logger } from '@/lib/logger';
import { uid } from '@/lib/helpers';
import { ensureRankSchema } from './schema';
import { keywordAiStatus, shareOfVoice } from './ai';
import { shortCity } from './queries';
import { urlPath } from './domain';

export const REPORT_FORMATS = ['csv', 'csv_changes', 'html', 'html_graphs', 'pdf', 'pdf_graphs'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];
export const FORMAT_LABEL: Record<ReportFormat, string> = { csv: 'CSV', csv_changes: 'CSV (changes)', html: 'HTML', html_graphs: 'HTML (graphs)', pdf: 'PDF', pdf_graphs: 'PDF (graphs)' };

export interface Branding { agencyName?: string; logoUrl?: string; primaryColor?: string; customDomain?: string }

/** Same-origin URL of the account's logo (see /api/rank-tracking/logo), or '' when none is set. */
export function logoSrc(accountId: string, logoUrl: string | undefined): string {
  if (!logoUrl) return '';
  return `/api/rank-tracking/logo/${encodeURIComponent(accountId)}?v=${crypto.createHash('sha1').update(logoUrl).digest('hex').slice(0, 10)}`;
}

export async function getBranding(accountId: string): Promise<Branding> {
  const r = await pool.query(`SELECT settings FROM users WHERE id = $1`, [accountId]);
  const b = (r.rows[0]?.settings || {}).rankBranding || {};
  return { agencyName: b.agencyName || '', logoUrl: b.logoUrl || '', primaryColor: /^#[0-9a-f]{6}$/i.test(b.primaryColor || '') ? b.primaryColor : '#4f46e5', customDomain: b.customDomain || '' };
}

export interface ReportRow {
  id: string; account_id: string; title: string; format: ReportFormat; website_id: string | null; group_id: string | null;
  starred_only: boolean; include_ai: boolean; use_logo: boolean; start_date: string | Date | null; end_date: string | Date | null;
  schedule: 'weekly' | 'monthly' | null; recipients: string[]; last_sent_at: Date | null; created_at: Date;
}

export interface ReportInput {
  title: string; format: ReportFormat; websiteId: string | null; groupId: string | null; starredOnly: boolean; includeAi: boolean; useLogo: boolean;
  start: string | null; end: string | null; schedule: 'weekly' | 'monthly' | null; recipients: string[];
}

export async function createReport(accountId: string, i: ReportInput): Promise<ReportRow> {
  await ensureRankSchema();
  const r = await pool.query<ReportRow>(
    `INSERT INTO rt_reports (id, account_id, title, format, website_id, group_id, starred_only, include_ai, use_logo, start_date, end_date, schedule, recipients)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [uid(), accountId, i.title.slice(0, 160), i.format, i.websiteId, i.groupId, i.starredOnly, i.includeAi, i.useLogo, i.start, i.end, i.schedule, i.recipients.slice(0, 10)]);
  return r.rows[0];
}

/** Date range a report covers: its own dates, or the last week / month for a scheduled one. */
export function reportRange(r: Pick<ReportRow, 'start_date' | 'end_date' | 'schedule'>, now = new Date()): { start: string; end: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (r.schedule) {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = r.schedule === 'monthly' ? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, end.getUTCDate())) : new Date(end.getTime() - 7 * 86_400_000);
    return { start: iso(start), end: iso(end) };
  }
  const end = r.end_date ? new Date(r.end_date) : now;
  const start = r.start_date ? new Date(r.start_date) : new Date(end.getTime() - 28 * 86_400_000);
  return { start: iso(start), end: iso(end) };
}

interface ReportKw {
  id: string; keyword: string; domain: string; location_name: string; device: string; group_name: string | null; starred: boolean; depth: number;
  checks: { at: string; rank: number | null; url: string | null }[];
}

async function reportData(r: ReportRow, range: { start: string; end: string }) {
  const where: string[] = ['w.account_id = $1'];
  const params: unknown[] = [r.account_id];
  if (r.website_id) { params.push(r.website_id); where.push(`k.website_id = $${params.length}`); }
  if (r.group_id) { params.push(r.group_id); where.push(`k.group_id = $${params.length}`); }
  if (r.starred_only) where.push('k.starred');
  params.push(range.start, range.end);
  const q = await pool.query(
    `SELECT k.id, k.keyword, w.domain, k.location_name, k.device, g.name AS group_name, k.starred, k.depth,
            COALESCE(json_agg(json_build_object('at', c.checked_at, 'rank', c.rank, 'url', c.url) ORDER BY c.checked_at) FILTER (WHERE c.id IS NOT NULL), '[]') AS checks
       FROM rt_keywords k JOIN rt_websites w ON w.id = k.website_id LEFT JOIN rt_groups g ON g.id = k.group_id
       LEFT JOIN rt_checks c ON c.keyword_id = k.id AND c.checked_at >= $${params.length - 1}::date AND c.checked_at < $${params.length}::date + 1
      WHERE ${where.join(' AND ')}
      GROUP BY k.id, w.domain, g.name ORDER BY w.domain, k.keyword`, params);
  const kws = q.rows as ReportKw[];
  const domains = [...new Set(kws.map((k) => k.domain))];
  const ai = new Map<string, Map<string, string | null>>();
  let sov = new Map<string, number>();
  if (r.include_ai) {
    sov = await shareOfVoice(r.account_id, domains);
    for (const d of domains) ai.set(d, await keywordAiStatus(r.account_id, d, kws.filter((k) => k.domain === d).map((k) => k.keyword)));
  }
  return { kws, domains, ai, sov };
}

const first = (k: ReportKw) => k.checks[0];
const last = (k: ReportKw) => k.checks[k.checks.length - 1];
const posOf = (r: number | null | undefined, depth: number) => (r == null ? depth + 1 : r);
const change = (k: ReportKw) => (k.checks.length > 1 ? posOf(first(k).rank, k.depth) - posOf(last(k).rank, k.depth) : 0);
const rankText = (r: number | null | undefined) => (r == null ? '-' : String(r));
const AI_LABEL: Record<string, string> = { recommended: 'Recommended', mentioned: 'Mentioned', not_mentioned: 'Not mentioned' };
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function sparkPath(k: ReportKw, w: number, h: number): string {
  const pts = k.checks;
  if (pts.length < 2) return '';
  const max = k.depth + 1;
  return pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * (w - 4) + 2).toFixed(1)} ${(((posOf(p.rank, k.depth) - 1) / (max - 1)) * (h - 4) + 2).toFixed(1)}`).join(' ');
}

export interface BuiltReport { body: Buffer | string; contentType: string; filename: string }

export async function buildReport(r: ReportRow, now = new Date()): Promise<BuiltReport> {
  await ensureRankSchema();
  const range = reportRange(r, now);
  const data = await reportData(r, range);
  const brand = await getBranding(r.account_id);
  const slug = r.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'rankings';
  const fmt = r.format;

  if (fmt === 'csv' || fmt === 'csv_changes') {
    const dates = [...new Set(data.kws.flatMap((k) => k.checks.map((c) => String(c.at).slice(0, 10))))].sort();
    const rows: unknown[][] = fmt === 'csv'
      ? [['Website', 'Keyword', 'Location', 'Device', 'Group', 'Starred', 'Rank', 'Best', 'Ranking page', ...(r.include_ai ? ['In AI answers'] : []), ...dates],
        ...data.kws.map((k) => {
          const byDay = new Map(k.checks.map((c) => [String(c.at).slice(0, 10), c.rank]));
          const ranked = k.checks.map((c) => c.rank).filter((x): x is number => x != null);
          return [k.domain, k.keyword, k.location_name, k.device, k.group_name || '', k.starred ? 'yes' : '', rankText(last(k)?.rank), ranked.length ? Math.min(...ranked) : '-', last(k)?.url || '',
            ...(r.include_ai ? [AI_LABEL[data.ai.get(k.domain)?.get(k.keyword) || ''] || ''] : []), ...dates.map((d) => (byDay.has(d) ? rankText(byDay.get(d)) : ''))];
        })]
      : [['Website', 'Keyword', 'Location', 'Device', `Rank ${range.start}`, `Rank ${range.end}`, 'Change'],
        ...data.kws.filter((k) => k.checks.length).map((k) => [k.domain, k.keyword, k.location_name, k.device, rankText(first(k)?.rank), rankText(last(k)?.rank), change(k)])];
    return { body: rows.map((x) => x.map(csvCell).join(',')).join('\n') + '\n', contentType: 'text/csv; charset=utf-8', filename: `${slug}.csv` };
  }

  if (fmt === 'html' || fmt === 'html_graphs') {
    const graphs = fmt === 'html_graphs';
    const color = brand.primaryColor || '#4f46e5';
    const head = r.use_logo && brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.agencyName || 'Logo')}" style="max-height:40px">` : `<strong>${esc(r.use_logo && brand.agencyName ? brand.agencyName : 'Livesov')}</strong>`;
    const sections = data.domains.map((d) => {
      const list = data.kws.filter((k) => k.domain === d);
      return `<h2>${esc(d)}${r.include_ai && data.sov.has(d) ? ` <span class="sub">AI share of voice ${data.sov.get(d)}%</span>` : ''}</h2>
      <table><thead><tr><th>Keyword</th><th>City</th><th>Rank</th><th>Change</th><th>Best</th>${graphs ? '<th>Trend</th>' : ''}<th>Ranking page</th>${r.include_ai ? '<th>In AI answers</th>' : ''}</tr></thead><tbody>
      ${list.map((k) => { const ch = change(k); const ranked = k.checks.map((c) => c.rank).filter((x): x is number => x != null);
        return `<tr><td>${esc(k.keyword)}</td><td>${esc(shortCity(k.location_name))}</td><td class="n">${rankText(last(k)?.rank)}</td>
        <td class="n ${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}">${ch > 0 ? '▲ ' + ch : ch < 0 ? '▼ ' + -ch : '0'}</td><td class="n">${ranked.length ? Math.min(...ranked) : '-'}</td>
        ${graphs ? `<td><svg width="110" height="28" viewBox="0 0 110 28" role="img" aria-label="Rank trend"><path d="${sparkPath(k, 110, 28)}" fill="none" stroke="${color}" stroke-width="2"/></svg></td>` : ''}
        <td>${esc(urlPath(last(k)?.url))}</td>${r.include_ai ? `<td>${esc(AI_LABEL[data.ai.get(d)?.get(k.keyword) || ''] || 'Not tracked')}</td>` : ''}</tr>`; }).join('')}
      </tbody></table>`;
    }).join('');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(r.title)}</title>
<style>body{font-family:Inter,system-ui,sans-serif;color:#0f172a;background:#f8fafc;margin:0;padding:32px 16px}.wrap{max-width:1000px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:24px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
.sub{font-size:13px;color:#475569;font-weight:500}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;font-size:14px}
th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:#475569;padding:10px 12px;border-bottom:1px solid #e2e8f0}td{padding:10px 12px;border-top:1px solid #f1f5f9}
.n{font-weight:600}.up{color:#15803d}.down{color:#b91c1c}.top{height:4px;background:${color};border-radius:4px;margin-bottom:24px}@media(max-width:700px){table{display:block;overflow-x:auto}}</style></head>
<body><div class="wrap"><div class="top"></div><header><div><h1>${esc(r.title)}</h1><div class="sub">Google rankings, ${esc(range.start)} to ${esc(range.end)}</div></div>${head}</header>${sections || '<p>No keywords in this report.</p>'}</div></body></html>`;
    return { body: html, contentType: 'text/html; charset=utf-8', filename: `${slug}.html` };
  }

  return { body: await buildPdf(r, data, range, brand, fmt === 'pdf_graphs'), contentType: 'application/pdf', filename: `${slug}.pdf` };
}

async function buildPdf(r: ReportRow, data: Awaited<ReturnType<typeof reportData>>, range: { start: string; end: string }, brand: Branding, graphs: boolean): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  const color = brand.primaryColor || '#4f46e5';
  const M = 40;
  const W = doc.page.width - M * 2;
  doc.rect(0, 0, doc.page.width, 6).fill(color);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(20).text(r.title, M, 30, { width: W - 140 });
  doc.font('Helvetica').fontSize(10).fillColor('#475569').text(`Google rankings, ${range.start} to ${range.end}`, M, doc.y + 2);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(color).text(r.use_logo && brand.agencyName ? brand.agencyName : 'Livesov', M + W - 140, 34, { width: 140, align: 'right' });
  doc.y = 90;
  const cols = graphs ? [190, 70, 45, 50, 40, 120] : [230, 80, 50, 55, 45, 55];
  const heads = graphs ? ['Keyword', 'City', 'Rank', 'Change', 'Best', 'Trend'] : ['Keyword', 'City', 'Rank', 'Change', 'Best', r.include_ai ? 'AI' : ''];
  for (const d of data.domains) {
    if (doc.y > doc.page.height - 120) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text(d, M, doc.y + 10);
    if (r.include_ai && data.sov.has(d)) doc.font('Helvetica').fontSize(9).fillColor('#475569').text(`AI share of voice: ${data.sov.get(d)}%`);
    doc.moveDown(0.4);
    let x = M;
    const hy = doc.y;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569');
    heads.forEach((h, i) => { doc.text(h.toUpperCase(), x, hy, { width: cols[i] }); x += cols[i]; });
    doc.y = hy + 14;
    for (const k of data.kws.filter((kk) => kk.domain === d)) {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      const ch = change(k);
      const ranked = k.checks.map((c) => c.rank).filter((v): v is number => v != null);
      const cells = [k.keyword, shortCity(k.location_name), rankText(last(k)?.rank), ch > 0 ? `+${ch}` : String(ch), ranked.length ? String(Math.min(...ranked)) : '-',
        graphs ? '' : r.include_ai ? (AI_LABEL[data.ai.get(d)?.get(k.keyword) || ''] || '-') : ''];
      doc.moveTo(M, y - 3).lineTo(M + W, y - 3).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
      x = M;
      cells.forEach((c, i) => {
        doc.font(i === 2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(i === 3 ? (ch > 0 ? '#15803d' : ch < 0 ? '#b91c1c' : '#475569') : '#0f172a')
          .text(c, x, y, { width: cols[i] - 6, height: 12, ellipsis: true });
        x += cols[i];
      });
      if (graphs && k.checks.length > 1) {
        const gx = M + cols.slice(0, 5).reduce((s, v) => s + v, 0);
        const max = k.depth + 1;
        k.checks.forEach((c, i) => {
          const px = gx + (i / (k.checks.length - 1)) * (cols[5] - 10);
          const py = y + ((posOf(c.rank, k.depth) - 1) / (max - 1)) * 10;
          if (i === 0) doc.moveTo(px, py); else doc.lineTo(px, py);
        });
        doc.lineWidth(1.2).strokeColor(color).stroke();
      }
      doc.y = y + 16;
    }
  }
  if (!data.kws.length) doc.font('Helvetica').fontSize(11).fillColor('#475569').text('No keywords in this report.', M, doc.y + 10);
  doc.end();
  return done;
}

function linkSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is required to sign report links');
  return `rank-report:${s}`;
}

/** Signed download link that works without a login (for emailed reports). */
export function signReportLink(reportId: string, days = 30): string {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const sig = crypto.createHmac('sha256', linkSecret()).update(`${reportId}.${exp}`).digest('base64url');
  return `/api/rank-tracking/reports/${encodeURIComponent(reportId)}/download?exp=${exp}&sig=${sig}`;
}

export function verifyReportLink(reportId: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  let want: string;
  try { want = crypto.createHmac('sha256', linkSecret()).update(`${reportId}.${exp}`).digest('base64url'); } catch { return false; }
  return want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

/** Scheduled reports due now (weekly: Mondays, monthly: the 1st), each sent once per period. */
export async function sendDueReports(now = new Date()): Promise<number> {
  await ensureRankSchema();
  const monday = now.getUTCDay() === 1;
  const first = now.getUTCDate() === 1;
  if (!monday && !first) return 0;
  const r = await pool.query<ReportRow>(
    `SELECT * FROM rt_reports WHERE schedule IS NOT NULL AND cardinality(recipients) > 0
       AND ((schedule = 'weekly' AND $1) OR (schedule = 'monthly' AND $2))
       AND (last_sent_at IS NULL OR last_sent_at < NOW() - INTERVAL '20 hours')`, [monday, first]);
  const base = (process.env.APP_URL || 'https://livesov.com').replace(/\/+$/, '');
  let sent = 0;
  for (const rep of r.rows) {
    try {
      const link = base + signReportLink(rep.id);
      const range = reportRange(rep, now);
      const html = `<p>Your ${esc(rep.schedule)} ranking report <strong>${esc(rep.title)}</strong> (${range.start} to ${range.end}) is ready.</p><p><a href="${esc(link)}">Download the report (${esc(FORMAT_LABEL[rep.format])})</a></p>`;
      for (const to of rep.recipients) {
        await enqueueEmail({ to, subject: rep.title.slice(0, 160), html, text: `Download: ${link}`, templateKey: 'rank_report', idempotencyKey: `rank_report:${rep.id}:${to}:${range.end}` });
      }
      await pool.query(`UPDATE rt_reports SET last_sent_at = NOW() WHERE id = $1`, [rep.id]);
      await pool.query(`INSERT INTO rt_alert_log (account_id, kind, message) VALUES ($1, 'report', $2)`, [rep.account_id, `Report "${rep.title}" sent to ${rep.recipients.length} recipient${rep.recipients.length === 1 ? '' : 's'}`]);
      sent++;
    } catch (e) {
      logger.warn('rank.report_send_failed', { reportId: rep.id, err: (e as Error).message });
    }
  }
  return sent;
}
