/**
 * Pre-launch accuracy check for rank tracking.
 *
 * Runs real checks (same code path as production: provider chain, early
 * stop, domain matching) for a list of keywords and writes a CSV to compare
 * by hand with a Google search from each city.
 *
 *   DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... [SERPER_API_KEY=...] \
 *     npx tsx scripts/rank-accuracy-check.ts keywords.csv > results.csv
 *
 * keywords.csv columns: keyword,domain,location[,device]
 * location is DataForSEO's name, e.g. "Austin,Texas,United States".
 * Costs about $0.0006-0.002 per results page; 100 keywords is well under $1.
 */
import fs from 'node:fs';
import { runCheck } from '../src/lib/rank-tracking/checker';
import { parseCsv } from '../src/lib/rank-tracking/import';

async function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: tsx scripts/rank-accuracy-check.ts keywords.csv'); process.exit(1); }
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n);
  const out: string[] = ['keyword,domain,location,device,rank,url,pages,provider,cost_usd,google_link,manual_rank'];
  let total = 0;
  for (const r of rows.slice(1)) {
    const keyword = r[col('keyword')]?.trim();
    const domain = r[col('domain')]?.trim();
    const location = r[col('location')]?.trim() || 'United States';
    const device = col('device') >= 0 && /mob/i.test(r[col('device')] || '') ? 'mobile' : 'desktop';
    if (!keyword || !domain) continue;
    try {
      const o = await runCheck({ keyword, domain, locationCode: null, locationName: location, device, language: 'en', depth: 30 });
      total += o.cost;
      const link = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&near=${encodeURIComponent(location.split(',')[0])}`;
      out.push([keyword, domain, location, device, o.rank ?? 'not in top 30', o.url ?? '', o.pagesFetched, o.provider, o.cost.toFixed(4), link, '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
      console.error(`${keyword}: ${o.rank ?? '-'} (${o.pagesFetched} pages)`);
    } catch (e) {
      out.push(`"${keyword}","${domain}","${location}","${device}","error: ${(e as Error).message.replace(/"/g, "'")}",,,,,,`);
    }
  }
  process.stdout.write(out.join('\n') + '\n');
  console.error(`Total cost: $${total.toFixed(4)}`);
}

main();
