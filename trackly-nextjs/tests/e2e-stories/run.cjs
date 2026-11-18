/**
 * User-story e2e suite built from the last six months of bug-fix PRs.
 *
 * Needs a production build running against a seeded local Postgres + Redis:
 *   DATABASE_URL=... node tests/e2e-v3/seed.cjs
 *   npx next build && npx next start -p 3000
 *   node tests/e2e-stories/run.cjs
 *
 * Env: BASE (default http://localhost:3000), ONLY (comma list of story ids or
 * prefixes), SKIP_UI=1, REPORT (path for a Markdown results report),
 * STORIES_MD (path to write the story catalogue). Exits 1 on any failure.
 */
const fs = require('fs');
const { Client } = require('./client.cjs');
const { setup } = require('./setup.cjs');
const api = require('./stories-api.cjs').stories;
const ui = require('./stories-ui.cjs').stories;

const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const pick = (s) => !ONLY.length || ONLY.some(o => s.id === o || s.id.startsWith(o));

function catalogue(all) {
  const areas = [...new Set(all.map(s => s.area))];
  let md = `# User stories from bug-fix PRs (last 6 months)\n\n${all.length} stories. Each one is something a user expects, picked because a recent bug-fix PR touched it and the same class of bug could come back. Every story has an automated check in \`tests/e2e-stories/\`.\n\n`;
  for (const a of areas) {
    md += `## ${a}\n\n| ID | Story | PRs |\n|---|---|---|\n`;
    for (const s of all.filter(x => x.area === a)) md += `| ${s.id} | ${s.title} | ${s.prs.join(' ')} |\n`;
    md += '\n';
  }
  return md;
}

async function main() {
  const all = [...api, ...ui];
  if (process.env.STORIES_MD) fs.writeFileSync(process.env.STORIES_MD, catalogue(all));
  await setup();
  const ctx = {};
  for (const [k, e] of [['owner', 'owner@test.dev'], ['free', 'free@test.dev'], ['trial', 'new@test.dev'], ['stranger', 'stranger@test.dev'], ['viewer', 'viewer@test.dev']]) {
    ctx[k] = new Client(); await ctx[k].login(e);
  }
  const results = [];
  const run = async (s, fn) => {
    const t0 = Date.now();
    try { await fn(); results.push({ s, ok: true, ms: Date.now() - t0 }); process.stdout.write(`  ok   ${s.id} ${s.title}\n`); }
    catch (e) { results.push({ s, ok: false, ms: Date.now() - t0, err: String(e.message || e).split('\n')[0] }); process.stdout.write(`  FAIL ${s.id} ${s.title}\n       ${String(e.message || e).split('\n')[0]}\n`); }
  };
  for (const s of api.filter(pick)) await run(s, () => s.fn(ctx));

  if (!process.env.SKIP_UI) {
    const { chromium } = require('playwright');
    const exe = ['/opt/pw-browsers/chromium'].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    const browser = await chromium.launch(exe ? { executablePath: exe } : {});
    for (const s of ui.filter(pick)) {
      // A distinct client IP per story keeps the per-IP auth limiter out of the way.
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'x-real-ip': `10.200.${ui.indexOf(s)}.1` } });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await run(s, () => Promise.race([
        s.fn({ page, context }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('story timed out')), s.timeout || 120000)),
      ]));
      await context.close();
    }
    await browser.close();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} stories passed`);
  if (process.env.REPORT) {
    let md = `# E2E story run\n\n${results.length - failed.length}/${results.length} passed.\n\n| ID | Result | Story | Detail |\n|---|---|---|---|\n`;
    for (const r of results) md += `| ${r.s.id} | ${r.ok ? 'pass' : 'FAIL'} | ${r.s.title} | ${r.ok ? '' : (r.err || '').replace(/\|/g, '/').slice(0, 220)} |\n`;
    fs.writeFileSync(process.env.REPORT, md);
  }
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
