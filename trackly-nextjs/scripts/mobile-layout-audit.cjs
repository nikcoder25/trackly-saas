/**
 * Mobile / tablet layout audit for the logged-in dashboard.
 *
 * For every dashboard route at each width it asserts that the page does not
 * scroll or clip horizontally: document and .lvx-shell-main scrollWidth stay
 * within the viewport, and no element's right edge passes the viewport unless
 * it sits inside an overflow-x:auto/scroll container. It also opens the
 * phone/tablet drawer and checks the sidebar inside it is visible.
 *
 * Needs a running app (npm run dev) and a user with at least one brand.
 *
 *   NODE_PATH=$(npm root -g) \
 *   AUDIT_EMAIL=you@example.com AUDIT_PASSWORD=... \
 *   node scripts/mobile-layout-audit.cjs
 *
 * Optional: AUDIT_BASE (default http://localhost:3000), AUDIT_WIDTHS
 * (default 375,390,768,1024,1440), AUDIT_ROUTES (comma-separated),
 * CHROMIUM_PATH (default /opt/pw-browsers/chromium-1194/chrome-linux/chrome
 * when present). Exits 1 on any failure.
 */
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = process.env.AUDIT_BASE || 'http://localhost:3000';
const WIDTHS = (process.env.AUDIT_WIDTHS || '375,390,768,1024,1440').split(',').map(Number);
const ROUTES = (process.env.AUDIT_ROUTES || [
  '/dashboard', '/dashboard/mentions', '/dashboard/proof', '/dashboard/platforms',
  '/dashboard/competitors', '/dashboard/trends', '/dashboard/accuracy', '/dashboard/citations',
  '/dashboard/fanout', '/dashboard/volatility', '/dashboard/results', '/dashboard/query-tracker',
  '/dashboard/recommendations', '/dashboard/reports', '/dashboard/geo-audit', '/dashboard/geo-audits',
  '/dashboard/nap-audits', '/dashboard/setup', '/dashboard/prompts', '/dashboard/account',
  '/dashboard/billing', '/dashboard/alerts',
].join(',')).split(',');
const DEFAULT_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync(DEFAULT_CHROMIUM) ? DEFAULT_CHROMIUM : undefined);

function measure() {
  const vw = document.documentElement.clientWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const main = document.querySelector('.lvx-shell-main');
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
    return false;
  };
  const bad = new Set();
  const report = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= vw + 1) continue;
    if (el.closest('[aria-hidden="true"], .lvx-drawer, nextjs-portal')) continue;
    const svg = el.closest('svg');
    if (svg && svg !== el && svg.getBoundingClientRect().right <= vw + 1) continue;
    if (inScroller(el)) continue;
    bad.add(el);
    if (el.parentElement && bad.has(el.parentElement)) continue;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    report.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} right=${Math.round(r.right)}`);
  }
  return { vw, sw, mainSW: main ? main.scrollWidth : -1, count: bad.size, report: report.slice(0, 10) };
}

(async () => {
  const email = process.env.AUDIT_EMAIL;
  const password = process.env.AUDIT_PASSWORD;
  if (!email || !password) throw new Error('Set AUDIT_EMAIL and AUDIT_PASSWORD');
  const browser = await chromium.launch({ executablePath });
  const login = await browser.newContext();
  const res = await login.request.post(BASE + '/api/auth/login', { data: { email, password }, headers: { origin: BASE } });
  if (!res.ok()) throw new Error('Login failed: ' + res.status());
  const cookies = await login.cookies();
  await login.close();

  let failures = 0;
  for (const width of WIDTHS) {
    const mobile = width < 1024;
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, isMobile: mobile, hasTouch: mobile });
    await ctx.addCookies(cookies);
    await ctx.addInitScript(() => { try { localStorage.setItem('cookie-consent', 'accepted'); } catch { /* ignore */ } });
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const m = await page.evaluate(measure);
      const ok = m.mainSW >= 0 && m.sw <= m.vw && m.mainSW <= m.vw && m.count === 0;
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${width} ${route} scrollWidth=${m.sw} main=${m.mainSW}${m.mainSW < 0 ? ' (no dashboard shell - logged out?)' : ''}${m.count ? ' offenders: ' + m.report.join(' | ') : ''}`);
    }
    if (mobile) {
      await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' }).catch(() => {});
      await page.locator('.lvx-hamburger').click();
      await page.waitForTimeout(400);
      const visible = await page.evaluate(() => {
        const s = document.querySelector('.lvx-drawer .sidebar');
        return !!s && getComputedStyle(s).display !== 'none' && s.getBoundingClientRect().width > 0;
      });
      if (!visible) failures++;
      console.log(`${visible ? 'PASS' : 'FAIL'} ${width} drawer sidebar visible`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `${failures} failure(s)` : 'all checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
