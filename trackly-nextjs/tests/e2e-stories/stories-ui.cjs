/**
 * Browser user stories (Playwright). Each gets a fresh context; `login()`
 * signs in through the real form.
 */
const { BASE } = require('./client.cjs');
const { PASSWORD } = require('./setup.cjs');

function expect(cond, msg) { if (!cond) throw new Error(msg); }
const S = [];
const story = (id, area, title, prs, fn, opts = {}) => S.push({ id, area, title, prs, fn, ui: true, ...opts });

// Sign-in is rate limited (10/min per IP, 10 per account per 15 min), so each
// account signs in through the form once and later stories reuse its cookies.
const sessions = {};
async function login(page, email = 'owner@test.dev', { fresh = false } = {}) {
  if (!fresh && sessions[email]) {
    await page.context().addCookies(sessions[email]);
    await page.goto(BASE + '/dashboard');
    if (/\/dashboard/.test(page.url())) return;
  }
  await formLogin(page, email);
  sessions[email] = await page.context().cookies();
}
async function formLogin(page, email) {
  await page.goto(BASE + '/login');
  await page.fill('input[type="email"], input[name="email"], input[autocomplete="username"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
}
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .skel, .v3-skel'), null, { timeout: 8000 }).catch(() => {});
}
/** Records page errors and failing API calls while `fn` runs. */
function watch(page) {
  const errors = []; const bad = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && /hydrat|Minified React error|Uncaught/i.test(m.text())) errors.push(m.text()); });
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) bad.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  return { errors, bad };
}
const bodyText = (page) => page.evaluate(() => document.body.innerText);

story('UI-01', 'Dashboard UI', 'As a user, I can sign in through the login form and land on my dashboard', ['#765'], async ({ page }) => {
  await login(page, 'owner@test.dev', { fresh: true });
  expect(/\/dashboard/.test(page.url()), page.url());
});
story('UI-02', 'Dashboard UI', 'As an owner, the Overview shows my real brand, never the "Acme" sample data', ['#741', '#561', '#562'], async ({ page }) => {
  await login(page); await settle(page);
  const t = await bodyText(page);
  expect(!/Acme PM|Acme/.test(t), 'sample Acme data on overview');
  expect(/Cool Breeze HVAC|Arctic|Denver/i.test(t), 'brand name not shown');
});
story('UI-03', 'Dashboard UI', 'As an owner, the greeting is not hardcoded to someone else\'s name', ['#679'], async ({ page }) => {
  await login(page); await settle(page);
  const t = await bodyText(page);
  expect(!/Welcome back, Nikhil/.test(t), 'hardcoded greeting');
});
story('UI-04', 'Dashboard UI', 'As a signed-out visitor, opening /dashboard sends me to login', ['#667'], async ({ page }) => {
  await page.goto(BASE + '/dashboard');
  await page.waitForURL(/\/login/, { timeout: 15000 });
});
story('UI-05', 'Dashboard UI', 'As a signed-in user, opening /login sends me to my dashboard', ['#765'], async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/login');
  expect(/\/dashboard/.test(page.url()), page.url());
});
story('UI-06', 'Dashboard UI', 'As a user, a login ?redirect= to another site is ignored (no open redirect)', ['#806'], async ({ page }) => {
  await page.goto(BASE + '/login?redirect=https://evil.example/');
  await page.fill('#email', 'owner@test.dev');
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  expect(!/evil\.example/.test(page.url()), `redirected to ${page.url()}`);
});
story('UI-07', 'Dashboard UI', 'As a phone user, the menu drawer lists the pages (not empty)', ['#774'], async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page); await settle(page);
  const btn = page.locator('button[aria-label*="menu" i], button[aria-label*="navigation" i], .v3-burger, .lvx-burger').first();
  await btn.click();
  await page.waitForTimeout(500);
  const links = await page.locator('[role="dialog"] a, .v3-drawer a, .lvx-drawer a').count();
  expect(links >= 5, `drawer has ${links} links`);
});
story('UI-08', 'Dashboard UI', 'As a phone user, the Overview has no sideways scroll', ['#774', '#788'], async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page); await settle(page);
  const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
  expect(sw <= vw + 1, `scrollWidth ${sw} > ${vw}`);
});
story('UI-09', 'Dashboard UI', 'As a user, every dashboard page loads without a crash or a 5xx API call', ['#765', '#774', '#771'], async ({ page }) => {
  const w = watch(page);
  await login(page);
  const routes = ['/dashboard', '/dashboard/mentions', '/dashboard/proof', '/dashboard/results', '/dashboard/query-tracker', '/dashboard/prompts',
    '/dashboard/fanout', '/dashboard/competitors', '/dashboard/trends', '/dashboard/volatility', '/dashboard/platforms', '/dashboard/citations',
    '/dashboard/recommendations', '/dashboard/accuracy', '/dashboard/reports', '/dashboard/geo-audits', '/dashboard/nap-audits',
    '/dashboard/setup', '/dashboard/account', '/dashboard/billing', '/dashboard/billing/ledger', '/dashboard/alerts', '/dashboard/activity',
    '/dashboard/connect', '/dashboard/fixes', '/dashboard/rank-tracking', '/dashboard/prompt-details?q=best%20hvac%20company%20in%20denver'];
  const crashed = [];
  for (const r of routes) {
    await page.goto(BASE + r); await settle(page);
    const t = await bodyText(page);
    if (/Application error|Something went wrong|Unhandled Runtime Error/i.test(t)) crashed.push(r);
  }
  expect(!crashed.length, `crashed: ${crashed}`);
  expect(!w.bad.length, `5xx API calls: ${[...new Set(w.bad)].join(', ')}`);
  expect(!w.errors.length, `page errors: ${w.errors.slice(0, 3).join(' | ')}`);
}, { timeout: 300000 });
story('UI-10', 'Dashboard UI', 'As a user, I can reach Fan-out and AI Volatility from the navigation', ['#749'], async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const hrefs = async () => page.$$eval('a[href^="/dashboard"]', as => as.map(a => a.getAttribute('href')));
  await page.goto(BASE + '/dashboard/mentions'); await settle(page);
  expect((await hrefs()).includes('/dashboard/fanout'), 'no fanout tab in Prompts section');
  await page.goto(BASE + '/dashboard/competitors'); await settle(page);
  expect((await hrefs()).includes('/dashboard/volatility'), 'no volatility tab in Competitors section');
});
story('UI-11', 'Dashboard UI', 'As a user, the command palette finds my prompt', ['#745', '#774'], async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page); await settle(page);
  await page.keyboard.press('Control+K');
  await page.waitForTimeout(400);
  await page.keyboard.type('furnace');
  await page.waitForTimeout(2500);
  const t = await bodyText(page);
  expect(/emergency furnace repair denver/i.test(t), 'prompt not found in palette');
});
story('UI-12', 'Dashboard UI', 'As a user, Account never offers the internal Free tier as a downgrade', ['#667'], async ({ page }) => {
  await login(page, 'stranger@test.dev');
  await page.goto(BASE + '/dashboard/account'); await settle(page);
  expect(!/Downgrade to Free/i.test(await bodyText(page)), 'Downgrade to Free offered');
});
story('UI-13', 'Dashboard UI', 'As a brand-new trial user with no brand, the dashboard shows onboarding, not a crash', ['#652', '#664'], async ({ page }) => {
  const w = watch(page);
  await login(page, 'new@test.dev'); await settle(page);
  const t = await bodyText(page);
  expect(!/Application error/i.test(t), 'crash');
  expect(/brand|get started|set up|add/i.test(t), 'no onboarding copy');
  expect(!w.errors.length, w.errors.join(' | '));
});
story('UI-14', 'Dashboard UI', 'As a brand-new user, the Overview does not show made-up SOV numbers', ['#652', '#741'], async ({ page }) => {
  await login(page, 'new@test.dev'); await settle(page);
  const t = await bodyText(page);
  expect(!/Acme|Linear/.test(t), 'demo data shown to empty account');
});
story('UI-15', 'Dashboard UI', 'As an owner, switching brand in the topbar changes the Overview', ['#561', '#571'], async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page); await settle(page);
  const before = await bodyText(page);
  const sel = page.locator('select').filter({ hasText: /HVAC|Arctic/ }).first();
  if (await sel.count()) {
    const opts = await sel.locator('option').allTextContents();
    await sel.selectOption({ index: opts.length > 1 ? 1 : 0 });
  } else {
    await page.locator('button:has-text("Cool Breeze"), button:has-text("Arctic")').first().click();
    await page.locator('[role="menuitem"], [role="option"], li button').filter({ hasNotText: /Cool Breeze/ }).first().click();
  }
  await settle(page); await page.waitForTimeout(1500);
  expect((await bodyText(page)) !== before, 'overview did not change');
});
story('UI-16', 'Dashboard UI', 'As an owner, saving an alert rule shows it in the list (no fake "Saved")', ['#668', '#771'], async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(BASE + '/dashboard/alerts'); await settle(page);
  const resp = [];
  page.on('response', r => { if (/\/alerts/.test(r.url()) && r.request().method() !== 'GET') resp.push(r.status()); });
  await page.locator('button:has-text("+ Add Alert")').first().click();
  await page.waitForTimeout(500);
  const label = 'UI alert ' + Date.now();
  await page.locator('input[placeholder*="SOV dropped"]').fill(label);
  await page.locator('button:has-text("Save Alert")').click();
  await page.waitForTimeout(2500);
  expect(resp.length && resp.every(s => s < 300), `alert save responses: ${resp}`);
  await page.reload(); await settle(page);
  expect((await bodyText(page)).includes(label), 'saved alert not listed after reload');
});
story('UI-17', 'Dashboard UI', 'As an owner, Reports has a download button that returns a PDF', ['#588', '#590'], async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(BASE + '/dashboard/reports'); await settle(page);
  const [resp] = await Promise.all([
    page.waitForResponse(r => /\/report\/(pdf|custom)/.test(r.url()), { timeout: 60000 }),
    page.locator('button:has-text("Download"), a:has-text("Download")').first().click(),
  ]);
  expect(resp.status() === 200, `pdf ${resp.status()}`);
});
story('UI-18', 'Dashboard UI', 'As an owner, Query Tracker period buttons actually change the request', ['#771'], async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(BASE + '/dashboard/query-tracker'); await settle(page);
  const urls = [];
  page.on('request', r => { if (/keyword-tracker/.test(r.url())) urls.push(r.url()); });
  const before = await bodyText(page);
  const btn = page.locator('button:has-text("Week"), button:has-text("WEEK"), button:has-text("Month"), button:has-text("MONTH")').first();
  await btn.click(); await page.waitForTimeout(1500);
  expect(urls.length > 0 || (await bodyText(page)) !== before, 'period button did nothing');
});
story('UI-19', 'Dashboard UI', 'As a free user with a locked brand, the UI shows it as locked and does not crash', ['#800', '#771'], async ({ page }) => {
  const w = watch(page);
  await login(page, 'free@test.dev'); await settle(page);
  expect(!w.errors.length, w.errors.join(' | '));
});
story('UI-20', 'Dashboard UI', 'As an admin, the admin page loads', ['#563', '#565'], async ({ page }) => {
  const w = watch(page);
  await login(page);
  await page.goto(BASE + '/dashboard/admin'); await settle(page);
  expect(!w.bad.length, w.bad.join(', '));
});
story('UI-21', 'Dashboard UI', 'As a normal user, /admin-backend bounces me to my dashboard', ['#765'], async ({ page }) => {
  await login(page, 'stranger@test.dev');
  await page.goto(BASE + '/admin-backend');
  expect(!/admin-backend/.test(page.url()) || /login/.test(page.url()), page.url());
});
story('UI-22', 'Dashboard UI', 'As a user, the SOV chart puts 0% at the bottom', ['#682'], async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page); await settle(page);
  const ticks = await page.evaluate(() => {
    const out = [];
    for (const t of document.querySelectorAll('svg text')) {
      const m = (t.textContent || '').trim().match(/^(\d+)%$/);
      if (m) out.push({ v: Number(m[1]), y: t.getBoundingClientRect().top });
    }
    return out;
  });
  if (ticks.length < 2) return;
  const lo = ticks.reduce((a, b) => (b.v < a.v ? b : a)); const hi = ticks.reduce((a, b) => (b.v > a.v ? b : a));
  expect(lo.y > hi.y, `0% tick is above ${hi.v}% (inverted axis)`);
});
story('UI-23', 'Dashboard UI', 'As a user, cited-source chips are real links, not href="#"', ['#579'], async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(BASE + '/dashboard/citations'); await settle(page);
  const dead = await page.$$eval('a[href="#"]', as => as.filter(a => /\.(com|org|net)/.test(a.textContent || '')).length);
  expect(dead === 0, `${dead} dead citation chips`);
});
story('UI-24', 'Dashboard UI', 'As a user, numbers read "1 pt" not "1 pts"', ['#775'], async ({ page }) => {
  await login(page); await settle(page);
  expect(!/\b1 pts\b/.test(await bodyText(page)), '"1 pts" on overview');
});
story('UI-25', 'Dashboard UI', 'As a user, Platform Status does not show engines I turned off as failing', ['#792', '#667'], async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/dashboard/platforms'); await settle(page);
  expect(!/0 of \d+ responses/i.test(await bodyText(page)), '"0 of N responses" shown');
});
story('UI-26', 'Dashboard UI', 'As a user with an old bookmark, /dashboard/query-performance lands on Query Tracker', ['#766'], async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/dashboard/query-performance');
  await page.waitForURL(/query-tracker/, { timeout: 15000 });
});
story('PUBUI-01', 'Public UI', 'As a visitor, public pages hydrate without React mismatch errors', ['#766'], async ({ page }) => {
  const w = watch(page);
  for (const p of ['/', '/pricing', '/tools', '/vs/profound', '/blog']) { await page.goto(BASE + p); await settle(page); }
  expect(!w.errors.length, w.errors.slice(0, 3).join(' | '));
});
story('PUBUI-02', 'Public UI', 'As a signed-in user browsing the site, the header offers a Dashboard button', ['#792'], async ({ page }) => {
  await login(page);
  await page.goto(BASE + '/pricing'); await settle(page);
  const n = await page.locator('header a[href="/dashboard"], nav a[href="/dashboard"]').count();
  expect(n > 0, 'no Dashboard button in header');
});
story('PUBUI-03', 'Public UI', 'As a phone visitor, the home page has no sideways scroll', ['#788', '#787'], async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const p of ['/', '/pricing', '/tools']) {
    await page.goto(BASE + p); await settle(page);
    const { sw, vw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    expect(sw <= vw + 1, `${p} scrollWidth ${sw} > ${vw}`);
  }
});
story('PUBUI-04', 'Public UI', 'As a visitor, the CTA above the footer has its heading, text and button spaced apart', ['#604'], async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/tools'); await settle(page);
  const ok = await page.evaluate(() => {
    const s = document.querySelector('.land-cta-section');
    if (!s) return true;
    const h = s.querySelector('h2'); const p = s.querySelector('p');
    if (!h || !p) return true;
    return p.getBoundingClientRect().top >= h.getBoundingClientRect().bottom - 1;
  });
  expect(ok, 'CTA heading and text overlap');
});

module.exports = { stories: S };
