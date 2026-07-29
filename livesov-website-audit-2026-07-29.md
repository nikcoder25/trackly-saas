# Livesov.com — Full Website Audit (follow-up)

**Date:** July 29, 2026
**Branch reviewed:** `main` @ `862f737` (worktree on `claude/livesov-code-review-x2l644`)
**Scope:** Every subsystem of the app in `trackly-nextjs/` — auth/security, billing/payments/credits, the core run & geo-audit engine + cron/workers, the general API surface, the dashboard frontend, and the public marketing/SEO surface.
**Method:** Full test suite (1,822 tests — all pass), `tsc --noEmit` (clean), production `next build` (clean), plus a code review of every module by six focused reviewers. Every finding below was re-verified by reading the actual code and tracing the call path; file:line references are exact. The live origin was not reached from the sandbox — this is a static + build-time review of the exact code that deploys.

> This is a follow-up to `livesov-website-audit-2026-06-10.md`. All 10 issues from that audit were re-checked and **confirmed fixed** (see "Regression check" at the end). The June critical items — anonymous-tool CSRF 403s, soft-404s, the `if (false && …)` payments boot guard, sitemap gaps, og:image gaps, login/signup canonicals — are all genuinely resolved.

---

## Executive summary

Structurally the site is healthy: clean build, green tests, valid structured data, strong security headers, sound JWT/session/CSRF handling, and correct core share-of-voice math. The problems are concentrated in **the run/geo-audit lifecycle (credit accounting under failure/retry)**, **a few user-facing billing and metric numbers that are simply wrong**, and **stale marketing copy**. Nothing here is a data-loss or account-takeover bug, but several items either **cost money** (double refunds, cron over-dispatch, rate-limit bypass on paid endpoints) or **mislead paying customers** (annual price that can't be charged, wrong renewal date, "11 free tools" when there are 10).

### Most important, in priority order

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 1 | **High** | Engine | Watchdog reaps healthy long-running runs/geo-audits, then the live worker resurrects them → **double credit refund** + status ping-pong (`error/failed`→`done`). Refunds drift `monthly_used` down and the sweeper never repairs it, so users get free credits past their cap. |
| 2 | **High** | Engine | Credit + trial-budget **reservations leak** on `/run` rejection paths (409 lock, trial-budget block) — no refund on early return. Double-clicking "Run" phantom-reserves credits. |
| 3 | **High** | Engine/Cron | `mode=daily_floor` cron `return true`s **before** the interval and crash-backoff gates → every paid brand (incl. 48h-floor starters and permanently-broken brands) is re-dispatched daily, ~2× credit burn. |
| 4 | **High** | Engine/Cron | Cron dispatch stagger uses the absolute brand index, so runtime grows ~quadratically and the handler is killed by `maxDuration=300` past ~35–40 brands — the tail of the fleet is silently never dispatched. |
| 5 | **High** | Marketing | Footer newsletter form on ~230 SEO pages is **dead** (`onSubmit` only calls `preventDefault()`); every signup from the marketing surface is silently lost. |
| 6 | **Med** | Billing | "Annual −20%" toggle shows annual prices, but checkout only has monthly product IDs → user sees "$71/mo" and is charged the **monthly** price. |
| 7 | **Med** | Billing | "Renews / Next invoice due" shows the **UTC month-reset date**, not the billing anniversary — anyone not billed on the 1st sees the wrong date. |
| 8 | **Med** | Billing | `subscription.updated` with `on_hold`/`paused`/`failed` is treated as a **full cancellation** (plan→free, binding stripped, cancellation email) — a transient card decline nukes the subscription. |
| 9 | **Med** | Security | Route-level IP rate limits trust the spoofable **`X-Forwarded-For`** first entry (middleware already does this correctly via `do-connecting-ip`). Defeats login/register/forgot-password/anon-tool caps → paid-API cost abuse. |
| 10 | **Med** | Security | **DNS-rebinding / TOCTOU** in `safeFetch`: `assertPublicUrl` validates resolved IPs, then `fetch(hostname)` re-resolves independently — the validated IPs are never pinned. Reachable via anonymous `/api/geo-audit`. |
| 11 | **Med** | Engine | Free GEO-audit tool: **recommendation logic inverted** — substring matches (`f.includes('FAQ')`) hit positive findings too, so pages are told to add FAQ/schema/author/citations they already have. |
| 12 | **Med** | Marketing | "11 free tools" claimed in ~20 places; there are **10** (hub says "Ten"). "No signup required" is also wrong (nap-verification is dashboard-gated). |

Plus ~20 lower-severity items below (CSV formula injection in an export, several dashboard metric-display bugs, polling leaks, SEO orphan/interlink gaps, schema nits). Full detail follows, grouped by subsystem.

---

## 1. Core engine & workers (highest-impact cluster)

The run and geo-audit lifecycles share a design flaw: **terminal writes and credit refunds are not guarded against a watchdog that already finalized the same run.** Under the failure conditions the watchdog exists for, two independent code paths both write status and both refund.

### 1.1 HIGH — Watchdog vs. live-worker double refund + status resurrection
- **Runs:** `run-reconciler.ts:204-270` (watchdog flips `running`→`error`, refunds, appends a `watchdogReap` history entry) vs. `run/route.ts:728-754` (worker `finally` refunds **unconditionally**) and the terminal `UPDATE … SET status='done' … WHERE id=$5` at `run/route.ts:1312-1317` / `run-worker.ts:478-483` with **no `AND status='running'` guard**. The "superseded" pre-check only aborts if a *different* run is currently running, so a reaped-then-finished run flips `error`→`done`, appends a **second** history entry with the same runId, and refunds twice.
- **Geo-audits:** same shape — `geo-audits.ts:615-641` (reaper, no status guard, refunds `total_expected − received_at_reap`) vs. `geo-audits.ts:266-275`/`531-538` (live finalize/refund). A max-size audit (up to 2,500 calls) legitimately runs for hours but is reaped at the 10-minute `started_at` threshold (`reap-stale-runs/route.ts:34`) because geo-audits write **no progress heartbeat**.
- **Why it sticks:** `refundCredits` decrements `usage_counters.monthly_used` (`credits.ts:455`), and the drift sweeper is **decrement-only / never repairs downward drift** (`credits-sweeper.ts:24,164-171`). Result: user keeps free credits until month rollover. The comment claiming "duplicate refund is impossible because the caller passes the unused delta exactly once" (`credits.ts:441-443`) is false with two callers.
- **Trigger for a *live* run:** `flushProgress` swallows DB errors (`run/route.ts:827-832`) and the breadcrumb UPDATE is fire-and-forget (`:1056-1059`), so a transient DB blip freezes `updated_at` for >10 min while the run is healthy → watchdog reaps it.

**Fix direction:** add a `credits_refunded`/terminal-state guard so only the winner of the status flip refunds, and put `AND status='running'` on every terminal `UPDATE`. Give geo-audits a heartbeat (or raise their stale threshold to match worst-case runtime).

### 1.2 HIGH — Reservation leak on `/run` rejection paths
`run/route.ts`: `reserveCredits` debits at `:427-429` and `reserveTrialPromptBudget` increments at `:569`, but the per-brand lock INSERT is only at `:583-599`. The 409-lock returns (`:596`, `:601-603`) and the trial-budget rejection (`:570-575`) exit **without** `refundCredits` or releasing trial budget. Double-clicking "Run" on a 25×5 brand phantom-reserves 125 credits/click; trial-budget leakage has **no release path at all**. Cap gate can wrongly show "out of credits" for up to ~24h until the sweeper runs.

### 1.3 HIGH — `daily_floor` cron bypasses interval + crash-backoff gates
`cron/route.ts:355`: `if (isDailyFloor) return true;` fires before the `effectiveSchedule` check (`:363`) and the crash-backoff gate (`:382`). The `daily_floor` schedule is live (`.github/workflows/cron.yml:23,40-60`, 02:30 UTC daily). Consequences: 48h-floor starter brands get daily runs (2× cadence, 2× credit burn); a brand that ran manually 20 min earlier runs again; permanently-broken brands burn budget daily — the exact case backoff exists to stop.

### 1.4 HIGH — Cron stagger blows past `maxDuration`
`cron/route.ts:404-412`: `brandIndex = i + batchIdx` and `sleep(brandIndex * 8000)` is measured from each batch's start, so total runtime grows ~quadratically and exceeds `maxDuration=300` (`:22`) at ~35–40 eligible brands. The handler is killed mid-loop: the tail of the fleet is never dispatched, no `cron.summary` is emitted, and the run outlives the 10-min lock TTL (`cron-lock.ts:123-128`), allowing an overlapping tick. This is the "Last Run frozen" symptom the file's own comments describe.

### 1.5 HIGH — ChatGPT Batch API path is structurally broken when enabled
`submitChatGPTBatch` polls up to 6h (`chatgpt-batch.ts:48-52,389-431`) but both callers abort at 180s (`run-worker.ts:268-272`, `run/route.ts:929-951`). With `CHATGPT_BATCH_ENABLED=true`, each batch-eligible query blocks, aborts at 180s, "falls back to sync" with the **already-aborted signal** (`ai-platforms.ts:1929-1932`) → fails. Unless OpenAI finishes a batch in <3 min, every batch query burns its full budget and fails. (Latent unless the flag is on — worth a guard or removing the dead path.)

### 1.6 MED — Free GEO-audit recommendations inverted (user-facing)
`geo-audit/route.ts:280-319`: `generateRecommendations` matches substrings that also appear in **positive** findings — `f.includes('FAQ')` matches `'Has FAQ-style heading sections'` (`:71`/`:12`), same for `'FAQPage'`, `'citations'`/`'external'`, `'author'`, `'meta description'`, `'definition'`, `'comparison'`, `'buzzwords'`. Pages that already have these features are told to add them. Also: the monthly geo-audit quota is consumed **before** URL validation (`:369-376`), so a 400/422 still burns a slot.

### 1.7 MED — Progress-buffer race; emergency-save clobbers concurrent edits; cache burns search budget
- `pendingResults` is a shared array flushed after an `await` with no guard (`run/route.ts:816-833`, `run-worker.ts:105-122`) → duplicated/lost live-progress rows (terminal metrics recomputed, so final numbers are safe). Uses a self-subselect append instead of `results = COALESCE(results,'[]') || $5`.
- Emergency crash save writes the **run-start snapshot** of `brands.data` (`run/route.ts:1380-1391`), reverting any edits made during a multi-minute run; happy path does an unlocked read-modify-write.
- `resolveSearchModelWithBudget` runs **before** the cache lookup (`run/route.ts:1034-1130`), so cache hits still consume the 50/day web-search budget and force premature model downgrades.

### 1.8 LOW — observations
- Free-plan config says `scheduledRuns: true` (`constants.ts:31`) but the cron pre-filter excludes `free` (`cron/route.ts:259-266`) — free brands never auto-run; one of the two is wrong.
- Dead code in `run-worker.ts:98-103` (`tasks` array unused); coalesce key omits systemPrompt/maxTokens (`ai-platforms.ts:1741`, latent); `GEO_AUDIT_PLATFORMS` runs all 5 platforms regardless of plan (`geo-audits.ts:45-51`).

**Checked OK:** `computeSovFromResults` (error-excluded denominator, no ÷0), reconciler idempotent flip + locked brand append, cron-lock Lua correctness, fairness-scheduler, credits-sweeper (decrement-only by design), search-budget Lua atomicity, response-cache (errors never cached), citations ordering, fact-checker ÷0 guards, NAP scoring guards, fix-engine `archived_at` (#736) logic.

---

## 2. Billing, payments & credits

### 2.1 MED — Annual toggle advertises a price checkout can't charge
`ComparePlansGrid.tsx:112-117,372` shows `annualPrice` and an "Annual −20%" badge, but `switchPlan` POSTs only `{plan}` (`billing/page.tsx:210`) and `checkout/route.ts:7-12` maps plan → the single **monthly** `DODO_*_PRODUCT_ID`. No annual product IDs exist anywhere. User toggles Annual, sees "Agency $71/mo", clicks upgrade, lands on the $89 monthly checkout.

### 2.2 MED — Renewal / next-invoice date is the credit-reset date, not the billing anniversary
`billing/page.tsx:263,303-305` and `NextInvoiceCard.tsx:12-13` render `fmtBillDate(creditStatus.nextResetAt)` = 1st of next UTC month (`credits.ts:118-120`). A user who subscribed Jul 15 is told the invoice is "due Aug 1"; Dodo charges Aug 15. Credit reset (UTC month) and billing anniversary are two different clocks conflated in the copy.

### 2.3 MED — `on_hold`/`paused`/`failed` treated as cancellation
`webhooks/dodopayments/route.ts:82-89,1130-1201`: `INACTIVE_SUBSCRIPTION_STATUSES` maps `subscription.updated` carrying these statuses to the full downgrade path (plan→free, binding stripped, cancellation email), while the native `subscription.on_hold`/`paused` events only set a status flag. Same real-world state → opposite outcomes depending on which event Dodo sends. `/api/payments/refresh` has the same `!== 'active'` → free policy (`refresh/route.ts:139-140`).

### 2.4 MED — Webhook body-only-HMAC fallback + no timestamp tolerance
`webhooks/dodopayments/route.ts:454-460,488`: a plain `HMAC(body)` fallback is accepted, and the idempotency key is the `webhook-id` **header, which the fallback signature doesn't cover**; there's no timestamp-tolerance check. If Dodo ever signs body-only, a captured delivery can be replayed with a fresh `webhook-id` past the dedupe. Remove the fallback or enforce a timestamp bound.

### 2.5 LOW/MED — cancel copy vs. behavior; billing-period off-by-one; truncated platform breakdown
- Cancel dialog says access lasts "until the end of your billing period" but `cancel/route.ts:154-157` sets `plan='free'` immediately with no proration (`billing/page.tsx:181`).
- `daysIntoMonth` and `daysRemainingInMonth` are **both** `ceil`'d (`credits/usage/route.ts:183-187`), so they sum to `daysInMonth + 1` → "Jun 30 to Aug 1" ranges and "Day X of 32".
- "Credits by AI platform" sums only the first 200 ledger rows with no cursor follow-up (`UsageSection.tsx:82-100`); any Pro/Agency account exceeds that in days.

### 2.6 LOW — dead billing components & cosmetics
`UsageAlertsCard`, `NextInvoiceCard`, `RecentActivityCard`, `CreditsRing` are **not rendered anywhere** (the billing page reimplemented them inline) — so the "over credit limit" notification can never fire (`usage-alert-notifications.ts:68-72` defaults `notifyOver:false` and the only toggle UI is dead). `LowBalanceBanner` comment says it hides for Enterprise but the `>= 99999` guard doesn't (Enterprise cap is 50,000). `webhook_events` account-deletion cleanup is a no-op (`LIKE '%{userId}%'` never matches a `msg_…` id). A narrow `/api/payments/refresh` race can strip a freshly-bound subscription_id (`refresh/route.ts:82-119`).

**Checked OK:** boot guard is live and correct (`instrumentation.ts:86-100` — no `if (false` anywhere), webhook exact-replay idempotency (atomic `ON CONFLICT`), per-subscription advisory lock + SERIALIZABLE + 40001 retry, plan-escalation defenses (`owner` excluded, subscription/customer mismatch guards), `reserveCredits` atomic cap check, plan-config ↔ constants ↔ marketing copy match line-for-line ($9/$29/$89, credits 150/750/2500/8000), Resend webhook svix verification, UTC-consistent daily buckets.

---

## 3. Security & auth

### 3.1 MED — `X-Forwarded-For` spoofing on every route-level rate limiter
`rate-limit.ts:110-118` (`getClientIp`) uses `xff.split(',')[0]`, and every auth/tool limiter keys off it (`login/route.ts:15`, `register/route.ts:68`, `forgot-password`, `reset-password`, `verify-email`, and all `/api/tools/*` + `/api/free-check`). The platform **appends** the real IP, so a rotating fake XFF lands in a fresh bucket every request. The middleware already solves this correctly with `do-connecting-ip` first (`middleware.ts:182-191`) — the route helper just never got the same treatment. Impact: brute-force/signup caps defeated, and unauthenticated paid tools (competitor/citation/mention finders each make a billed AI call) become unbounded cost-abuse endpoints.

### 3.2 MED — DNS-rebinding / TOCTOU SSRF in `safeFetch`
`safe-fetch.ts:118-152,188-189`: `assertPublicUrl` resolves the hostname and validates the IPs, then `fetch(currentUrl)` lets Node do its **own second lookup** — the validated IP set is never pinned to the connection. A short-TTL domain that passes validation can rebind to `169.254.169.254` / `127.0.0.1` for the fetch. Reachable unauthenticated via `POST /api/geo-audit`. Fix: resolve once, pin the IP (connect by IP with SNI/Host preserved, or a custom `lookup` that returns the validated address).

### 3.3 LOW — smaller items
- User/email enumeration on register (`anti-abuse.ts:24-36`, `register/route.ts:114`) and `team/invite` ("User not found").
- Google **ID-token** branch skips `email_verified` (`auth/google/route.ts:78-83`); access-token branch checks it. Low impact (same-email password link is refused).
- Legacy plaintext backup codes throw `RangeError` in `timingSafeEqual` → login 500 (`totp.ts:107-115`).
- CSP missing `base-uri`/`object-src` (`middleware.ts:275-287`) — add `base-uri 'self'`.
- Cron secret accepted via `?secret=` query string (`cron/reconcile-payments/route.ts:45`) — header-only is safer.
- No TOTP replay-window guard at login (`login/route.ts:104`) — a code is reusable for ~90s (backup codes ARE single-use).

**Checked OK:** JWT pinned to HS256 (rejects `none`/RS256) with `exp` enforced and ≥32-char secret; every `/api/admin/**` route calls `requireAdmin` (none missing) and gates strictly on `role==='admin'` (never `plan==='owner'`); CSRF double-submit + Origin on all unsafe methods (June-2026 anon-tool 403 fixed — tools + geo-audit in `CSRF_BOOTSTRAP_PATHS`); password-reset token (256-bit, sha256-at-rest, single-use, revokes sessions, keeps 2FA); refresh-token rotation atomic; SSRF blocklist otherwise thorough (v4/v6, encoded forms, metadata hosts, per-redirect revalidation); Sentry PII scrubbing; no secrets logged; `/api/metrics` gated by timing-safe token.

---

## 4. General API surface

### 4.1 MED — CSV formula injection in fixes export
`brands/[id]/fixes/export/route.ts:15-18`: a local `csvCell()` only quotes `[",\n]` and doesn't neutralize `= + - @`. The repo already ships the correct `csvSafe()` (`lib/csv.ts:5`, used by the mentions/proof exports) — this route just doesn't use it. Exported `summary`/`error`/`targetUrl` carry AI/site-derived text; a cell starting `=HYPERLINK(...)`/`=cmd|...` executes when the client-facing report is opened in Excel/Sheets. One-line fix.

### 4.2 LOW — misc
- Raw `(e as Error).message` echoed in 500/400 bodies (`connect/connector/approve/route.ts:81`, `fixes/export/route.ts:56`, `connections/[id]/status/route.ts:41`) — use `serverError()`.
- Two authenticated paid endpoints have **no** rate limit (`nap-audits/gbp-lookup/route.ts:267-290` Google Places, `nap-audits/[id]/gaps/route.ts:54-93` Perplexity) while every sibling does — a session can loop them for provider cost.

**Checked OK:** IDOR — every by-id read/write scopes by `user_id` or a `team_members` join (`getBrandWithAccess`, nap-audits, alerts, team, tracked-prompts, notifications, activity/api-logs); tenant-keys AES-256-GCM at rest + masked on every response; team role checks (viewer blocked from writes, invite role-validated); tools use `safeFetch` (modulo 3.2); contact/newsletter (Turnstile/honeypot/rate-limit); email header injection stripped; `config`/`health`/`metrics`/`models`/`plans` leak nothing sensitive.

---

## 5. Dashboard frontend

### 5.1 MED — metric-display bugs
- **Duplicate reload storm:** `useBrandData.ts:83-87` and `:105-109` both register a `livesov:run-complete` listener → every run completion fires `reload()` twice (2× `refreshBrands` + 2× `GET /api/brands/:id`, racing `setFullBrand`).
- **Goal card silently discards saves:** `GoalCard` needs `useExtras()`, but `ExtrasProvider` mounts only in the staff-only `/dashboard-v2` standalone — on production `/dashboard` `ex` is `null`, so Save is a no-op and the goal snaps back to a hardcoded `{target:30, by:'Jun 30'}` (a past date), with a fabricated "N weeks at your current pace" from a hardcoded `0.6` pts/week (`shell.tsx:401-449`).
- **MENTIONS KPI delta inflated:** current run counts results when `totalM` is absent, previous run falls back to **0** (`overview.tsx:345-347` vs `599-603`) → shows `▲ +<entire count>` when stored runs lack `totalM`.
- **Competitor rank mixes denominators:** "You" SOV is mention-rate over ok results; competitor rows are share of a different universe (`overview.tsx:460-499`), then sorted together into a rank + "Competitive" bar.
- **Regional-audit table:** prints `mentionsCount / totalExpected` but the % badge is `mentionsCount / received` (`AuditsListTable.tsx:128-131,182-196`) — on a partial audit "10 / 50" sits next to "50.0%".

### 5.2 LOW — leaks & a11y
- `connect.tsx:56-66` polls every 3s **indefinitely** with no backoff/visibility gating; `fixes.tsx:479-493` `pollBatch` loops 60× with no abort on unmount (`setState` on unmounted component).
- `ProgressBar.tsx:26-42` returns a cleanup from a DOM event handler (discarded) → Ctrl/Cmd-click freezes the bar at 80%.
- NAP `[id]` cleanup clears but never nulls `pollRef.current` → polling dies after in-place id navigation (`nap-audits/[id]/page.tsx:238`).
- `StackBar` ÷0 → `width:NaN%` (`ui.tsx:404-410`); Topbar notification rows are click-only `<div>`s (no keyboard/role); onboarding/credits-migration localStorage flags are global, not per-user (shared-browser bleed).

**Checked OK:** analytics **are** consent-gated (GA + Clarity render nothing unless `cookie-consent==='accepted'`, re-check on change, reload on revoke); all dashboard `dangerouslySetInnerHTML` goes through `escapeHtml`/`sanitizeHtml`; hydration-safe localStorage reads; legacy geo-audit/nap poll loops clean up correctly; `GlobalLiveToasts`/`GlobalRunProgress`/`PaymentSuccessBanner`/`AddBrandModal` sound; `/dashboard-v2` staff-gated; sample data badged.

---

## 6. Marketing & SEO surface

### 6.1 HIGH — Footer newsletter form is dead on ~230 pages
`SeoLayout.tsx:76-80`: `onSubmit={(e) => { e.preventDefault(); }}` with no fetch/state, so it never submits; and its `method="post"` form-encoding wouldn't match `api/newsletter/route.ts:29` (`request.json()` only). Every newsletter signup from blog/vs/alternative/tool/learn pages is silently lost. (The tools' `ToolEmailCapture.tsx:24` does it correctly, so the API works.)

### 6.2 MED
- **Sitemap regression:** `/tools/nap-verification` exists and is linked from the hub but is **absent** from `sitemap.ts:79-88` and the footer Free-Tools column; `tests/sitemap-coverage.test.ts` doesn't pin tools, so CI misses it.
- **Email-protection regression:** `author/[slug]/page.tsx:100-106` renders `hello@livesov.com` as an unwrapped `mailto:` — the exact thing `EmailOff` (`cc8c829`/#733) was built to prevent — so Cloudflare rewrites it into a broken `/cdn-cgi/l/email-protection` link on the page every byline links to.
- **"11 free tools" is false:** claimed in ~20 places (`AlternativePage.tsx:53-56,106`, `VsPage.tsx:53-56`, `RankTrackerPage.tsx:187`, `alternatives.ts` rows + AthenaHQ stat card, `vs-comparisons.ts:220,338,373`, `vs/peec-ai/page.tsx:257`); the hub says "Ten free utilities" and lists **10**. "No signup required" is also wrong — nap-verification is dashboard-gated.
- **Scrunch AI domain contradiction:** `alternatives.ts:277,332` says `scrunch.ai`; `competitor-roster.ts:73` and `vs-comparisons.ts:75` say `scrunchai.com`. The two pages for the same vendor send readers to different domains.
- **Dead docs anchors:** 11 of 15 `/docs` cards link to `#add-brand`, `#billing`, `#webhooks`, etc. that don't exist — the body defines only `quickstart`, `prompts`, `llms`, `alerts` (`docs/page.tsx:40-87,166-209`).

### 6.3 LOW
- The 6 new `/vs/` pages are under-linked; `/vs/llmrefs` and `/vs/waikay` are near-orphans (sibling `.slice(0,3)` always picks the same prefix; roster entries lack `vsHref`; both footers list only the original 5) — same orphan pattern `8218be6` fixed for alternatives.
- Keyword-ownership guard tests exact-equality, not the substring **containment** its contract promises (`seo-registry.ts:17-19` vs `keyword-ownership.test.ts:94-101`) — latent, no live collision today.
- Schema nits: `itemListOrder: …Descending` on ascending 1→7 lists; twitter.com vs x.com sameAs mismatch; `sitemap.ts:45` stamps the 6 newest alternative pages with an old `lastModified`.

**Checked OK:** all new cohorts (15 alternatives, 11 vs, 2 rank-tracker, 19 blog, authors) are in the sitemap and every sitemap URL maps to a real route; hard 404s on invalid slugs (`dynamicParams=false` + `notFound()` in both metadata and body; no `loading.tsx` reintroduced); canonicals + og:image correct on every new page type; no duplicate titles/descriptions; internal links resolve; JSON-LD well-formed; ContactForm correct; plan prices match config; pricing routing fix holds.

---

## Regression check — June 10, 2026 audit

All 10 prior findings re-verified as **fixed**: (1) anonymous-tool CSRF 403 → tools + geo-audit now in `CSRF_BOOTSTRAP_PATHS`; (2) soft-404s → `dynamicParams=false` + `notFound()` in metadata, no `loading.tsx`; (3) payments boot guard → live in `instrumentation.ts:86-100`, no `if (false` anywhere; (4) sitemap gaps → generated from data modules (one *new* drift: nap-verification, see 6.2); (5) og:image → present on all new types; (6) uncacheable pages → unchanged (documented trade-off); (7) login/signup canonicals → correct; (8) withdrawn; (9) long titles → template fixed; (10) `X-XSS-Protection` → removed.

---

## Suggested order of work

1. **Stop the credit bleed** — 1.1 (guard terminal writes + single refund), 1.2 (refund on `/run` reject paths), 1.3 (`daily_floor` gate order), 1.4 (cron stagger). These cost real money every day.
2. **Fix the customer-facing lies** — 6.1 (dead newsletter), 2.1 (annual price), 2.2 (renewal date), 2.3 (hold≠cancel), 6.2 ("11 tools", Scrunch domain, dead docs anchors, email-protection).
3. **Close the cheap security gaps** — 3.1 (share the middleware `getClientIp`), 3.2 (pin the SSRF IP), 4.1 (use `csvSafe`).
4. **Dashboard metric correctness** — 5.1 batch.
5. Everything under LOW as cleanup.

Nothing here blocks the site from running, and the fundamentals (auth, build, tests, core math) are solid. The theme across the real bugs is **failure-path accounting** — the happy paths are correct; the retry/watchdog/rejection paths are where credits and truth leak.
