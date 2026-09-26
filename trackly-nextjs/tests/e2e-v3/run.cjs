/**
 * Dashboard end-to-end check for the classic UI and the v3 design.
 *
 * Needs a production build running against a seeded database:
 *   node tests/e2e-v3/seed.cjs
 *   npx next build && npx next start -p 3000
 *   NODE_PATH=$(npm root -g) UI=v3 node tests/e2e-v3/run.cjs
 *   NODE_PATH=$(npm root -g) UI=classic node tests/e2e-v3/run.cjs
 *
 * Env: UI (v3 | classic, default v3), BASE (default http://localhost:3000),
 * WIDTHS (default 375,390,768,1024,1440), ROUTES (comma list), SHOTS (dir to
 * write one desktop + one phone screenshot per route), SKIP_ACTIONS=1.
 *
 * Per route and width it asserts the page has no horizontal overflow. Per
 * width it checks the drawer, the phone bottom bar (v3) and that search
 * opens. Then it clicks through the main actions on each page and asserts the
 * matching API call fires. Exits 1 on any failure.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const UI = process.env.UI === 'classic' ? 'classic' : 'v3';
const BASE = process.env.BASE || 'http://localhost:3000';
const WIDTHS = (process.env.WIDTHS || '375,390,768,1024,1440').split(',').map(Number);
const SHOTS = process.env.SHOTS || '';
const ROUTES = (process.env.ROUTES || [
  '/dashboard', '/dashboard/mentions', '/dashboard/proof', '/dashboard/results', '/dashboard/query-tracker',
  '/dashboard/prompts', '/dashboard/fanout', '/dashboard/competitors', '/dashboard/trends', '/dashboard/volatility',
  '/dashboard/platforms', '/dashboard/citations', '/dashboard/recommendations', '/dashboard/accuracy',
  '/dashboard/reports', '/dashboard/geo-audit', '/dashboard/geo-audits', '/dashboard/nap-audits', '/dashboard/setup',
  '/dashboard/account', '/dashboard/billing', '/dashboard/billing/ledger', '/dashboard/alerts', '/dashboard/admin',
  '/dashboard/admin/runs', '/dashboard/activity', '/dashboard/connect', '/dashboard/fixes',
  '/dashboard/prompt-details?q=best%20hvac%20company%20in%20denver', '/dashboard/query-performance',
].join(',')).split(',');
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
const MAIN = UI === 'v3' ? '.v3-main' : '.lvx-shell-main';

// Pre-existing page problems this suite reports but does not fail on. The
// classic UI must stay exactly as it is; v3 page fixes land with the page
// restyle.
const KNOWN_CLASSIC = { overflow: ['/dashboard/admin'] };
const KNOWN_V3 = { overflow: [] };
const known = [];
const failures = [];
const passes = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL', msg); };
const pass = (msg) => { passes.push(msg); if (process.env.VERBOSE) console.log('  ok  ', msg); };

function measure() {
  const vw = document.documentElement.clientWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const main = document.querySelector('.v3-main, .lvx-shell-main');
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
    return false;
  };
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= vw + 1) continue;
    if (el.closest('[aria-hidden="true"], .lvx-drawer, .v3-drawer, nextjs-portal, [role="dialog"]')) continue;
    const svg = el.closest('svg');
    if (svg && svg !== el && svg.getBoundingClientRect().right <= vw + 1) continue;
    if (inScroller(el)) continue;
    if (el.parentElement && bad.some(b => b.el === el.parentElement)) continue;
    bad.push({ el, d: `${el.tagName.toLowerCase()}.${String(el.className || '').toString().slice(0, 40)} right=${Math.round(r.right)}` });
  }
  return { vw, sw, mainSw: main ? main.scrollWidth : 0, mainCw: main ? main.clientWidth : 0, bad: bad.slice(0, 5).map(b => b.d) };
}

async function settle(page) {
  await page.waitForSelector(`${MAIN}`, { timeout: 30000 });
  // Wait until skeletons are gone (or give up quietly after a few seconds).
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .skel, .v3-skel'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
}

async function login(page) {
  const r = await page.request.post(BASE + '/api/auth/login', {
    data: { email: process.env.E2E_EMAIL || 'owner@test.dev', password: process.env.E2E_PASSWORD || 'Passw0rd!Passw0rd' },
    headers: { Origin: BASE },
  });
  if (!r.ok()) throw new Error('login failed ' + r.status());
}

async function goto(page, route) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
  try {
    await settle(page);
  } catch (e) {
    // A long run can outlive the access token; log in again and retry once.
    if (!/\/login/.test(page.url()) && await page.locator(MAIN).count()) throw e;
    await login(page);
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page);
  }
}

async function fullShot(page, file, width) {
  const h = await page.evaluate((sel) => {
    const m = document.querySelector(sel);
    return m ? m.scrollHeight + (document.documentElement.clientHeight - m.clientHeight) : document.documentElement.scrollHeight;
  }, MAIN);
  const vh = page.viewportSize().height;
  await page.setViewportSize({ width, height: Math.min(Math.max(h, 700), 7000) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: file });
  await page.setViewportSize({ width, height: vh });
}

let storageState = null;
let loginAt = 0;
async function newPage(browser, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 640 ? 800 : 900 }, acceptDownloads: true, storageState: storageState || undefined });
  await ctx.addInitScript(() => { try { localStorage.setItem('cookie-consent', 'accepted'); } catch { /* */ } });
  await ctx.addCookies([{ name: 'lvx_ui', value: UI, url: BASE }]);
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  if (!storageState || Date.now() - loginAt > 8 * 60_000) {
    // Log in once and reuse the session: the login route is rate limited.
    await login(page);
    storageState = await ctx.storageState();
    loginAt = Date.now();
  }
  return { ctx, page };
}

/** Resolve on the first request matching the predicate, or reject after ms. */
function waitReq(page, pred, ms = 15000) {
  const p = page.waitForRequest(req => { try { return pred(req); } catch { return false; } }, { timeout: ms });
  p.catch(() => {}); // the caller may fail earlier and never await it
  return p;
}

async function layoutAndShell(browser, width) {
  const { ctx, page } = await newPage(browser, width);
  const phone = width < 640;
  for (const route of ROUTES) {
    try {
      await goto(page, route);
      const shellOk = await page.locator(UI === 'v3' ? '.v3-shell' : '.lvx-shell').count();
      if (!shellOk) { fail(`[${width}] ${route}: ${UI} shell not rendered`); continue; }
      const m = await page.evaluate(measure);
      if (m.sw > m.vw + 1 || m.mainSw > m.mainCw + 1 || m.bad.length) {
        if ((UI === 'classic' ? KNOWN_CLASSIC : KNOWN_V3).overflow.includes(route)) known.push(`[${width}] ${route} overflow (pre-existing)`);
        else fail(`[${width}] ${route}: horizontal overflow vw=${m.vw} doc=${m.sw} main=${m.mainSw}/${m.mainCw} ${m.bad.join(' | ')}`);
      } else pass(`[${width}] ${route} no overflow`);
      if (SHOTS && (width === 1440 || width === 390)) {
        const name = route.replace(/\?.*$/, '').replace(/^\/dashboard\/?/, '').replace(/\//g, '-') || 'overview';
        fs.mkdirSync(SHOTS, { recursive: true });
        await fullShot(page, path.join(SHOTS, `${name}-${width === 1440 ? 'desktop' : 'phone'}.png`), width);
      }
    } catch (e) {
      fail(`[${width}] ${route}: ${e.message.split('\n')[0]}`);
    }
  }

  // Shell behaviour on the Overview.
  try {
    await goto(page, '/dashboard');
    if (width < 1024) {
      const burger = UI === 'v3' ? page.locator('.v3-topbar button[aria-controls="v3-drawer"]') : page.locator('.lvx-hamburger');
      await burger.click();
      const drawer = page.locator(UI === 'v3' ? '#v3-drawer.open' : '#lvx-drawer.open');
      await drawer.waitFor({ state: 'visible', timeout: 5000 });
      const link = drawer.locator('a[href="/dashboard/citations"]').first();
      await link.click();
      await page.waitForURL('**/dashboard/citations', { timeout: 15000 });
      await page.waitForFunction((sel) => !document.querySelector(sel), UI === 'v3' ? '#v3-drawer.open' : '#lvx-drawer.open', { timeout: 5000 });
      pass(`[${width}] drawer opens, navigates and closes`);
      await goto(page, '/dashboard');
    }
    if (UI === 'v3') {
      const bb = page.locator('.v3-bottombar');
      if (phone) {
        if (!(await bb.isVisible())) fail(`[${width}] bottom bar hidden on phone`);
        else {
          await bb.locator('a', { hasText: 'Rivals' }).click();
          await page.waitForURL('**/dashboard/competitors', { timeout: 15000 });
          await settle(page);
          if ((await page.locator('.v3-bb-item.on', { hasText: 'Rivals' }).count()) !== 1) fail(`[${width}] bottom bar active tab wrong`);
          else pass(`[${width}] bottom bar works`);
          await goto(page, '/dashboard');
        }
      } else if (await bb.isVisible()) fail(`[${width}] bottom bar shows above phone width`);
    }
    const searchBtn = UI === 'v3'
      ? page.locator(phone ? '.v3-top-right button[aria-label="Search"]' : '.v3-search')
      : page.locator('.lvx-search:visible, .lvx-search-icon:visible').first();
    await searchBtn.click();
    await page.locator('[role="dialog"][aria-label="Search"]').waitFor({ state: 'visible', timeout: 5000 });
    await page.keyboard.press('Escape');
    pass(`[${width}] search opens`);
  } catch (e) {
    fail(`[${width}] shell: ${e.message.split('\n')[0]}`);
  }
  await ctx.close();
}

async function step(name, fn) {
  try { await fn(); pass(name); } catch (e) { fail(`${name}: ${e.message.split('\n')[0]}`); }
}

async function actions(browser, width) {
  const { ctx, page } = await newPage(browser, width);
  const phone = width < 640;
  const tag = `[${width}]`;

  await step(`${tag} Add brand opens`, async () => {
    await goto(page, '/dashboard');
    if (UI === 'v3') {
      const btn = phone ? page.locator('.v3-top-brand .v3-brand-btn') : page.locator('.v3-side-col .v3-brand-btn');
      await btn.click();
      await page.locator('.v3-brand-menu').getByText('Add brand', { exact: true }).click();
    } else if (phone) {
      await page.locator('.lvx-hamburger').click();
      await page.locator('#lvx-drawer').getByText('Add brand', { exact: true }).click();
    } else {
      await page.getByRole('button', { name: /\+ Add brand/ }).click();
    }
    await page.getByText('Add New Brand').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.add-brand-box button', { hasText: '×' }).first().click();
    await page.getByText('Add New Brand').waitFor({ state: 'detached', timeout: 5000 });
  });

  await step(`${tag} Run all engines calls the run API`, async () => {
    await goto(page, '/dashboard');
    await page.route('**/api/brands/*/run?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"e2e: run blocked"}' }));
    const req = waitReq(page, r => r.method() === 'POST' && /\/api\/brands\/[^/]+\/run\?/.test(r.url()));
    if (UI === 'v3') {
      if (phone) await page.locator('.v3-topbar button[aria-controls="v3-drawer"]').click();
      await page.locator(phone ? '#v3-drawer' : '.v3-side-col').getByRole('button', { name: /Scan all engines now/ }).click();
    } else {
      if (width < 1024) await page.locator('.lvx-hamburger').click();
      await page.locator(width < 1024 ? '#lvx-drawer .sb-run' : '.lvx-shell .sb-run').click();
    }
    // Manual runs ask to confirm the scan cost first.
    const confirm = page.locator('[role="dialog"][aria-label="Confirm run"]');
    await confirm.waitFor({ state: 'visible', timeout: 10000 });
    await confirm.getByRole('button', { name: 'Run now' }).click();
    await req;
    await page.unroute('**/api/brands/*/run?**');
    await page.keyboard.press('Escape');
  });

  await step(`${tag} Mentions filter changes rows`, async () => {
    await goto(page, '/dashboard/mentions');
    // Rows are paginated, so compare the "Showing x-y of N" total (and the
    // visible rows as a fallback) rather than the page-1 row count alone.
    const rows = page.locator(`${MAIN} table tbody tr, ${MAIN} .mention-row, ${MAIN} [data-row]`);
    const snapshot = async () => {
      const text = await page.locator(MAIN).innerText();
      const total = (text.match(/Showing\s+\d+\s*[-–]\s*\d+\s+of\s+(\d+)/i) || [])[1] || '';
      return `${total}|${await rows.count()}|${(await rows.allInnerTexts()).join('\n').slice(0, 2000)}`;
    };
    const before = await snapshot();
    await page.getByRole('button', { name: 'NOT MENTIONED', exact: true }).first().click();
    await page.waitForTimeout(600);
    const after = await snapshot();
    const body = await page.locator(MAIN).innerText();
    if (before === after && !/No matching results/.test(body)) throw new Error('rows unchanged after filtering');
  });

  await step(`${tag} Mentions export downloads a CSV`, async () => {
    await page.getByRole('button', { name: 'ALL', exact: true }).first().click();
    const dl = page.waitForEvent('download', { timeout: 10000 });
    await page.getByRole('button', { name: /Export CSV/ }).first().click();
    const d = await dl;
    if (!/\.csv$/i.test(d.suggestedFilename())) throw new Error('not a csv: ' + d.suggestedFilename());
  });

  await step(`${tag} Recommendation status change calls the API`, async () => {
    await goto(page, '/dashboard/recommendations');
    const sel = page.locator(`${MAIN} select`).filter({ has: page.locator('option[value="in_progress"]') }).first();
    await sel.waitFor({ timeout: 10000 });
    const req = waitReq(page, r => r.method() === 'PUT' && /\/recommendations/.test(r.url()));
    await sel.selectOption('in_progress');
    await req;
    // Put it back so re-runs see the same data.
    const req2 = waitReq(page, r => r.method() === 'PUT' && /\/recommendations/.test(r.url()));
    await page.locator(`${MAIN} select`).filter({ has: page.locator('option[value="in_progress"]') }).first().selectOption('open');
    await req2;
  });

  await step(`${tag} Accuracy Check Now calls the API`, async () => {
    await goto(page, '/dashboard/accuracy');
    await page.route('**/api/brands/*/accuracy', (route, request) => request.method() === 'PUT'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"error":"e2e: check blocked"}' })
      : route.continue());
    const req = waitReq(page, r => r.method() === 'PUT' && /\/accuracy$/.test(r.url()) && (r.postData() || '').includes('check'));
    await page.getByRole('button', { name: 'Check Now' }).first().click();
    await req;
    await page.unroute('**/api/brands/*/accuracy');
  });

  await step(`${tag} Alerts add (and delete when offered)`, async () => {
    await goto(page, '/dashboard/alerts');
    const name = `e2e alert ${width}`;
    await page.getByRole('button', { name: /\+ Add Alert/ }).first().click();
    await page.getByPlaceholder('e.g. SOV dropped below 20%').fill(name);
    const req = page.waitForResponse(r => r.request().method() === 'POST' && /\/alerts$/.test(r.url()), { timeout: 10000 });
    await page.getByRole('button', { name: 'Save Alert' }).click();
    const res = await req;
    if (!res.ok()) throw new Error('create failed ' + res.status());
    const row = page.locator(`${MAIN} tr`, { hasText: name }).first();
    await row.waitFor({ timeout: 10000 });
    const del = row.getByRole('button', { name: /Delete/ });
    if (await del.count()) {
      const dreq = page.waitForResponse(r => r.request().method() === 'DELETE' && /\/alerts/.test(r.url()), { timeout: 10000 });
      await del.click();
      if (!(await dreq).ok()) throw new Error('delete failed');
      await row.waitFor({ state: 'detached', timeout: 10000 });
    } else if (UI === 'v3') {
      throw new Error('v3 alerts table has no Delete button');
    }
  });

  await step(`${tag} Prompt add (Brand Setup) and delete (Tracked Prompts)`, async () => {
    const prompt = `e2e prompt ${width} ${Date.now() % 100000}`;
    await goto(page, '/dashboard/setup');
    await page.getByPlaceholder('Add a query...').fill(prompt);
    await page.getByPlaceholder('Add a query...').press('Enter');
    const save = page.waitForResponse(r => r.request().method() === 'PUT' && /\/api\/brands\/[^/]+$/.test(r.url()), { timeout: 15000 });
    await page.getByRole('button', { name: 'Save changes' }).click();
    if (!(await save).ok()) throw new Error('save failed');
    await goto(page, '/dashboard/prompts');
    const row = page.locator(`${MAIN} tr, ${MAIN} li, ${MAIN} [role="row"]`, { hasText: prompt }).first();
    await row.waitFor({ timeout: 15000 });
    await row.locator('input[type="checkbox"]').first().check();
    const del = page.waitForResponse(r => /\/api\/tracked-prompts\/bulk-delete/.test(r.url()), { timeout: 15000 });
    await page.getByRole('button', { name: /Delete selected/ }).click();
    let dres = await del;
    if (dres.status() === 429) {
      // The write endpoints are rate limited; honour Retry-After once.
      const wait = ((await dres.json().catch(() => ({}))).retryAfter || 10) * 1000 + 1000;
      await page.waitForTimeout(wait);
      const again = page.waitForResponse(r => /\/api\/tracked-prompts\/bulk-delete/.test(r.url()), { timeout: 15000 });
      await page.getByRole('button', { name: /Delete selected/ }).click();
      dres = await again;
    }
    if (!dres.ok()) throw new Error(`delete failed ${dres.status()} ${(await dres.text()).slice(0, 160)}`);
  });

  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  console.log(`UI=${UI} widths=${WIDTHS.join(',')} routes=${ROUTES.length}`);
  for (const w of process.env.SKIP_LAYOUT ? [] : WIDTHS) {
    console.log(`layout + shell @${w}`);
    await layoutAndShell(browser, w);
  }
  if (!process.env.SKIP_ACTIONS) {
    for (const w of [1440, 390]) {
      console.log(`actions @${w}`);
      await actions(browser, w);
    }
  }
  await browser.close();
  console.log(`\n${passes.length} passed, ${failures.length} failed, ${known.length} known (UI=${UI})`);
  known.forEach(k => console.log(' ~', k));
  if (failures.length) { failures.forEach(f => console.log(' -', f)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
