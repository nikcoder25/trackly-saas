/**
 * Screenshots of the v3 states that are not a plain route: modals, menus,
 * drawer, toasts, onboarding, locked brand, out-of-credits and empty states.
 * Also asserts each one actually opened. Same setup as run.cjs.
 *
 *   NODE_PATH=$(npm root -g) SHOTS=/tmp/shots node tests/e2e-v3/states.cjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || path.join(process.cwd(), 'v3-states');
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find(p => fs.existsSync(p));
const PASSWORD = 'Passw0rd!Passw0rd';
const failures = [];

async function session(browser, email, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 640 ? 844 : 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('cookie-consent', 'accepted'); } catch { /* */ } });
  await ctx.addCookies([{ name: 'lvx_ui', value: 'v3', url: BASE }]);
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept().catch(() => {}));
  const r = await page.request.post(BASE + '/api/auth/login', { data: { email, password: PASSWORD }, headers: { Origin: BASE } });
  if (!r.ok()) throw new Error(`login ${email} ${r.status()}`);
  return { ctx, page };
}

async function open(page, route) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.v3-main', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .skel, .v3-skel'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function shot(page, name, check) {
  try {
    if (check) await check();
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
    console.log('  ok  ', name);
  } catch (e) {
    failures.push(`${name}: ${e.message.split('\n')[0]}`);
    console.log('  FAIL', name, e.message.split('\n')[0]);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const width of [1440, 390]) {
    const tag = width === 1440 ? 'desktop' : 'phone';
    const phone = width < 640;
    let { ctx, page } = await session(browser, 'owner@test.dev', width);

    await open(page, '/dashboard');
    if (phone) await page.locator('.v3-top-brand .v3-brand-btn').click();
    else await page.locator('.v3-side-col .v3-brand-btn').click();
    await shot(page, `state-brand-menu-${tag}`, () => page.locator('.v3-brand-menu').first().waitFor());
    await page.locator('.v3-brand-menu:visible').getByText('Add brand', { exact: true }).click();
    await shot(page, `modal-add-brand-${tag}`, () => page.getByText('Add New Brand').waitFor());
    await page.locator('.add-brand-box button', { hasText: '×' }).first().click();

    await page.locator('.v3-acct button[aria-label="Account menu"]').click();
    await shot(page, `state-account-menu-${tag}`, () => page.getByText('Back to classic design').waitFor());
    await page.keyboard.press('Escape');

    await page.locator(phone ? '.v3-top-right button[aria-label="Search"]' : '.v3-search').click();
    await page.keyboard.type('comp');
    await page.waitForTimeout(900);
    await shot(page, `modal-command-palette-${tag}`, () => page.locator('[role="dialog"][aria-label="Search"]').waitFor());
    await page.keyboard.press('Escape');

    if (phone) {
      await page.locator('.v3-topbar button[aria-controls="v3-drawer"]').click();
      await shot(page, `state-drawer-${tag}`, () => page.locator('#v3-drawer.open').waitFor());
    }
    await page.route('**/api/brands/*/run?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Scanning is paused in this preview"}' }));
    await page.locator(phone ? '#v3-drawer' : '.v3-side-col').getByRole('button', { name: /Scan all engines now/ }).click();
    await shot(page, `modal-run-confirm-${tag}`, () => page.locator('[role="dialog"][aria-label="Confirm run"]').waitFor());
    await page.locator('[role="dialog"][aria-label="Confirm run"]').getByRole('button', { name: 'Run now' }).click();
    await page.waitForTimeout(1200);
    await shot(page, `state-run-progress-error-${tag}`);

    await open(page, '/dashboard/setup');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await shot(page, `state-toast-${tag}`, () => page.locator('[role="alert"][aria-live="assertive"] > div').first().waitFor({ state: 'visible', timeout: 15000 }));

    await open(page, '/dashboard/results');
    const row = page.locator('.v3-main button, .v3-main [role="button"]').filter({ hasText: /view|answer|open/i }).first();
    if (await row.count()) {
      await row.click().catch(() => {});
      await page.waitForTimeout(800);
      await shot(page, `state-result-drawer-${tag}`);
    }
    await ctx.close();

    ({ ctx, page } = await session(browser, 'free@test.dev', width));
    await open(page, '/dashboard');
    await shot(page, `state-first-scan-empty-and-out-of-credits-${tag}`, () => page.getByText(/Run your first scan/).first().waitFor());
    await open(page, '/dashboard/recommendations');
    await shot(page, `state-plan-gated-recommendations-${tag}`);
    await open(page, '/dashboard');
    await page.locator(phone ? '.v3-top-brand .v3-brand-btn' : '.v3-side-col .v3-brand-btn').click();
    await page.locator('.v3-brand-menu:visible').getByText('Locked Cafe').click();
    await page.waitForTimeout(1500);
    await shot(page, `state-locked-brand-${tag}`, () => page.getByText('This brand is locked').first().waitFor());
    await ctx.close();

    ({ ctx, page } = await session(browser, 'new@test.dev', width));
    await open(page, '/dashboard');
    await shot(page, `state-onboarding-${tag}`, () => page.getByText('Add New Brand').waitFor());
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${failures.length} failed`);
  if (failures.length) { failures.forEach(f => console.log(' -', f)); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
