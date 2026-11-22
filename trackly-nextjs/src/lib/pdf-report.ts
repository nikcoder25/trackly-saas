/**
 * AI Visibility Report (PDF).
 * NOTE: output carries Livesov branding. There is no white-label /
 * customer-branding capability; do not advertise one.
 *
 * Pipeline: stored brand -> buildReportData (same summaries as the dashboard
 * and MCP tools) -> HTML template (src/reports/aiVisibilityReport.html) ->
 * headless Chrome -> PDF. Design source: design-reference/report-reference.html.
 */
import { buildReportData, type ReportOptions } from './report/ai-visibility-data';
import { renderReportHtml } from './report/ai-visibility-render';
import { htmlToPdf } from './report/html-to-pdf';

export const BRANDING = { companyName: 'Livesov', tagline: 'AI VISIBILITY REPORT' };

/* eslint-disable @typescript-eslint/no-explicit-any */
export function renderReport(brand: Record<string, any>, opts: ReportOptions = {}): string {
  return renderReportHtml(buildReportData(brand, opts));
}

export async function generateReport(brand: Record<string, any>, opts: ReportOptions = {}): Promise<Buffer> {
  return htmlToPdf(renderReport(brand, opts));
}

/** `<Brand>_AI_Visibility_Report_<YYYY-MM-DD>.pdf` */
export function reportFilename(name: unknown, date = new Date()): string {
  const safeName = String(name || 'report').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
  return `${safeName}_AI_Visibility_Report_${date.toISOString().split('T')[0]}.pdf`;
}
