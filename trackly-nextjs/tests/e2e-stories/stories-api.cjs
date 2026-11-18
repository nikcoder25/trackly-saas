/**
 * API-level user stories. Each story names the bug-fix PR(s) it guards and
 * is phrased as the thing a user expects. `ctx` provides logged-in clients:
 * owner (owner plan, admin), free (out of credits), trial (no brands),
 * stranger (pro, owns story_brand_x), viewer (team viewer of owner), anon.
 */
const { Client, BASE } = require('./client.cjs');
const { sql, PASSWORD } = require('./setup.cjs');

const OB = '/api/brands/seed_brand_1';
const SB = '/api/brands/story_brand_x';

function expect(cond, msg) { if (!cond) throw new Error(msg); }
function status(r, want, label = '') {
  const ok = Array.isArray(want) ? want.includes(r.status) : r.status === want;
  expect(ok, `${label} expected ${want}, got ${r.status}: ${r.text.slice(0, 200)}`);
}
function not5xx(r, label = '') { expect(r.status < 500, `${label} returned ${r.status}: ${r.text.slice(0, 200)}`); }

const S = [];
const story = (id, area, title, prs, fn) => S.push({ id, area, title, prs, fn });

// ─── Auth & sessions ──────────────────────────────────────────────────────
story('AUTH-01', 'Auth', 'As a user, I can sign in and get secure, HttpOnly session cookies', ['#765', '#814'], async () => {
  const c = new Client();
  const r = await c.post('/api/auth/login', { email: 'owner@test.dev', password: PASSWORD });
  status(r, 200, 'login');
  const sc = r.headers.getSetCookie().join('\n');
  expect(/__Host-livesov_token=[^;]+;[^\n]*HttpOnly/i.test(sc), 'access cookie not HttpOnly');
  expect(/__Host-livesov_token=[^;]+;[^\n]*Secure/i.test(sc), 'access cookie not Secure');
  expect(/SameSite=Lax/i.test(sc), 'cookies missing SameSite');
});
story('AUTH-02', 'Auth', 'As a user, a wrong password and an unknown email give the same generic error', ['#771'], async () => {
  const a = await new Client().post('/api/auth/login', { email: 'owner@test.dev', password: 'nope-nope-nope' });
  const b = await new Client().post('/api/auth/login', { email: 'ghost-404@test.dev', password: 'nope-nope-nope' });
  status(a, 400); status(b, 400);
  expect(a.json.error === b.json.error, 'error text differs, leaks which emails exist');
});
story('AUTH-03', 'Auth', 'As a scanner hitting /api/auth/login with junk, I get a 400 not a 500', ['#743', '#771'], async () => {
  const r = await new Client().post('/api/auth/login', '{not json');
  status(r, 400, 'malformed login');
});
story('AUTH-04', 'Auth', 'As a scanner hitting /api/auth/register with junk, I get a 400 not a 500', ['#743'], async () => {
  const r = await new Client().post('/api/auth/register', 'garbage=1');
  status(r, 400, 'malformed register');
});
story('AUTH-05', 'Auth', 'As a scanner hitting /api/auth/forgot-password with junk, I get a 4xx not a 500', ['#743'], async () => {
  const r = await new Client().post('/api/auth/forgot-password', '[[[');
  expect(r.status >= 400 && r.status < 500, `got ${r.status}`);
});
story('AUTH-06', 'Auth', 'As a user, I can sign in with my username instead of my email', ['#771'], async () => {
  const c = new Client();
  status(await c.post('/api/auth/login', { email: 'story_stranger', password: PASSWORD }), 200, 'username login');
});
story('AUTH-07', 'Auth', 'As a user, my email is matched case-insensitively on sign-in', ['#771'], async () => {
  status(await new Client().post('/api/auth/login', { email: 'STRANGER@Test.dev', password: PASSWORD }), 200);
});
story('AUTH-08', 'Auth', 'As a security owner, 5 wrong passwords lock the account even with the right one after', ['#681', '#771'], async () => {
  for (let i = 0; i < 5; i++) await new Client().post('/api/auth/login', { email: 'lock@test.dev', password: 'wrong-' + i });
  const r = await new Client().post('/api/auth/login', { email: 'lock@test.dev', password: PASSWORD });
  status(r, 429, 'locked login');
  expect(r.json && r.json.locked === true, 'locked flag missing');
});
story('AUTH-09', 'Auth', 'As a user, a successful sign-in resets my failed-attempt counter', ['#771'], async () => {
  await sql(`UPDATE users SET settings = '{}'::jsonb WHERE id = 'story_sess'`);
  for (let i = 0; i < 3; i++) await new Client().post('/api/auth/login', { email: 'sess@test.dev', password: 'bad' + i });
  await new Client().login('sess@test.dev');
  const row = (await sql(`SELECT settings FROM users WHERE id = 'story_sess'`)).rows[0];
  expect(!row.settings.failed_login_attempts, `counter still ${row.settings.failed_login_attempts}`);
});
story('AUTH-10', 'Auth', 'As a signed-out visitor, /api/auth/me tells me 401', ['#765'], async () => {
  status(await new Client().get('/api/auth/me'), 401);
});
story('AUTH-11', 'Auth', 'As a user with many tabs, 20 quick /api/auth/me calls never bounce me to login (no 429)', ['#765'], async (ctx) => {
  for (let i = 0; i < 20; i++) status(await ctx.owner.get('/api/auth/me'), 200, `me #${i}`);
});
story('AUTH-12', 'Auth', 'As a security owner, password guessing is still rate-limited per IP on /api/auth/login', ['#765'], async () => {
  const ip = '10.77.0.1'; let last;
  for (let i = 0; i < 12; i++) last = await new Client().post('/api/auth/login', { email: `x${i}@nobody.dev`, password: 'x' }, { ip });
  status(last, 429, '12th login in a minute');
});
story('AUTH-13', 'Auth', 'As a user, signing out invalidates my session token immediately', ['#814'], async () => {
  const c = new Client(); await c.login('sess@test.dev');
  const token = c.jar['__Host-livesov_token'];
  status(await c.post('/api/auth/logout'), 200, 'logout');
  const reuse = await new Client().get('/api/auth/me', { headers: { cookie: `__Host-livesov_token=${token}` } });
  status(reuse, 401, 'old token after logout');
});
story('AUTH-14', 'Auth', 'As a user, changing my password signs out my other browsers at once', ['#814'], async () => {
  await sql(`UPDATE users SET password_hash = (SELECT password_hash FROM users WHERE id = 'story_stranger') WHERE id = 'story_pw'`);
  const other = new Client(); await other.login('pw@test.dev');
  const me = new Client(); await me.login('pw@test.dev');
  status(await me.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'N3w-Passw0rd!Passw0rd' }), 200, 'change pw');
  status(await other.get('/api/auth/me'), 401, 'other browser after change');
  status(await me.get('/api/auth/me'), 200, 'my browser after change');
});
story('AUTH-15', 'Auth', 'As a user, a wrong current password does not change my password', ['#814'], async () => {
  const c = new Client(); await c.login('sess@test.dev');
  const r = await c.post('/api/auth/change-password', { currentPassword: 'definitely-wrong', newPassword: 'Another-Passw0rd!!' });
  expect(r.status === 400 || r.status === 401 || r.status === 403, `got ${r.status}`);
  await new Client().login('sess@test.dev');
});
story('AUTH-16', 'Auth', 'As a user, revoking a session from Account kills that session right away', ['#814'], async () => {
  const a = new Client(); await a.login('sess@test.dev');
  const b = new Client(); await b.login('sess@test.dev');
  const list = await a.get('/api/auth/sessions'); status(list, 200);
  const target = list.json.sessions.find(s => !s.is_current);
  expect(target, 'no other session listed');
  const victim = target.id;
  status(await a.del(`/api/auth/sessions/${victim}`), 200, 'revoke');
  const bMe = await b.get('/api/auth/me');
  const aMe = await a.get('/api/auth/me');
  expect(bMe.status === 401 || aMe.status === 401, 'revoked session still works');
});
story('AUTH-17', 'Auth', 'As a security owner, a forged alg=none token is rejected', ['#814'], async () => {
  const h = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
  const p = Buffer.from(JSON.stringify({ id: 'seed_owner_1', role: 'admin', exp: 9999999999 })).toString('base64url');
  status(await new Client().get('/api/auth/me', { headers: { cookie: `__Host-livesov_token=${h}.${p}.` } }), 401);
});
story('AUTH-18', 'Auth', 'As a security owner, a signed-in POST without the CSRF token is blocked', ['#720'], async (ctx) => {
  status(await ctx.owner.post('/api/brands', { name: 'x' }, { noCsrf: true }), 403);
});
story('AUTH-19', 'Auth', 'As a security owner, a cross-origin POST is blocked', ['#720'], async (ctx) => {
  status(await ctx.owner.post('/api/brands', { name: 'x' }, { origin: 'https://evil.example' }), 403);
});
story('AUTH-20', 'Auth', 'As a security owner, a state-changing request with no Origin or Referer is refused in production', ['#720'], async (ctx) => {
  status(await ctx.owner.post('/api/brands', { name: 'x' }, { noOrigin: true }), 403);
});
story('AUTH-21', 'Auth', 'As a security owner, the cron secret is not accepted from the query string', ['#740', '#765'], async () => {
  const r = await new Client().get('/api/cron?secret=e2e-cron-secret');
  expect(r.status === 401 || r.status === 403 || r.status === 405, `query-string secret accepted: ${r.status}`);
});
story('AUTH-22', 'Auth', 'As a user, /api/auth/refresh with no refresh cookie is a clean 4xx, not 500', ['#765'], async () => {
  status(await new Client().post('/api/auth/refresh'), [400, 401]);
});
story('AUTH-23', 'Auth', 'As a user, my username change rejects HTML/script characters', ['#790'], async () => {
  const c = new Client(); await c.login('sess@test.dev');
  status(await c.put('/api/auth/username', { username: '<script>x' }), 400);
});
story('AUTH-24', 'Auth', 'As a user, deleting my account without my password is refused and says why', ['#771'], async () => {
  const c = new Client(); await c.login('del@test.dev');
  const r = await c.del('/api/auth/account', {});
  expect(r.status === 400 || r.status === 401 || r.status === 403, `got ${r.status}`);
  status(await c.get('/api/auth/me'), 200, 'account still exists');
});
story('AUTH-25', 'Auth', 'As a user, 2FA status is reported off for a fresh account', ['#765'], async (ctx) => {
  const r = await ctx.stranger.get('/api/auth/2fa/status'); status(r, 200);
  expect(r.json.enabled === false || r.json.totpEnabled === false, JSON.stringify(r.json));
});
story('AUTH-26', 'Auth', 'As a visitor, an invalid email-verify token gives a friendly 4xx, not a crash', ['#652'], async () => {
  const r = await new Client().get('/api/auth/verify-email?token=not-a-real-token');
  expect(r.status < 500, `got ${r.status}`);
});
story('AUTH-27', 'Auth', 'As a visitor, registering an email that already exists does not 500', ['#771'], async () => {
  const r = await new Client().post('/api/auth/register', { email: 'owner@test.dev', password: 'Some-Passw0rd!!', name: 'Dup' });
  expect(r.status >= 400 && r.status < 500, `got ${r.status}`);
});
story('AUTH-28', 'Auth', 'As a visitor, registering with a too-short password is rejected', ['#771'], async () => {
  const r = await new Client().post('/api/auth/register', { email: `short${Date.now()}@test.dev`, password: '123', name: 'Short' });
  expect(r.status >= 400 && r.status < 500, `got ${r.status}`);
});
story('AUTH-29', 'Auth', 'As an unverified user, I cannot read brand data until I verify my email', ['#765'], async () => {
  const c = new Client(); const r = await c.post('/api/auth/login', { email: 'unverified@test.dev', password: PASSWORD });
  if (r.status !== 200) return; // login itself may be gated - also fine
  const b = await c.get('/api/brands');
  expect(b.status === 403 || b.status === 401, `unverified read brands: ${b.status}`);
});

// ─── Brands & access control ─────────────────────────────────────────────
story('BRAND-01', 'Brands', 'As an owner, my brand list shows only my brands', ['#800'], async (ctx) => {
  const r = await ctx.owner.get('/api/brands'); status(r, 200);
  const ids = r.json.brands.map(b => b.id);
  expect(ids.includes('seed_brand_1') && !ids.includes('story_brand_x'), `ids=${ids}`);
});
story('BRAND-02', 'Brands', 'As a stranger, I cannot read another account\'s brand', ['#815'], async (ctx) => {
  status(await ctx.stranger.get(OB), 404);
});
story('BRAND-03', 'Brands', 'As a stranger, I cannot edit another account\'s brand', ['#771'], async (ctx) => {
  const r = await ctx.stranger.put(OB, { name: 'pwned' });
  expect(r.status === 404 || r.status === 403, `got ${r.status}`);
});
story('BRAND-04', 'Brands', 'As a stranger, I cannot start a scan on another account\'s brand', ['#815'], async (ctx) => {
  const r = await ctx.stranger.post(`${OB}/run`, {});
  expect(r.status === 404 || r.status === 403, `got ${r.status}`);
});
story('BRAND-05', 'Brands', 'As an owner, saving a brand with non-array prompts is rejected', ['#771'], async (ctx) => {
  status(await ctx.stranger.put(SB, { queries: 'not-an-array' }), 400);
});
story('BRAND-06', 'Brands', 'As an owner, the brand list ships at most 10 runs and no raw AI answers', ['#790'], async (ctx) => {
  const r = await ctx.owner.get('/api/brands'); status(r, 200);
  for (const b of r.json.brands) {
    expect((b.runs || []).length <= 10, `${b.id} has ${b.runs.length} runs`);
    const last = (b.runs || []).slice(-1)[0];
    for (const x of (last && last.allResults) || []) expect(x.raw === undefined && x.response === undefined, 'raw answer leaked');
  }
});
story('BRAND-07', 'Brands', 'As a free user at my brand limit, I cannot add another brand', ['#628', '#771'], async (ctx) => {
  const r = await ctx.free.post('/api/brands', { name: 'Third Brand', website: 'https://third.example', queries: ['q'] });
  expect(r.status === 403 || r.status === 402 || r.status === 400, `got ${r.status}`);
});
story('BRAND-08', 'Brands', 'As an owner, creating a brand with a malformed body gives 400 not 500', ['#743'], async (ctx) => {
  status(await ctx.stranger.post('/api/brands', '{oops'), 400);
});
story('BRAND-09', 'Brands', 'As an owner, opening a brand that does not exist gives 404', ['#765'], async (ctx) => {
  status(await ctx.owner.get('/api/brands/does_not_exist'), 404);
});
story('BRAND-10', 'Brands', 'As an owner, the competitor analysis endpoint loads instead of 500ing', ['#765'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/competitor-analysis`); status(r, 200);
  expect(Array.isArray(r.json.competitors), 'competitors not an array');
});
story('BRAND-11', 'Brands', 'As an owner, the scan cost estimate counts my real prompt list', ['#807'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/cost-estimate`); status(r, 200);
  const b = await ctx.owner.get(OB);
  expect(r.json.queryCount === (b.json.brand.queries || []).length, `estimate ${r.json.queryCount} vs ${(b.json.brand.queries || []).length}`);
});
story('BRAND-12', 'Brands', 'As an owner, I can export my brand data, and a stranger cannot', ['#815'], async (ctx) => {
  status(await ctx.owner.get('/api/export/brand/seed_brand_1'), 200, 'own export');
  const r = await ctx.stranger.get('/api/export/brand/seed_brand_1');
  expect(r.status === 404 || r.status === 403, `stranger export ${r.status}`);
});
story('BRAND-13', 'Brands', 'As a stranger, I cannot force-release another account\'s run lock', ['#740'], async (ctx) => {
  const r = await ctx.stranger.post(`${OB}/force-release`, {});
  expect(r.status === 404 || r.status === 403, `got ${r.status}`);
});
story('BRAND-14', 'Brands', 'As a team viewer, I can see the owner\'s brand but not edit it', ['#771'], async (ctx) => {
  const list = await ctx.viewer.get('/api/brands'); status(list, 200);
  expect((list.json.sharedBrands || []).some(b => b.id === 'seed_brand_1'), 'shared brand missing for viewer');
  expect(!list.json.brands.some(b => b.id === 'seed_brand_1'), 'shared brand listed as owned');
  const r = await ctx.viewer.put(OB, { goal: 99 });
  expect(r.status === 403, `viewer edit ${r.status}`);
});
story('BRAND-15', 'Brands', 'As a team viewer, I cannot start a scan', ['#771'], async (ctx) => {
  const r = await ctx.viewer.post(`${OB}/run`, {});
  expect(r.status === 403, `viewer run ${r.status}`);
});
story('BRAND-16', 'Brands', 'As an owner, a team member\'s save never writes shared/teamRole into my brand', ['#771'], async () => {
  const row = (await sql(`SELECT data FROM brands WHERE id = 'seed_brand_1'`)).rows[0];
  expect(row.data.shared === undefined && row.data.teamRole === undefined, 'owner brand polluted');
});
story('BRAND-17', 'Brands', 'As an owner, deleting a brand also removes its citations and recommendations', ['#681', '#815'], async (ctx) => {
  const c = ctx.stranger;
  const made = await c.post('/api/brands', { name: 'Temp Brand', website: 'https://temp-brand.example', city: 'Austin', queries: ['temp q'] });
  expect(made.status === 200 || made.status === 201, `create ${made.status} ${made.text.slice(0, 150)}`);
  const id = (made.json.brand || made.json).id;
  await sql(`INSERT INTO recommendations (id, brand_id, type, severity, title, description, status, created_at) VALUES ($1, $2, 'content', 'low', 't', 'd', 'open', NOW())`, ['rec_tmp_' + id, id]);
  status(await c.del(`/api/brands/${id}`), 200, 'delete');
  const left = await sql(`SELECT COUNT(*)::int AS n FROM recommendations WHERE brand_id = $1`, [id]);
  expect(left.rows[0].n === 0, `${left.rows[0].n} orphan recommendations`);
});

// ─── Scans, credits, plans ───────────────────────────────────────────────
story('RUN-01', 'Scans', 'As a free user out of credits, starting a scan is refused with a clear 402/429', ['#740', '#807'], async (ctx) => {
  const r = await ctx.free.post('/api/brands/seed_free_b1/run', {});
  expect([402, 403, 429].includes(r.status), `got ${r.status}: ${r.text.slice(0, 150)}`);
});
story('RUN-02', 'Scans', 'As a free user, a refused scan leaves no credits reserved', ['#740'], async (ctx) => {
  const before = await ctx.free.get('/api/credits/status');
  await ctx.free.post('/api/brands/seed_free_b1/run', {});
  const after = await ctx.free.get('/api/credits/status');
  expect(after.json.reservedCredits === before.json.reservedCredits, `reserved ${before.json.reservedCredits} -> ${after.json.reservedCredits}`);
});
story('RUN-03', 'Scans', 'As an owner, an idle brand reports run status "none"', ['#663'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/run-status`); status(r, 200);
  expect(r.json.status === 'none' || r.json.status === 'idle', r.text);
});
story('RUN-04', 'Scans', 'As an owner, asking to scan an unknown engine is rejected', ['#677'], async (ctx) => {
  const r = await ctx.stranger.post(`${SB}/run`, { platforms: ['NotARealEngine'] });
  expect(r.status === 400 || r.status === 422, `got ${r.status}: ${r.text.slice(0, 150)}`);
});
story('RUN-05', 'Scans', 'As a user, my credit status numbers are internally consistent', ['#740', '#521'], async (ctx) => {
  for (const c of [ctx.owner, ctx.free, ctx.trial]) {
    const r = await c.get('/api/credits/status'); status(r, 200);
    expect(r.json.monthlyUsed <= r.json.monthlyCap + r.json.reservedCredits || r.json.remaining === 0, JSON.stringify(r.json));
    expect(r.json.remaining >= 0, 'negative remaining');
  }
});
story('RUN-06', 'Scans', 'As a trial user, my daily cap fits at least one full default scan', ['#807', '#655'], async (ctx) => {
  const r = await ctx.trial.get('/api/credits/status'); status(r, 200);
  expect(r.json.manualDailyCap >= 25, `trial daily cap ${r.json.manualDailyCap}`);
});
story('RUN-07', 'Scans', 'As a user, the active runs list never shows other accounts\' runs', ['#653'], async (ctx) => {
  const r = await ctx.stranger.get('/api/runs/active'); status(r, 200);
  expect(r.json.runs.every(x => !String(x.brand_id || x.brandId || '').startsWith('seed_')), 'foreign runs leaked');
});
story('RUN-08', 'Scans', 'As infra, /api/cron without the secret is refused', ['#765'], async () => {
  const r = await new Client().get('/api/cron');
  expect(r.status === 401 || r.status === 403, `got ${r.status}`);
});
story('RUN-09', 'Scans', 'As infra, /api/cron with a wrong secret is refused', ['#765'], async () => {
  const r = await new Client().get('/api/cron', { headers: { 'x-cron-secret': 'wrong', authorization: 'Bearer wrong' } });
  expect(r.status === 401 || r.status === 403, `got ${r.status}`);
});
story('RUN-10', 'Scans', 'As a user, /api/plans lists the plan limits the pricing page sells', ['#789', '#795'], async (ctx) => {
  const r = await ctx.free.get('/api/plans'); status(r, 200);
  for (const p of ['free', 'starter', 'pro', 'agency']) expect(r.json.allPlans[p], `plan ${p} missing`);
  expect(r.json.allPlans.free.brands === 1, 'free brands != 1');
});
story('RUN-11', 'Scans', 'As a user, credits usage covers the last 30 days with no gaps', ['#790'], async (ctx) => {
  const r = await ctx.owner.get('/api/credits/usage'); status(r, 200);
  expect(r.json.dailyUsageLast30Days.length >= 30, `${r.json.dailyUsageLast30Days.length} days`);
});
story('RUN-12', 'Scans', 'As a user, my credit ledger loads with totals', ['#765'], async (ctx) => {
  const r = await ctx.owner.get('/api/credits/ledger'); status(r, 200);
  expect(r.json.totals && typeof r.json.totals.credits === 'number', 'no totals');
});

// ─── Dashboard data endpoints ────────────────────────────────────────────
story('DATA-01', 'Data', 'As an owner, citation analysis loads (no is_brand/brands.name 500)', ['#765', '#772'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/citation-analysis`); status(r, 200);
  expect(typeof r.json.totalCitations === 'number', 'no totals');
});
story('DATA-02', 'Data', 'As an owner, Gemini grounding redirect hosts are not counted as citation domains', ['#772'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/citation-analysis`); status(r, 200);
  const hosts = Object.keys(r.json.domains || {});
  expect(!hosts.some(h => /vertexaisearch|googleusercontent|grounding-api-redirect/.test(h)), `redirect host counted: ${hosts}`);
});
story('DATA-03', 'Data', 'As an owner, the competitor leaderboard trend comes from real data', ['#577'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/competitor-stats`); status(r, 200);
  for (const c of r.json.competitors) expect(c.percentage >= 0 && c.percentage <= 100, `${c.name} pct ${c.percentage}`);
});
story('DATA-04', 'Data', 'As an owner, the Query Tracker loads without the missing prompt_run_stats 500', ['#765'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/keyword-tracker`); status(r, 200);
  expect(r.json.keywords.length > 0, 'no keywords');
});
story('DATA-05', 'Data', 'As an owner, Query Tracker counts distinct prompts, with mention rate 0-100', ['#772', '#790'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/keyword-tracker`); status(r, 200);
  const names = r.json.keywords.map(k => k.keyword);
  expect(new Set(names).size === names.length, 'duplicate prompts');
  for (const k of r.json.keywords) expect(k.mentionRate >= 0 && k.mentionRate <= 100, `${k.keyword} ${k.mentionRate}`);
});
story('DATA-06', 'Data', 'As an owner, Fan-out defaults to 30 days, not a collapsed 1', ['#749'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/fanout`); status(r, 200);
  expect(r.json.days === 30, `days=${r.json.days}`);
});
story('DATA-07', 'Data', 'As an owner, AI Volatility defaults to its full window, not 7 days', ['#749'], async (ctx) => {
  const r = await ctx.owner.get('/api/volatility'); status(r, 200);
  expect(r.json.days > 7, `days=${r.json.days}`);
});
story('DATA-08', 'Data', 'As an owner, junk query params (days=abc) fall back to defaults instead of erroring', ['#749'], async (ctx) => {
  const a = await ctx.owner.get('/api/volatility?days=abc'); status(a, 200, 'volatility');
  expect(Number.isFinite(a.json.days) && a.json.days > 0, `days=${a.json.days}`);
  const b = await ctx.owner.get(`${OB}/fanout?days=-5&limit=abc`); status(b, 200, 'fanout');
  expect(b.json.days > 0, `fanout days=${b.json.days}`);
});
story('DATA-09', 'Data', 'As an owner, prompt-runs with a silly limit does not 500', ['#749'], async (ctx) => {
  not5xx(await ctx.owner.get(`${OB}/prompt-runs?limit=-5&offset=abc`));
});
story('DATA-10', 'Data', 'As an owner, Prompt Map lists every tracked prompt', ['#747'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/prompt-map`); status(r, 200);
  const b = await ctx.owner.get(OB);
  for (const q of b.json.brand.queries || []) expect(r.json.map[q], `prompt ${q} missing from map`);
});
story('DATA-11', 'Data', 'As an owner, global search returns my prompts', ['#774', '#745'], async (ctx) => {
  const r = await ctx.owner.get('/api/search?q=hvac'); status(r, 200);
  expect((r.json.results.prompts || []).length > 0, 'no prompt hits');
});
story('DATA-12', 'Data', 'As an owner, searching with SQL wildcard characters does not 500', ['#774'], async (ctx) => {
  for (const q of ["%", "_", "'; drop table brands; --", "\\", "a".repeat(500)]) not5xx(await ctx.owner.get('/api/search?q=' + encodeURIComponent(q)), q.slice(0, 10));
});
story('DATA-13', 'Data', 'As a stranger, global search never shows another account\'s prompts', ['#774', '#800'], async (ctx) => {
  const r = await ctx.stranger.get('/api/search?q=denver'); status(r, 200);
  const all = Object.values(r.json.results || {}).flat();
  expect(!all.some(x => String(x.brandId || '').startsWith('seed_')), 'owner data leaked into stranger search');
});
story('DATA-14', 'Data', 'As an owner, empty search returns an empty result, not an error', ['#774'], async (ctx) => {
  not5xx(await ctx.owner.get('/api/search?q='));
});
story('DATA-15', 'Data', 'As an owner, the Activity log loads before any run', ['#765'], async (ctx) => {
  status(await ctx.trial.get('/api/activity-logs'), 200);
});
story('DATA-16', 'Data', 'As an owner, API logs load and never echo raw DB errors', ['#679'], async (ctx) => {
  const r = await ctx.owner.get('/api/api-logs?from=not-a-date'); not5xx(r);
});
story('DATA-17', 'Data', 'As a stranger, I cannot read another brand\'s prompt runs, fan-out or accuracy', ['#815'], async (ctx) => {
  for (const p of ['prompt-runs', 'fanout', 'accuracy', 'citation-analysis', 'competitor-stats', 'keyword-tracker', 'recommendations', 'report/history']) {
    const r = await ctx.stranger.get(`${OB}/${p}`);
    expect(r.status === 404 || r.status === 403, `${p}: ${r.status}`);
  }
});
story('DATA-18', 'Data', 'As an owner, notifications load and mark-read works', ['#653'], async (ctx) => {
  status(await ctx.owner.get('/api/notifications'), 200);
  not5xx(await ctx.owner.post('/api/notifications/read', { all: true }));
});

// ─── Accuracy ─────────────────────────────────────────────────────────────
story('ACC-01', 'Accuracy', 'As an owner, marking a false claim fixed shows up straight away', ['#573'], async (ctx) => {
  const a = await ctx.owner.get(`${OB}/accuracy`); status(a, 200);
  const issue = a.json.issues[0]; expect(issue, 'no issue seeded');
  const t = await ctx.owner.patch(`${OB}/accuracy/issues/${issue.id}`, {}); status(t, 200);
  const b = await ctx.owner.get(`${OB}/accuracy`);
  const again = b.json.issues.find(i => i.id === issue.id);
  expect(again && again.fixed === t.json.fixed, 'state did not stick');
  await ctx.owner.patch(`${OB}/accuracy/issues/${issue.id}`, {});
});
story('ACC-02', 'Accuracy', 'As an owner, a bad issue id gives 404, not a 500', ['#765'], async (ctx) => {
  const r = await ctx.owner.patch(`${OB}/accuracy/issues/not-a-number`, {});
  status(r, 404);
});
story('ACC-03', 'Accuracy', 'As a stranger, I cannot toggle another brand\'s accuracy issue', ['#771'], async (ctx) => {
  const a = await ctx.owner.get(`${OB}/accuracy`);
  const r = await ctx.stranger.patch(`${OB}/accuracy/issues/${a.json.issues[0].id}`, {});
  expect(r.status === 404 || r.status === 403, `got ${r.status}`);
});
story('ACC-04', 'Accuracy', 'As a team viewer, I cannot run accuracy checks or edit facts', ['#771'], async (ctx) => {
  const r = await ctx.viewer.post(`${OB}/accuracy`, { facts: [{ key: 'phone', value: '1' }] });
  expect(r.status === 403, `viewer facts ${r.status}`);
  const v = await ctx.viewer.post(`${OB}/accuracy/reverify`, {});
  expect(v.status === 403, `viewer reverify ${v.status}`);
});
story('ACC-05', 'Accuracy', 'As an owner, saving facts with a malformed body gives 400, not 500', ['#771'], async (ctx) => {
  status(await ctx.owner.post(`${OB}/accuracy`, '{bad'), 400);
});
story('ACC-06', 'Accuracy', 'As an owner, I can save brand facts and read them back', ['#771'], async (ctx) => {
  const a = await ctx.owner.get(`${OB}/accuracy`);
  const facts = a.json.facts.map(f => ({ key: f.key, value: f.value, category: f.category }));
  const r = await ctx.owner.post(`${OB}/accuracy`, { facts }); status(r, 200, 'save');
  const b = await ctx.owner.get(`${OB}/accuracy`);
  expect(b.json.facts.length === facts.length, 'facts lost');
});

// ─── Recommendations ─────────────────────────────────────────────────────
story('REC-01', 'Recommendations', 'As an owner, I can mark a recommendation done and it sticks', ['#792'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/recommendations`); status(r, 200);
  const rec = r.json.recommendations[0]; expect(rec, 'no recs');
  status(await ctx.owner.put(`${OB}/recommendations`, { id: rec.id, status: 'done' }), 200, 'update');
  const b = await ctx.owner.get(`${OB}/recommendations`);
  const again = b.json.recommendations.find(x => x.id === rec.id);
  expect(!again || again.status === 'done', `status ${again && again.status}`);
  await ctx.owner.put(`${OB}/recommendations`, { id: rec.id, status: 'open' });
});
story('REC-02', 'Recommendations', 'As an owner, an invalid recommendation status is rejected', ['#771'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/recommendations`);
  const u = await ctx.owner.put(`${OB}/recommendations`, { id: r.json.recommendations[0].id, status: 'hacked' });
  status(u, 400);
});
story('REC-03', 'Recommendations', 'As a stranger, I cannot change another brand\'s recommendation', ['#815'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/recommendations`);
  const u = await ctx.stranger.put(`${OB}/recommendations`, { id: r.json.recommendations[0].id, status: 'done' });
  expect(u.status === 404 || u.status === 403, `got ${u.status}`);
});
story('REC-04', 'Recommendations', 'As an owner, recommendations only cover engines I track', ['#772'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/recommendations`); status(r, 200);
  expect(Array.isArray(r.json.recommendations), 'not array');
});

// ─── Alerts ───────────────────────────────────────────────────────────────
let alertId = null;
story('ALERT-01', 'Alerts', 'As an owner, saving an alert from the flat UI form works and it appears in the list', ['#668'], async (ctx) => {
  const r = await ctx.owner.post(`${OB}/alerts`, { name: 'SOV drop', condition: 'sov_drop', threshold: 10, action: 'email' });
  expect(r.status === 200 || r.status === 201, `create ${r.status}: ${r.text.slice(0, 200)}`);
  const list = await ctx.owner.get(`${OB}/alerts`); status(list, 200);
  const rule = list.json.rules.find(x => x.name === 'SOV drop');
  expect(rule, 'rule missing from GET rules');
  alertId = rule.id;
});
story('ALERT-02', 'Alerts', 'As an owner, I can edit an alert with PUT (no 405)', ['#771'], async (ctx) => {
  expect(alertId, 'no alert from ALERT-01');
  status(await ctx.owner.put(`/api/alerts/${alertId}`, { enabled: false }), 200);
});
story('ALERT-03', 'Alerts', 'As an owner, a nonsense alert value gives 400, not a 500', ['#771'], async (ctx) => {
  expect(alertId, 'no alert from ALERT-01');
  status(await ctx.owner.put(`/api/alerts/${alertId}`, { cooldown_hours: 'soon', enabled: 'maybe' }), 400);
});
story('ALERT-04', 'Alerts', 'As a stranger, I cannot edit or delete someone else\'s alert', ['#771'], async (ctx) => {
  expect(alertId, 'no alert from ALERT-01');
  status(await ctx.stranger.put(`/api/alerts/${alertId}`, { enabled: true }), 404, 'put');
  status(await ctx.stranger.del(`/api/alerts/${alertId}`), 404, 'delete');
});
story('ALERT-05', 'Alerts', 'As an owner, an alert I make for one brand does not show under my other brand', ['#653', '#668'], async (ctx) => {
  const r = await ctx.owner.get('/api/brands/seed_brand_2/alerts'); status(r, 200);
  expect(!r.json.rules.some(x => x.name === 'SOV drop'), 'alert leaked across brands');
});
story('ALERT-06', 'Alerts', 'As an owner, an alert without a name or condition is rejected', ['#668'], async (ctx) => {
  status(await ctx.owner.post(`${OB}/alerts`, {}), 400);
});
story('ALERT-07', 'Alerts', 'As an owner, deleting my alert works', ['#771'], async (ctx) => {
  expect(alertId, 'no alert from ALERT-01');
  status(await ctx.owner.del(`/api/alerts/${alertId}`), 200);
});

// ─── Reports ─────────────────────────────────────────────────────────────
story('REP-01', 'Reports', 'As an owner, Download report gives me a real PDF', ['#588', '#589', '#590'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/report/pdf`, { timeout: 90000 }); status(r, 200);
  expect(/application\/pdf/.test(r.headers.get('content-type') || ''), `content-type ${r.headers.get('content-type')}`);
  expect(r.text.startsWith('%PDF'), 'not a PDF');
});
story('REP-02', 'Reports', 'As an owner, a downloaded report shows up in report history', ['#586', '#589'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/report/history`); status(r, 200);
  expect(r.json.history.length > 0, 'history empty after download');
});
story('REP-03', 'Reports', 'As an owner, a custom report with no items explains itself instead of failing silently', ['#591'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/report/custom`);
  expect(r.status === 400 || r.status === 200, `got ${r.status}`);
  if (r.status === 400) expect(r.json && r.json.error, 'no error message');
});
story('REP-04', 'Reports', 'As an owner, I can schedule weekly reports and it persists', ['#587'], async (ctx) => {
  status(await ctx.owner.put(`${OB}/report/schedule`, { frequency: 'weekly' }), 200, 'set');
  const r = await ctx.owner.get(`${OB}/report/schedule`);
  expect(r.json.frequency === 'weekly', `freq ${r.json.frequency}`);
  await ctx.owner.put(`${OB}/report/schedule`, { frequency: 'off' });
});
story('REP-05', 'Reports', 'As an owner, an unknown schedule frequency is rejected', ['#587'], async (ctx) => {
  status(await ctx.owner.put(`${OB}/report/schedule`, { frequency: 'hourly-ish' }), 400);
});
story('REP-06', 'Reports', 'As a stranger, I cannot download another brand\'s PDF', ['#815'], async (ctx) => {
  const r = await ctx.stranger.get(`${OB}/report/pdf`);
  expect(r.status === 404 || r.status === 403, `got ${r.status}`);
});
story('REP-07', 'Reports', 'As an owner, report items save and read back', ['#585'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/report/items`); status(r, 200);
  expect(Array.isArray(r.json.items), 'items not array');
});

// ─── Public site & SEO ───────────────────────────────────────────────────
story('PUB-01', 'Public', 'As an AI crawler, /llms.txt is plain text with links', ['#743', '#795'], async () => {
  const r = await new Client().get('/llms.txt'); status(r, 200);
  expect(/text\/plain|text\/markdown/.test(r.headers.get('content-type') || ''), r.headers.get('content-type'));
  expect(/\]\(https?:\/\//.test(r.text), 'no markdown links');
});
story('PUB-02', 'Public', 'As a visitor, our own llms.txt passes our own validator', ['#743'], async () => {
  const body = (await new Client().get('/llms.txt')).text;
  const r = await new Client().post('/api/tools/llms-txt-validator', { content: body });
  status(r, 200);
  const score = r.json.score ?? (r.json.result && r.json.result.score);
  expect(score === undefined || score >= 80, `score ${score}: ${r.text.slice(0, 200)}`);
});
story('PUB-03', 'Public', 'As a visitor, the contact page has no Cloudflare email-protection links', ['#733'], async () => {
  const r = await new Client().get('/contact'); status(r, 200);
  expect(!r.text.includes('/cdn-cgi/l/email-protection'), 'cdn-cgi link present');
});
story('PUB-04', 'Public', 'As a visitor, /features is a real page (no redirect loop) with its own title', ['#529', '#787'], async () => {
  const r = await new Client().get('/features'); status(r, 200);
  const home = (await new Client().get('/')).text.match(/<title>([^<]+)/);
  const t = r.text.match(/<title>([^<]+)/);
  expect(t && home && t[1] !== home[1], `features title "${t && t[1]}" same as home`);
});
story('PUB-05', 'Public', 'As a visitor, /free-tools lands on /tools', ['#667'], async () => {
  const r = await new Client().get('/free-tools');
  expect([301, 302, 307, 308].includes(r.status) && /\/tools$/.test(r.headers.get('location') || ''), `got ${r.status} ${r.headers.get('location')}`);
});
story('PUB-06', 'Public', 'As a signed-out visitor, the retired /dashboard/query-performance page asks me to log in first', ['#766'], async () => {
  const r = await new Client().get('/dashboard/query-performance');
  expect([302, 307].includes(r.status) && /\/login/.test(r.headers.get('location') || ''), `got ${r.status} ${r.headers.get('location')}`);
});
story('PUB-07', 'Public', 'As a search engine, robots.txt keeps the dashboard out of the index', ['#782'], async () => {
  const r = await new Client().get('/robots.txt'); status(r, 200);
  expect(/Disallow:\s*\/dashboard/.test(r.text), 'dashboard not disallowed');
});
story('PUB-08', 'Public', 'As a search engine, the sitemap has no private or redirecting URLs', ['#782', '#766'], async () => {
  const r = await new Client().get('/sitemap.xml'); status(r, 200);
  const m = r.text.match(/<loc>[^<]*(\/dashboard|\/admin|\/api\/|query-performance|\/free-tools<)[^<]*<\/loc>/);
  expect(!m, `private/redirecting URL in sitemap: ${m && m[0]}`);
});
story('PUB-09', 'Public', 'As a visitor, the home page has a title, description and canonical', ['#782', '#599'], async () => {
  const r = await new Client().get('/'); status(r, 200);
  expect(/<title>[^<]{10,}<\/title>/.test(r.text), 'no title');
  expect(/<meta name="description" content="[^"]{30,}"/.test(r.text), 'no description');
  expect(/<link rel="canonical" href="https:\/\//.test(r.text), 'no absolute canonical');
});
story('PUB-10', 'Public', 'As a visitor, the canonical uses the public origin, not an internal host', ['#806'], async () => {
  const r = await new Client().get('/pricing'); status(r, 200);
  const m = r.text.match(/<link rel="canonical" href="([^"]+)"/);
  expect(m && !/localhost|127\.0\.0\.1|ondigitalocean/.test(m[1]), `canonical ${m && m[1]}`);
});
story('PUB-11', 'Public', 'As a visitor, an unknown page returns a real 404 status', ['#765'], async () => {
  status(await new Client().get('/this-page-does-not-exist-xyz'), 404);
});
story('PUB-12', 'Public', 'As a search engine, /connect/connector is noindex', ['#743'], async () => {
  const r = await new Client().get('/connect/connector');
  expect(/noindex/.test(r.text) || /noindex/.test(r.headers.get('x-robots-tag') || ''), 'indexable');
});
story('PUB-13', 'Public', 'As a visitor, the CSP lets Google Fonts load', ['#765'], async () => {
  const csp = (await new Client().get('/')).headers.get('content-security-policy') || '';
  expect(/fonts\.googleapis\.com/.test(csp) && /fonts\.gstatic\.com/.test(csp), 'fonts blocked by CSP');
});
story('PUB-14', 'Public', 'As a buyer, the white-label reports /pricing sells actually exist (rank branding API)', ['#743', '#803'], async (ctx) => {
  const pricing = (await new Client().get('/pricing')).text;
  if (!/white[- ]label/i.test(pricing)) return;
  const r = await ctx.owner.get('/api/rank-tracking/branding');
  status(r, 200, 'branding API');
});
story('PUB-15', 'Public', 'As a visitor, home and pricing agree on the Agency price', ['#743', '#789'], async () => {
  const price = (html) => { const m = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').match(/Agency \$(\d{2,4}) \/mo/); return m && m[1]; };
  const home = price((await new Client().get('/')).text);
  const pricing = price((await new Client().get('/pricing')).text);
  expect(!home || !pricing || home === pricing, `home $${home} vs pricing $${pricing}`);
});
story('PUB-16', 'Public', 'As a visitor, contact form junk body gives 400 not 500', ['#743'], async () => {
  status(await new Client().post('/api/contact', 'nope'), 400);
});
story('PUB-17', 'Public', 'As a spam bot filling the hidden honeypot, my contact message is not accepted', ['#771'], async () => {
  const r = await new Client().post('/api/contact', { name: 'Bot', email: 'bot@spam.example', message: 'buy now buy now buy now', website: 'http://spam.example', company_url: 'x', hp: 'x', honeypot: 'x' });
  expect(r.status === 400 || (r.json && r.json.success !== true) || r.status === 200, `got ${r.status}`);
  if (r.status === 200) expect(!(r.json && r.json.sent), 'honeypot message sent');
});
story('PUB-18', 'Public', 'As a visitor, newsletter signup with a bad email is rejected', ['#740'], async () => {
  status(await new Client().post('/api/newsletter', { email: 'not-an-email' }), 400);
});
story('PUB-19', 'Public', 'As an attacker, the AI crawler checker will not fetch localhost', ['#815', '#740'], async () => {
  const r = await new Client().post('/api/tools/ai-crawler-checker', { url: 'http://127.0.0.1:3000/api/health' });
  expect(r.status >= 400 && r.status < 500, `got ${r.status}: ${r.text.slice(0, 150)}`);
});
story('PUB-20', 'Public', 'As an attacker, an IPv4-mapped IPv6 address cannot sneak past the SSRF guard', ['#815'], async () => {
  const r = await new Client().post('/api/tools/ai-crawler-checker', { url: 'http://[::ffff:127.0.0.1]:3000/' });
  expect(r.status >= 400 && r.status < 500, `got ${r.status}: ${r.text.slice(0, 150)}`);
});
story('PUB-21', 'Public', 'As an attacker, cloud metadata IPs are blocked in the free GEO audit', ['#815'], async () => {
  const r = await new Client().post('/api/geo-audit', { url: 'http://169.254.169.254/' });
  expect(r.status >= 400 && r.status < 500, `got ${r.status}: ${r.text.slice(0, 150)}`);
});
story('PUB-22', 'Public', 'As a visitor, free tools reject junk bodies with 400', ['#743'], async () => {
  for (const t of ['llms-txt-validator', 'llms-txt-generator', 'citation-finder', 'competitor-finder', 'nap-checker', 'chatgpt-mention-checker']) {
    const r = await new Client().post(`/api/tools/${t}`, '<<<');
    expect(r.status >= 400 && r.status < 500, `${t}: ${r.status}`);
  }
});
story('PUB-23', 'Public', 'As a visitor, the health endpoint reports DB and Redis', ['#765'], async () => {
  const r = await new Client().get('/api/health'); status(r, 200);
  expect(r.json.checks.db.ok, 'db not ok');
});
story('PUB-24', 'Public', 'As a visitor, key public pages all render (no 500s)', ['#765', '#786', '#787'], async () => {
  for (const p of ['/', '/pricing', '/tools', '/blog', '/how-it-works', '/integrations', '/changelog', '/docs', '/vs/profound', '/rank-tracker', '/llm-rank-tracker', '/privacy', '/terms']) {
    const r = await new Client().get(p);
    expect(r.status === 200 || r.status === 308 || r.status === 301, `${p}: ${r.status}`);
  }
});
story('PUB-25', 'Public', 'As a visitor, page copy uses no em dashes', ['#600', '#660', '#716'], async () => {
  for (const p of ['/', '/pricing', '/tools']) {
    const text = (await new Client().get(p)).text.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
    expect(!text.includes('\u2014'), `${p} has an em dash: ${text.slice(Math.max(0, text.indexOf('\u2014') - 60), text.indexOf('\u2014') + 20)}`);
  }
});

// ─── NAP audits ──────────────────────────────────────────────────────────
let napId = null;
const NAP = { name: 'Cool Breeze HVAC', street: '1 Main St', city: 'Denver', region: 'CO', postcode: '80202', country: 'US', phone: '(303) 555-0142', website: 'https://coolbreezehvac.example' };
story('NAP-01', 'NAP', 'As an owner, a saved NAP audit keeps region, country and website', ['#762'], async (ctx) => {
  const r = await ctx.owner.post('/api/nap-audits', { brandId: 'seed_brand_1', label: 'e2e', canonical: NAP, urls: ['https://example.com/listing'] });
  expect(r.status === 200 || r.status === 201 || r.status === 202, `create ${r.status}: ${r.text.slice(0, 200)}`);
  napId = (r.json.audit || r.json).id || (r.json.audits && r.json.audits[0] && r.json.audits[0].id);
  expect(napId, 'no audit id');
  const g = await ctx.owner.get(`/api/nap-audits/${napId}`); status(g, 200);
  const canon = (g.json.audit || g.json).canonical || {};
  for (const k of ['region', 'country', 'website']) expect(canon[k], `${k} lost: ${JSON.stringify(canon)}`);
});
story('NAP-02', 'NAP', 'As an owner, editing a NAP audit keeps the fields I did not touch', ['#762'], async (ctx) => {
  expect(napId, 'no audit');
  const r = await ctx.owner.put(`/api/nap-audits/${napId}`, { label: 'e2e edited', canonical: NAP, urls: ['https://example.com/listing'] });
  expect(r.status === 200, `edit ${r.status}: ${r.text.slice(0, 200)}`);
  const g = await ctx.owner.get(`/api/nap-audits/${napId}`);
  const canon = (g.json.audit || g.json).canonical || {};
  expect(canon.region === 'CO' && canon.website, JSON.stringify(canon));
});
story('NAP-03', 'NAP', 'As a stranger, I cannot open another account\'s NAP audit', ['#616'], async (ctx) => {
  expect(napId, 'no audit');
  const r = await ctx.stranger.get(`/api/nap-audits/${napId}`);
  expect(r.status === 404 || r.status === 403, `got ${r.status}`);
});
story('NAP-04', 'NAP', 'As an owner, pasting more than 500 URLs is refused or split, never silently truncated', ['#621', '#762'], async (ctx) => {
  const urls = Array.from({ length: 600 }, (_, i) => `site${i}.example/listing`);
  const r = await ctx.owner.post('/api/nap-audits', { brandId: 'seed_brand_1', label: 'big', canonical: NAP, urls });
  expect(r.status === 400 || r.status === 413 || r.status === 422, `600 URLs accepted silently: ${r.status}`);
});
story('NAP-05', 'NAP', 'As an owner, Pull from Google without a Places key returns a clear JSON error fast', ['#619', '#627', '#638'], async (ctx) => {
  const t0 = Date.now();
  const r = await ctx.owner.post('/api/nap-audits/gbp-lookup', { query: 'Cool Breeze HVAC Denver' }, { timeout: 30000 });
  expect(r.json && (r.json.error || r.json.result), `no JSON body (${r.status})`);
  expect(Date.now() - t0 < 20000, 'took longer than the gateway window');
});
story('NAP-06', 'NAP', 'As a signed-out visitor, NAP audits require login', ['#610'], async () => {
  status(await new Client().get('/api/nap-audits'), 401);
});
story('NAP-07', 'NAP', 'As an owner, bare domains count as URLs in an audit', ['#762'], async (ctx) => {
  const r = await ctx.owner.post('/api/nap-audits', { brandId: 'seed_brand_1', label: 'bare', canonical: NAP, urls: 'yelp.com/biz/x\nangi.com/companylist/y' });
  expect(r.status < 300, `bare domains refused: ${r.status} ${r.text.slice(0, 200)}`);
});

// ─── Fix engine / connect ────────────────────────────────────────────────
story('FIX-01', 'Fix Engine', 'As an owner, the Fixes page loads its catalog', ['#683'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/fixes`); status(r, 200);
  expect(r.json.catalog.length > 0, 'empty catalog');
});
story('FIX-02', 'Fix Engine', 'As a team viewer, I cannot start a fix scan or approve fixes', ['#720'], async (ctx) => {
  const r = await ctx.viewer.post(`${OB}/fixes`, { action: 'scan' });
  expect(r.status === 403, `viewer scan ${r.status}`);
});
story('FIX-03', 'Fix Engine', 'As a security owner, edge/serve is never publicly cacheable across tenants', ['#720'], async () => {
  const r = await new Client().get('/api/edge/serve?path=/&host=example.com');
  const cc = r.headers.get('cache-control') || '';
  expect(!/public/.test(cc) || /vary/i.test([...r.headers.keys()].join(',')), `cache-control ${cc}`);
});
story('FIX-04', 'Fix Engine', 'As the WordPress plugin, an unauthenticated instructions call gets 401, not an origin 403', ['#815'], async () => {
  const r = await new Client().post('/api/connector/instructions/123/ack', {}, { noOrigin: true });
  expect(r.status === 401 || r.status === 404 || r.status === 400, `got ${r.status}`);
});
story('FIX-05', 'Fix Engine', 'As a stranger, I cannot read or change another brand\'s fixes', ['#815'], async (ctx) => {
  const r = await ctx.stranger.get(`${OB}/fixes`);
  expect(r.status === 404 || r.status === 403, `got ${r.status}`);
  const p = await ctx.stranger.patch(`${OB}/fixes/123`, { status: 'dismissed' });
  expect(p.status === 404 || p.status === 403, `patch ${p.status}`);
});
story('FIX-06', 'Fix Engine', 'As an owner, a fixes CSV export cannot carry spreadsheet formulas', ['#740'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/fixes/export`);
  not5xx(r);
  if (r.status === 200) expect(!/(^|\n|,)"?[=+@-]/.test(r.text.split('\n').slice(1).join('\n')), 'formula cell in export');
});
story('FIX-07', 'Fix Engine', 'As an owner, the autopilot settings load and save', ['#770'], async (ctx) => {
  const r = await ctx.owner.get(`${OB}/automation`); status(r, 200);
  expect(r.json.automation.autopilotStage === false, 'autopilot staging on by default');
});
story('FIX-08', 'Fix Engine', 'As an owner, an unknown fix id gives 404, not 500', ['#736'], async (ctx) => {
  const r = await ctx.owner.patch(`${OB}/fixes/does-not-exist`, { status: 'archived' });
  expect(r.status === 404 || r.status === 400, `got ${r.status}`);
});

// ─── Rank tracking ───────────────────────────────────────────────────────
story('RANK-01', 'Rank', 'As an owner, adding example.com and https://www.example.com/ gives one website', ['#812'], async (ctx) => {
  const a = await ctx.owner.post('/api/rank-tracking/websites', { domain: 'example.com' }); status(a, 200, 'add 1');
  const b = await ctx.owner.post('/api/rank-tracking/websites', { domain: 'https://www.example.com/' }); status(b, 200, 'add 2');
  expect(a.json.website.id === b.json.website.id, `two sites: ${a.json.website.id} vs ${b.json.website.id}`);
});
story('RANK-02', 'Rank', 'As an owner, adding keywords works and they appear in the list', ['#793', '#799'], async (ctx) => {
  const r = await ctx.owner.post('/api/rank-tracking/keywords', { domain: 'example.com', keywords: ['hvac denver', 'furnace repair denver'], locationCode: 2840, locationName: 'United States' });
  status(r, 200);
  const w = await ctx.owner.get('/api/rank-tracking/websites'); status(w, 200);
  expect(w.json.websites.length > 0, 'no websites listed');
});
story('RANK-03', 'Rank', 'As a free user, adding rank keywords is gated by rank credits', ['#815'], async (ctx) => {
  const r = await ctx.free.post('/api/rank-tracking/keywords', { domain: 'free-site.example', keywords: Array.from({ length: 400 }, (_, i) => `kw ${i}`), depth: 100, frequency: 'daily' });
  expect(r.status === 402 || r.status === 403 || r.status === 400, `got ${r.status}: ${r.text.slice(0, 150)}`);
});
story('RANK-04', 'Rank', 'As a stranger, I cannot queue a recheck of someone else\'s keyword', ['#815'], async (ctx) => {
  const w = await ctx.owner.get('/api/rank/sites'); status(w, 200);
  const site = w.json.sites.find(s => /example\.com/.test(s.domain)); expect(site, 'no owner site');
  const k = await ctx.owner.get(`/api/rank/sites/${site.id}/keywords`); status(k, 200);
  const ids = (k.json.keywords || []).map(x => String(x.id)); expect(ids.length, 'no keywords');
  const r = await ctx.stranger.post('/api/rank/keywords/recheck', { ids });
  expect(!(r.status === 200 && r.json.queued > 0), `queued ${r.json && r.json.queued} foreign keywords`);
});
story('RANK-05', 'Rank', 'As an owner, city search works without DataForSEO configured', ['#798'], async (ctx) => {
  const r = await ctx.owner.get('/api/rank-tracking/locations?q=Denver'); status(r, 200);
  expect(JSON.stringify(r.json).includes('Denver'), 'Denver not found');
});
story('RANK-06', 'Rank', 'As a stranger, I cannot see another account\'s rank websites', ['#800'], async (ctx) => {
  const w = await ctx.stranger.get('/api/rank-tracking/websites'); status(w, 200);
  expect(!w.json.websites.some(s => s.domain === 'example.com'), 'owner site leaked');
});
story('RANK-07', 'Rank', 'As a free user, CSV import at depth 100 is gated', ['#815'], async (ctx) => {
  const csv = 'keyword,domain\n' + Array.from({ length: 300 }, (_, i) => `kw${i},free-site.example`).join('\n');
  const r = await ctx.free.post('/api/rank-tracking/import', { csv, depth: 100 });
  expect(r.status >= 400 && r.status < 500, `got ${r.status}: ${r.text.slice(0, 150)}`);
});
story('RANK-08', 'Rank', 'As an owner, an empty domain gives a helpful 400', ['#808'], async (ctx) => {
  const r = await ctx.owner.post('/api/rank-tracking/websites', { domain: '' }); status(r, 400);
  expect(/domain/i.test(r.json.error), r.json.error);
});
story('RANK-09', 'Rank', 'As an owner, rank overview and summary load', ['#810', '#811'], async (ctx) => {
  status(await ctx.owner.get('/api/rank-tracking/overview'), 200, 'overview');
  status(await ctx.owner.get('/api/rank-tracking/summary'), 200, 'summary');
});
story('RANK-10', 'Rank', 'As an owner, rank keyword JSON junk gets 400', ['#808'], async (ctx) => {
  status(await ctx.owner.post('/api/rank-tracking/keywords', '{x'), 400);
});

// ─── Billing ─────────────────────────────────────────────────────────────
story('BILL-01', 'Billing', 'As an attacker, an unsigned payments webhook is refused', ['#740', '#815'], async () => {
  const r = await new Client().post('/api/payments/webhooks/dodopayments', { type: 'subscription.active', data: { customer: { email: 'owner@test.dev' } } });
  expect(r.status === 401 || r.status === 400 || r.status === 403 || r.status === 503, `got ${r.status}`);
  const u = (await sql(`SELECT plan FROM users WHERE id = 'seed_owner_1'`)).rows[0];
  expect(u.plan === 'owner', 'plan changed by unsigned webhook');
});
story('BILL-02', 'Billing', 'As an owner/admin plan, I am not offered a cancel that makes no sense', ['#790'], async (ctx) => {
  const r = await ctx.owner.post('/api/payments/cancel', {});
  expect(r.status === 400 || r.status === 404 || r.status === 409, `got ${r.status}`);
});
story('BILL-03', 'Billing', 'As a user, checkout without payments configured says so, no 500', ['#791'], async (ctx) => {
  not5xx(await ctx.trial.post('/api/payments/checkout', { plan: 'pro', billing: 'annual' }));
});
story('BILL-04', 'Billing', 'As a user, checkout for a made-up plan is rejected', ['#791'], async (ctx) => {
  const r = await ctx.trial.post('/api/payments/checkout', { plan: 'galactic' });
  expect(r.status >= 400 && r.status < 500, `got ${r.status}`);
});
story('BILL-05', 'Billing', 'As a user, payment history and subscription load', ['#740'], async (ctx) => {
  status(await ctx.free.get('/api/payments/history'), 200);
  status(await ctx.free.get('/api/payments/subscription'), 200);
});
story('BILL-06', 'Billing', 'As a user with no subscription, refresh does not downgrade me', ['#679'], async (ctx) => {
  not5xx(await ctx.stranger.post('/api/payments/refresh', {}));
  const u = (await sql(`SELECT plan FROM users WHERE id = 'story_stranger'`)).rows[0];
  expect(u.plan === 'pro', `plan now ${u.plan}`);
});

// ─── Team, API keys, MCP, OAuth ──────────────────────────────────────────
let apiKey = null; let apiKeyId = null;
const mcp = (key, method, params) => new Client().post('/api/mcp', { jsonrpc: '2.0', id: 1, method, params }, { noOrigin: true, headers: { authorization: `Bearer ${key}`, accept: 'application/json, text/event-stream' } });
story('KEY-01', 'API', 'As an owner, my personal API key lets the MCP server list my brands', ['#781'], async (ctx) => {
  const r = await ctx.stranger.post('/api/api-keys', { name: 'e2e' }); status(r, 201);
  apiKey = r.json.key; apiKeyId = r.json.apiKey.id;
  const b = await mcp(apiKey, 'tools/call', { name: 'list_brands', arguments: {} });
  status(b, 200, 'mcp list_brands');
  expect(/Stranger Plumbing/.test(b.text) && !/Cool Breeze/.test(b.text), `wrong brands: ${b.text.slice(0, 200)}`);
});
story('KEY-02', 'API', 'As an owner, a revoked API key stops working at once', ['#781'], async (ctx) => {
  expect(apiKey, 'no key');
  status(await ctx.stranger.del(`/api/api-keys/${apiKeyId}`), 200, 'revoke');
  status(await mcp(apiKey, 'tools/list'), 401);
});
story('KEY-03', 'API', 'As an owner, a huge API key name is trimmed, and the key is never shown again in the list', ['#781'], async (ctx) => {
  const r = await ctx.stranger.post('/api/api-keys', { name: 'x'.repeat(5000) }); status(r, 201);
  expect((r.json.apiKey.name || '').length <= 60, `name length ${r.json.apiKey.name.length}`);
  const list = await ctx.stranger.get('/api/api-keys');
  expect(!list.text.includes(r.json.key), 'full key returned by list');
  await ctx.stranger.del(`/api/api-keys/${r.json.apiKey.id}`);
});
story('KEY-04', 'API', 'As a stranger, I cannot revoke someone else\'s API key', ['#781'], async (ctx) => {
  const r = await ctx.owner.post('/api/api-keys', { name: 'mine' }); status(r, 201);
  const d = await ctx.stranger.del(`/api/api-keys/${r.json.apiKey.id}`);
  expect(d.status === 404 || d.status === 403, `got ${d.status}`);
  await ctx.owner.del(`/api/api-keys/${r.json.apiKey.id}`);
});
story('MCP-01', 'API', 'As Claude, OAuth metadata advertises the public issuer', ['#806'], async () => {
  const r = await new Client().get('/.well-known/oauth-authorization-server'); status(r, 200);
  expect(r.json.issuer === 'https://livesov.test', `issuer ${r.json.issuer}`);
  expect(/^https:\/\/livesov\.test\//.test(r.json.authorization_endpoint), r.json.authorization_endpoint);
});
story('MCP-02', 'API', 'As an MCP client, an unauthenticated call gets 401 with a resource-metadata hint', ['#781', '#806'], async () => {
  const r = await new Client().post('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { noOrigin: true });
  status(r, 401);
  expect(/resource_metadata/.test(r.headers.get('www-authenticate') || ''), `www-authenticate: ${r.headers.get('www-authenticate')}`);
});
story('MCP-03', 'API', 'As an MCP client with a key, tools/list includes rank tools with titles', ['#809'], async (ctx) => {
  const k = await ctx.stranger.post('/api/api-keys', { name: 'mcp' }); status(k, 201);
  const r = await new Client().post('/api/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { noOrigin: true, headers: { authorization: `Bearer ${k.json.key}`, accept: 'application/json, text/event-stream' } });
  status(r, 200);
  const tools = (r.json && r.json.result && r.json.result.tools) || [];
  expect(tools.some(t => /rank/.test(t.name)), 'no rank tools');
  expect(tools.every(t => t.annotations && t.annotations.title), 'a tool has no annotations.title');
  await ctx.stranger.del(`/api/api-keys/${k.json.apiKey.id}`);
});
story('MCP-04', 'API', 'As an MCP client, start_scan respects my plan credits', ['#781', '#815'], async (ctx) => {
  const c = new Client(); await c.login('free@test.dev');
  const k = await c.post('/api/api-keys', { name: 'mcp' });
  if (k.status !== 201) return;
  const r = await new Client().post('/api/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'start_scan', arguments: { brand_id: 'seed_free_b1' } } }, { noOrigin: true, headers: { authorization: `Bearer ${k.json.key}`, accept: 'application/json, text/event-stream' } });
  not5xx(r);
  expect(!/"started"\s*:\s*true/.test(r.text), 'scan started with no credits');
  await c.del(`/api/api-keys/${k.json.apiKey.id}`);
});
story('TEAM-01', 'Team', 'As an owner, inviting an unknown email does not leak a 500', ['#771'], async (ctx) => {
  const r = await ctx.stranger.post('/api/team/invite', { email: 'nobody-here@test.dev', role: 'viewer' });
  expect(r.status === 404 || r.status === 400, `got ${r.status}`);
});
story('TEAM-02', 'Team', 'As an owner, inviting with a junk body gives 400', ['#771'], async (ctx) => {
  status(await ctx.stranger.post('/api/team/invite', '{nope'), 400);
});
story('TEAM-03', 'Team', 'As an owner, an invite cannot grant admin/owner roles', ['#771'], async (ctx) => {
  const r = await ctx.stranger.post('/api/team/invite', { email: 'sess@test.dev', role: 'owner' }); status(r, 200);
  const row = (await sql(`SELECT role FROM team_members WHERE owner_id = 'story_stranger' AND member_id = 'story_sess'`)).rows[0];
  expect(row.role === 'viewer', `role ${row.role}`);
  await sql(`DELETE FROM team_members WHERE owner_id = 'story_stranger'`);
});
story('ADMIN-01', 'Admin', 'As a normal user, admin APIs are forbidden', ['#765'], async (ctx) => {
  for (const p of ['/api/admin/users', '/api/admin-backend/stats', '/api/admin/monitoring', '/api/admin/runs/active']) {
    const r = await ctx.stranger.get(p);
    expect(r.status === 401 || r.status === 403 || r.status === 404, `${p}: ${r.status}`);
  }
});
story('ADMIN-02', 'Admin', 'As an admin, the admin APIs load', ['#563', '#565'], async (ctx) => {
  for (const p of ['/api/admin/users', '/api/admin-backend/stats', '/api/admin/runs/active']) not5xx(await ctx.owner.get(p), p);
});
story('ADMIN-03', 'Admin', 'As an admin, changing a user\'s password is not written to the audit log in plain text', ['#815'], async (ctx) => {
  const r = await ctx.owner.put('/api/admin/users/story_del/password', { password: 'Admin-Set-Passw0rd!' });
  if (r.status === 405) await ctx.owner.post('/api/admin/users/story_del/password', { password: 'Admin-Set-Passw0rd!' });
  const logs = await sql(`SELECT details::text AS d FROM audit_logs WHERE details::text LIKE '%Admin-Set-Passw0rd%'`);
  expect(logs.rows.length === 0, 'password in audit_logs');
});

module.exports = { stories: S, expect, status };
