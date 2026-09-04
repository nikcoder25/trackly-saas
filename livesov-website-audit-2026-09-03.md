# Livesov.com - Full Website Audit (September 2026)

**Date:** September 3, 2026
**Branch:** `claude/website-audit-fixes-hndxao` (from `main` @ `9140c70`)
**Scope:** The whole app in `trackly-nextjs/` - public marketing/SEO pages, dashboard, admin backend, API routes, auth, engine/cron, and the database bootstrap.
**Method:** Unlike the two earlier audits (June 10 and July 29) this one ran the app, not just read it. A local Postgres 16 was started, the app booted against an empty database, a user was registered and promoted to admin, a brand was created, and a headless Chromium session visited every dashboard and admin page and exercised the public forms (login, signup, password reset, contact, newsletter, free tools). Every sitemap URL and every internal link was crawled. On top of that four focused code reviews (marketing/SEO, dashboard, API/security, engine/cron/billing) re-verified the July findings and looked for new ones. Then `tsc`, the full Vitest suite (2,318 tests) and a production `next build` were run on the fixed code.

The live origin is not reachable from the sandbox, so everything below is verified against the exact code that deploys, running locally.

---

## Executive summary

The July 29 findings are all fixed on `main`. The engine/credit-accounting work, the billing copy, the newsletter form, the SSRF pinning, the CSV escaping: every one of the 32 items re-verified as closed.

Running the app surfaced a different class of problem that reading it could not: things that only break at runtime against a real database. Six dashboard pages returned HTTP 500 for a real brand, a rate limiter logged users out mid-session, and a fresh database could not boot at all. All of it is fixed on this branch.

### What was broken, in priority order

| # | Severity | Area | Issue | Status |
|---|----------|------|-------|--------|
| 1 | **High** | Auth | Every `/api/auth/*` route shared one 10 req/min bucket, including `/api/auth/me`, which the dashboard shell calls on every page load and tab focus. Ten dashboard page loads in a minute produced a 429, the client treated it as signed out, and the user was bounced to `/login`. | Fixed |
| 2 | **High** | Database | The app never creates its core tables (`users`, `brands`, `notifications`, `team_members`, `audit_logs`, `api_logs`, `prompt_runs`, `recommendations`, `alert_rules`, `brand_facts`, `accuracy_issues`, `password_reset_tokens`, `webhook_events`). They came from the Express monolith that was deleted. README says "schema auto-applies on boot"; on a fresh database every request 500'd with `relation "users" does not exist`. Production only works because the tables already exist. | Fixed |
| 3 | **High** | Dashboard | `/dashboard/citations` and `/dashboard/competitors` 500 for every brand: the citation-analysis route selects an `is_brand` column the `citations` table does not have, and its fallback selects `runs`, `name`, `website` columns the `brands` table does not have. | Fixed |
| 4 | **High** | Dashboard | `/dashboard/query-tracker` 500: the keyword-tracker route reads a `prompt_run_stats` table that nothing in the codebase creates. | Fixed |
| 5 | **Med** | Dashboard | `/api/nap-audits` 500 on a cold start: two concurrent first requests both ran `CREATE TABLE IF NOT EXISTS nap_audits`, the loser failed with `pg_type_typname_nsp_index` and the NAP audits list showed an error. Same latent race in `geo_audits`. | Fixed |
| 6 | **Med** | Dashboard | `/dashboard/activity` 500 before the first run: `/api/api-logs` joins `active_runs`, which was only created lazily by the run route. | Fixed |
| 7 | **Med** | Security | The July fix for spoofable `X-Forwarded-For` rate-limit keys (`getClientIp`) was applied to ~35 routes but not to 29 others, including login, register, forgot/reset password, and every anonymous paid AI tool. | Fixed |
| 8 | **Med** | Security | Three brand write routes had no viewer-role gate (`reprocess-competitors`, `recommendations` POST/PUT, `fixes/[fixId]/request-review`). A read-only teammate could rewrite competitor data or spam the review channel. | Fixed |
| 9 | **Med** | Marketing | "All 5 LLMs on every plan" / "included on every plan" on all 15 `/*-alternative` pages, all 11 `/vs/*` pages and Livesov's own roster entry. `PLAN_LIMITS` gives Starter 2 platforms and Pro 3; `/pricing` says so. Also "$39/mo" and "up to 10 competitors" on `/generative-engine-optimization-tool` (real: $9/mo, 3/8/20 by plan), "up to 20 competitors on every plan" (Agency only), and "ten tools that need no signup" (nine). | Fixed |
| 10 | **Med** | Engine | NAP audits stuck in `running` were never reaped and `requeueNapAudit` refused to touch a `running` row, so a deploy mid-audit left it spinning forever. | Fixed |
| 11 | **Low** | Billing UI | Credits ledger and the Google Sheet connector select `brands.name`, which does not exist, so brand names never populated (silently caught). | Fixed |
| 12 | **Low** | Cron | `/api/cron/process-email-outbox` still accepted the secret via `?secret=` (every sibling is header-only). | Fixed |
| 13 | **Low** | Dashboard | Fixes and NAP detail pages `@import` Google Fonts, which the CSP blocked (`style-src`/`font-src`), so they rendered in the system font and logged a violation. | Fixed |
| 14 | **Low** | Dashboard-v2 | Competitor SOV table ranked "You" (mention-rate) against competitors (share of a different pool). | Fixed |
| 15 | **Low** | SEO | `/llm-rank-tracker` was in the sitemap with zero inbound links. `/changelog` declared `weekly` with a last entry from June. | Fixed |
| 16 | **Low** | Dev | A local Postgres without TLS could not connect at all (`sslmode` was ignored and SSL always forced). | Fixed |

### Verified working (no change needed)

* All 195 sitemap URLs and every internal link return 200; the only redirects are the three intended ones (`/home`, `/free-tools`, `/features`) plus auth gating.
* Login (with wrong-password error display), password reset request, contact form, footer newsletter, llms.txt generator, share-of-voice calculator, prompt generator, GEO audit form, 404 page.
* Signup rejects submissions faster than two seconds after load and any filled honeypot (by design); a normal signup succeeds.
* All 41 dashboard and admin-backend pages render without runtime errors once the six 500s above were fixed.
* Every `fetch('/api/...')` in the dashboard maps to a real route with matching method and field names (about 130 call sites checked).
* Every dynamic route awaits `params` (Next 16), every admin route calls `requireAdmin`, by-id access is scoped by `user_id` or team membership, webhooks verify signatures with timestamp tolerance and idempotency, `safeFetch` pins resolved IPs.
* Watchdog vs worker double refund, `/run` reservation leaks, `daily_floor` gate order, cron stagger, hold-vs-cancel webhook handling, annual-price toggle, renewal date, CSV formula escaping: all confirmed fixed from July.

---

## 1. Runtime failures found by driving the app

### 1.1 Auth limiter logged users out (`src/middleware.ts`)
`isAuth = pathname.startsWith('/api/auth/')` put `/api/auth/me`, `/api/auth/refresh`, `/api/auth/sessions` and `/api/auth/2fa/status` in the 10 req/min bucket. `AuthProvider` calls `/api/auth/me` on mount and on every tab focus; on a 429 it fell through to `/api/auth/refresh` (also 429), then `setUser(null)`, and `DashboardLayoutClient` redirected to `/login`. Reproduced in the browser on the tenth page load.

Fix: the tight bucket now covers only credential endpoints (`CREDENTIAL_AUTH_PATHS`: login, register, google, forgot/reset password, verify-email, resend-verification, change-password, 2fa setup/verify/disable). Session plumbing uses the general 100 req/min bucket. `AuthContext` also stops treating a 429, a 5xx or a network failure as "signed out": the existing user state is kept and the next revalidation retries. Regression test: `tests/middleware-auth-rate-limit-scope.test.ts`.

### 1.2 Fresh database cannot boot (`src/lib/db.ts`)
`runMigrations()` only ran `ALTER TABLE users ADD COLUMN IF NOT EXISTS ...` and created the newer tables. The thirteen base tables were reconstructed from every `INSERT`/`SELECT`/`UPDATE` in the codebase and are now created with `CREATE TABLE IF NOT EXISTS` before the ALTERs, along with the indexes the queries rely on and the unique constraints the `ON CONFLICT` clauses need (`users.email`, `team_members(owner_id, member_id)`, `brand_facts(brand_id, fact_key)`, `webhook_events.event_id`). `active_runs` and `brands.first_run_at` are created at boot too. Production is a no-op (all statements are IF NOT EXISTS); a fresh database now boots, registers a user, and serves every page.

### 1.3 Citations / Competitors pages (`src/app/api/brands/[id]/citation-analysis/route.ts`)
`SELECT domain, is_brand ... FROM citations` threw on every call (no such column), was swallowed by a bare `catch`, and returned 500. The fallback path queried `SELECT runs FROM brands` and `SELECT name, website FROM brands`, which also cannot succeed. The route now groups by `domain`, derives "own domain" from the brand's website, reads the JSONB `data` blob for the fallback, and logs the error if it ever fails again.

### 1.4 Query Tracker page (`src/app/api/brands/[id]/keyword-tracker/route.ts`)
`prompt_run_stats` is not created anywhere. The aggregates it provided (runs, mentions, average rank, last run per prompt and platform) are now computed directly from `prompt_runs`.

### 1.5 CREATE TABLE race (`src/lib/schema-once.ts`, `nap-audits.ts`, `geo-audits.ts`)
`CREATE TABLE IF NOT EXISTS` is not atomic across sessions; the dashboard fires the NAP list and the overview tile in parallel, so on a cold start one of them lost and returned 500. A small `schemaOnce()` wrapper de-duplicates in-flight bootstraps per process and retries once on the Postgres "already exists" codes (23505, 42P07, 42710, 42P06). Regression test: `tests/schema-once.test.ts`.

### 1.6 Activity page before the first run (`/api/api-logs`)
Fixed by 1.2 (`active_runs` exists from boot).

## 2. Security

* **Spoofable client IP (29 routes).** Replaced `request.headers.get('x-forwarded-for')?.split(',')[0]` with the shared `getClientIp()` (trusts `do-connecting-ip` / `cf-connecting-ip` / `x-real-ip` first) in every remaining auth, tool, contact, newsletter, admin and geo-audit route. Test mocks of `@/lib/rate-limit` gained a `getClientIp` stub.
* **Viewer role gates** added to `reprocess-competitors`, `recommendations` (POST and PUT) and `fixes/[fixId]/request-review`, matching every other brand write route.
* **Cron secret via query string** removed from `process-email-outbox`.
* **CSP** now allows `https://fonts.googleapis.com` in `style-src` and `https://fonts.gstatic.com` in `font-src`; `script-src` is unchanged (nonce only, no `unsafe-eval`, no `unsafe-inline`).

## 3. Engine / cron

* `reapStaleNapAudits()` (30 min with no terminal write, keyed off `started_at`) runs from `/api/cron/reap-stale-runs` alongside the run, geo-audit and discovery reapers, and `requeueNapAudit` now accepts a stale `running` row so a user can re-run it from the UI.
* Not changed, worth a look: `PLATFORM_MODELS.Claude` defaults to `claude-fable-5` while the rest of the codebase pins `claude-fable-5-1` / `claude-haiku-4-5-20251001` elsewhere; the geo-audit and BullMQ worker paths also skip the per-plan model clamp that the main run route applies. Recent commits show Claude replies arriving in production, so this was left alone rather than changed blind.

## 4. Marketing / SEO

The pricing page, `PLAN_LIMITS` and `PRICING_PLANS` agree with each other (Starter $9 / 2 platforms / 3 competitors, Pro $29 / 3 / 8, Agency $89 / 5 / 20). The programmatic comparison pages did not. Copy across `alternatives.ts`, `vs-comparisons.ts`, `competitor-roster.ts`, `AlternativePage.tsx`, `VsPage.tsx`, `RankTrackerPage.tsx` and the three bespoke `/vs/` pages now says "no per-platform add-ons" and states the per-tier engine counts where a plan claim is made, instead of "on every plan". The GEO tool page uses the real $9 price and the real competitor cap. `/llm-rank-tracker` is linked from the other two tracker pages. `/changelog` is `monthly` in the sitemap.

Checked and fine: metadata, canonicals and og:image on every page type, JSON-LD shapes, `llms.txt` validity (the dogfood test scores it 100), `EmailOff` wrapping on every `mailto:`, `/docs` anchors, the Scrunch domain, "10 free tools", the `/vs/` sibling rotation.

## 5. Dashboard

* Competitor SOV table in `dashboard-v2/pages/overview.tsx` now computes every row, including "You", as a share of the same mention pool, and the delta and "Competitive" standing use those numbers.
* Brand names now populate in the credits ledger and the Google Sheet title (`data->>'name'`).
* Everything else from July's section 5 was confirmed fixed (reload storm, goal card, mentions delta, regional table, polling leaks, progress bar, NaN bar, a11y, per-user localStorage keys).

## 6. Developer experience

* `DATABASE_URL=...?sslmode=disable` now turns TLS off for a local Postgres (documented in `.env.example`). Previously SSL was always forced and the README quick start could not connect.

---

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | 182 files, 2,318 tests, all pass (7 new) |
| `next build` | clean |
| Public crawl (sitemap + every internal link) | 195 URLs, 0 broken, 0 server errors |
| Dashboard + admin browser drive (41 pages, with a real brand) | 0 server errors, 0 page errors |
| Public forms in the browser | login, reset, contact, newsletter, tools all submit and respond correctly |

## Suggested follow-ups (not done here)

1. Confirm the Claude default model id (`claude-fable-5`) against the Anthropic account and add the plan clamp to the geo-audit and worker paths (section 3).
2. `/dashboard/query-performance` is a live route nothing links to; either add it to the nav or remove it.
3. The general API limiter is 100 req/min per IP+session; a dashboard page load costs about five calls, so a user with several tabs open during a run could brush against it. Consider raising it or exempting polling endpoints.

## Follow-up (same day)

Fixed after the main PR merged:

- **Hydration mismatch on every public page.** Client-rendered JSON-LD scripts (`JsonLd`, `FaqSection`, `Breadcrumbs`, tool pages) stamped the CSP nonce. Browsers hide nonce attribute values once CSP is active, so React saw `nonce=""` in the DOM against the real value in props and re-rendered the subtree on every load. JSON-LD is a data block that script-src never applies to, so the nonce is gone from those elements. Verified: zero hydration warnings on `/contact`, `/blog`, and the tool pages.
- **Per-plan model clamp** now applies in the Regional Audit worker (`geo-audits.ts`) and the BullMQ run worker (`run-worker.ts`), matching the `/run` route. Both previously used the raw platform default, so a Starter or Pro brand could run on the premium model.
- `/dashboard/query-performance` now redirects to `/dashboard/query-tracker` instead of serving an unlinked, simpler copy of the same data.

## Cheaper visibility checks (same day)

Tracking runs now default to the cheapest model on every engine: ChatGPT
`gpt-5.4-nano` (was `gpt-5.4-mini`), Claude Haiku 4.5 (was Fable 5, which
costs 10x on input), Gemini 2.5 Flash Lite (was Flash). Grok 3 Mini and Sonar
were already the cheapest. The economy tier (Free, Trial, Starter, Pro) maps
to the same models; Agency and Enterprise get them too unless an admin picks
a premium model in `/admin-backend/models`. A boot-time migration clears
admin selections that only re-stated the old defaults so the change takes
effect in production without a manual step. The ChatGPT search-budget
fallback now lands on Nano instead of full `gpt-5.4`, and the transient-error
fallback chain (Nano, then Mini, then gpt-4o) still applies to default calls.
Model pricing for Fable 5 and Haiku 4.5 was corrected to Anthropic's list.
