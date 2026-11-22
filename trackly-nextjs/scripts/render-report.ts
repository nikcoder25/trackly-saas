/**
 * Renders the AI Visibility PDF for the bundled fixtures (or a brand JSON file).
 *
 *   npx tsx scripts/render-report.ts [outDir] [brand.json]
 *
 * Writes <name>.html and <name>.pdf. Set CHROME_EXECUTABLE_PATH on macOS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderReport, generateReport, reportFilename } from '../src/lib/pdf-report';
import { nestadu, lowSov, fewQuestions } from './report-fixtures/fixtures';

async function main() {
  const out = path.resolve(process.argv[2] || 'report-out');
  fs.mkdirSync(out, { recursive: true });
  const brands = process.argv[3] ? [JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))] : [nestadu(), lowSov(), fewQuestions()];
  for (const b of brands) {
    const base = reportFilename(b.name).replace(/\.pdf$/, '');
    const t = Date.now();
    fs.writeFileSync(path.join(out, `${base}.html`), renderReport(b));
    const pdf = await generateReport(b);
    fs.writeFileSync(path.join(out, `${base}.pdf`), pdf);
    console.log(`${base}.pdf  ${(pdf.length / 1024).toFixed(0)} KB  ${Date.now() - t} ms`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
