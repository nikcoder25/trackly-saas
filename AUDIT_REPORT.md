# TRACKLY (LIVESOV) - COMPREHENSIVE WEBSITE AUDIT REPORT

**Date:** 2026-04-01
**Auditor:** SaaS Finance & Security Expert
**Scope:** Full codebase audit - Security, Billing, APIs, Frontend, SEO, UX, Infrastructure

---

## EXECUTIVE SUMMARY

| Severity | Count | Key Risk |
|----------|-------|----------|
| **CRITICAL** | 7 | Billing bypass, auth bypass, broken features |
| **HIGH** | 15 | Revenue leakage, data exposure, cost exposure |
| **MEDIUM** | 15 | Race conditions, UX gaps, compliance |
| **LOW** | 15+ | SEO, accessibility, dead code, conversion |

**Top 3 business-threatening issues:**
1. Anyone can forge a webhook to get any plan for free (no signature verification)
2. Per-period prompt usage is never tracked - users can run unlimited AI queries costing you real money
3. Plan cancellation doesn't downgrade - cancelled users keep premium features indefinitely

---

## SECTION 1: CRITICAL ISSUES (Fix Immediately)

### CRIT-1: No Webhook Signature Verification (Complete Billing Bypass)
- **File:** `trackly-nextjs/src/app/api/payments/webhooks/dodopayments/route.ts:21`
- **Impact:** Any attacker can POST a forged payload to upgrade themselves (or anyone) to any plan for free
- **Details:** Zero HMAC, shared secret, or IP allowlisting. Combined with `metadata.plan` taking precedence over `PLAN_MAP[productId]` (line 37), attackers can even grant themselves the `owner` super-plan (9999 brands, 99999 prompts)
- **Fix:** Add Dodo Payments webhook signature verification; derive plan exclusively from `PLAN_MAP[productId]`, never from `metadata.plan`

### CRIT-2: JWT Secret Falls Back to Empty String
- **File:** `trackly-nextjs/src/lib/auth.ts:7-14`
- **Impact:** If `JWT_SECRET` is unset, all JWTs are signed with `''`. Any attacker can forge valid tokens
- **Details:** The Express backend correctly exits on missing JWT_SECRET (`server.js:9-15`), but the Next.js app silently continues with an empty string
- **Fix:** Throw an error or exit the process if `JWT_SECRET` is unset in any environment

### CRIT-3: Cron Job Auth Bypass When CRON_SECRET is Unset
- **File:** `trackly-nextjs/src/app/api/cron/route.ts:17-21`
- **Impact:** Open endpoint allowing anyone to trigger mass query runs, generating unbounded AI API costs
- **Fix:** Always require `CRON_SECRET`; fail closed if not set

### CRIT-4: Scheduled Runs Are Completely Broken
- **File:** `trackly-nextjs/src/app/api/cron/route.ts:62-64`
- **Impact:** Cron calls the run endpoint with no auth headers. All scheduled runs fail with 401
- **Fix:** Pass a service-level auth token or use internal function calls instead of HTTP

### CRIT-5: Encryption Key Falls Back to Empty String
- **File:** `trackly-nextjs/src/lib/helpers.ts:13`
- **Impact:** `ENCRYPTION_KEY || JWT_SECRET || ''` - if both empty, all API key encryption is trivially breakable
- **Fix:** Require `ENCRYPTION_KEY` at startup

### CRIT-6: Root Landing Page is Client-Rendered (SEO Destruction)
- **File:** `trackly-nextjs/src/app/page.tsx:1` and `(public)/home/page.tsx:1`
- **Impact:** Both home pages are `'use client'`, meaning search engines see an empty shell. All text comes from client-side translation context
- **Fix:** Convert to server components or use SSR-compatible i18n

### CRIT-7: Duplicate Home Pages Creating SEO Conflict
- **Files:** `src/app/page.tsx` and `src/app/(public)/home/page.tsx`
- **Impact:** Two full landing pages with different canonicals (`/` vs `/home`), duplicate JSON-LD schemas, competing for the same keywords
- **Fix:** Pick one, redirect the other

---

## SECTION 2: HIGH SEVERITY ISSUES (Fix This Week)

### HIGH-1: Pricing Page Misrepresents Plan Limits (Legal Liability)
- **Files:** `(public)/pricing/page.tsx:11-16` vs `lib/constants.ts:17-24`

| Feature | Pricing Page | Actually Enforced | Risk |
|---------|-------------|-------------------|------|
| Pro brands | 3 | 5 | Under-selling |
| Pro prompts | 150 | 250 | Under-selling |
| Agency brands | 10 | 20 | Under-selling |
| Agency prompts | 500 | 1,000 | Under-selling |
| Agency API access | Advertised | `apiAccess: false` | **Mis-selling** |

- Also inconsistent on `(public)/home/page.tsx:73-78` and `(dashboard)/dashboard/billing/page.tsx:13-22`

### HIGH-2: No Per-Period Prompt Usage Tracking (Unlimited AI Cost Exposure)
- **Files:** `lib/constants.ts:17-24`, `api/brands/[id]/run/route.ts`
- **Impact:** `PLAN_LIMITS` defines prompt caps (250 for Pro, 1000 for Agency) but the run endpoint never counts consumption. Users can run unlimited queries, each costing real AI API money
- **Fix:** Add a `prompt_usage` table tracking per-user, per-billing-period consumption

### HIGH-3: Cancellation Doesn't Downgrade Plan (Revenue Leakage)
- **File:** `api/payments/cancel/route.ts:29-32`
- **Impact:** `subscription_status` set to "cancelled" but `plan` column unchanged. Users keep premium features indefinitely
- **Fix:** Downgrade to `free` plan on cancellation, or implement grace period with hard cutoff

### HIGH-4: Password Reset / Email / Refresh Tokens Stored in Plaintext
- **Files:** `api/auth/forgot-password/route.ts:29`, `api/auth/reset-password/route.ts:21`, `api/auth/register/route.ts:73`, `api/auth/login/route.ts:93`
- **Impact:** Database breach = all tokens usable. Can reset any password, verify any email, hijack any session
- **Fix:** Store SHA-256 hashes; compare hashes on verification

### HIGH-5: Google OAuth Auto-Links Without Verification
- **File:** `api/auth/google/route.ts:82-89`
- **Impact:** Account takeover by creating a Google account matching an existing user's email
- **Fix:** Require password confirmation or email verification before linking

### HIGH-6: Password Reset Doesn't Invalidate Sessions
- **Files:** `api/auth/reset-password/route.ts:30-32`, `api/auth/change-password/route.ts:21-22`
- **Impact:** Attacker keeps access even after victim resets password
- **Fix:** Clear `refresh_token` and add `token_invalidated_at` timestamp

### HIGH-7: Payment History Leaks All Users' Webhook Events
- **File:** `api/payments/history/route.ts:10-13`
- **Impact:** `SELECT ... FROM webhook_events` has no WHERE clause. All users see all events
- **Fix:** Add `WHERE user_id = $1` filter

### HIGH-8: 12+ Endpoints Skip Email Verification Check
- **Affected:** facts, keyword-tracker, citation-analysis, accuracy, prompt-runs, competitor-analysis, alerts, recommendations, cost-estimate, export, ai-generate-queries, copilot
- **Impact:** Unverified email users can access data and trigger AI API calls
- **Fix:** Replace `verifyRequestAuth` with `requireVerifiedAuth` on all data endpoints

### HIGH-9: SSRF via Website URL in Auto-Discover
- **File:** `lib/fact-checker.ts:342-366`
- **Impact:** No validation against internal IPs. Attacker can set brand website to `http://169.254.169.254/latest/meta-data/` to steal cloud credentials
- **Fix:** Validate URLs against private IP ranges before fetching

### HIGH-10: Gemini API Key Exposed in URL Query String
- **Files:** `lib/ai-platforms.ts:122`, `lib/fact-checker.ts:158`
- **Impact:** API key appears in server logs, proxy logs, and error trackers
- **Fix:** Pass API key via header instead of query parameter

### HIGH-11: No Rate Limiting on Brand Runs or Fact-Checking
- **Files:** `api/brands/[id]/run/route.ts`, `api/brands/[id]/accuracy/route.ts:107-215`
- **Impact:** Unlimited concurrent AI API calls with no throttle. Fact-checking fires up to 15 concurrent AI calls per request
- **Fix:** Add per-user rate limiting and daily budget caps

### HIGH-12: Fabricated Webhook Event IDs Bypass Idempotency
- **File:** `api/payments/webhooks/dodopayments/route.ts:24`
- **Impact:** If attacker omits `event_id` and `id`, a timestamp-based ID is generated. Same payload can be replayed with different timing
- **Fix:** Require `event_id` or reject the webhook

### HIGH-13: 4 Platform Tracking Pages Are 404s (But Linked Everywhere)
- **Linked from:** `(public)/home/page.tsx:52-56`, `components/seo/SeoLayout.tsx:27-29`, `sitemap.ts`
- **Missing pages:** `/perplexity-brand-tracking`, `/claude-brand-tracking`, `/gemini-brand-tracking`, `/grok-brand-tracking`
- **Impact:** Broken links from homepage, footer, and sitemap. Negative SEO signal
- **Note:** Only `/chatgpt-brand-tracking` exists as an actual page

### HIGH-14: `owner` Plan Visible and Forgeable
- **File:** `(dashboard)/dashboard/billing/page.tsx:103`
- **Impact:** Super-plan (9999 brands, 99999 prompts) shown in billing UI to all users. Combined with webhook forgery (CRIT-1), attackers can set their plan to `owner`
- **Fix:** Hide `owner` from UI; add server-side plan validation

### HIGH-15: Competitor Limits Not Enforced on Brand Creation
- **File:** `api/brands/route.ts:113`
- **Impact:** Competitors sliced to 100 regardless of plan. Free users (limit: 0 competitors) can add competitors
- **Fix:** Check `limits.competitors` during brand creation

---

## SECTION 3: MEDIUM SEVERITY ISSUES

### MED-1: In-Memory Rate Limiter Doesn't Work on Vercel
- **File:** `lib/rate-limit.ts:10-18`
- Uses `Map()` in memory. Serverless = each invocation gets fresh memory. Rate limits are completely ineffective
- **Fix:** Use Redis, Vercel KV, or Upstash

### MED-2: Middleware Doesn't Verify JWT Validity
- **File:** `src/middleware.ts:9-17`
- Checks `if (token)` but never verifies signature. Expired/forged cookies treated as valid for routing
- **Fix:** Verify JWT in middleware or handle gracefully

### MED-3: Access Tokens Returned in Response Body
- **Files:** login, register, refresh, google routes
- Token in body + HttpOnly cookie = XSS can exfiltrate token from response
- **Fix:** Only use HttpOnly cookies for token transport

### MED-4: Race Condition in Brand Run Locking
- **File:** `api/brands/[id]/run/route.ts:100-108`
- Check-then-insert is not atomic. Concurrent requests can both start runs
- **Fix:** Use `INSERT ... ON CONFLICT` or database advisory lock

### MED-5: Team Member Runs Use Wrong User's Plan
- **File:** `api/brands/[id]/run/route.ts:81`
- Team member's plan used for limits, not brand owner's plan
- **Fix:** Look up brand owner's plan for limit checks

### MED-6: No Race Condition Protection on Webhook Plan Changes
- **File:** `api/payments/webhooks/dodopayments/route.ts:39-48`
- Simultaneous webhooks = non-deterministic plan state
- **Fix:** Use `SELECT ... FOR UPDATE` or optimistic concurrency

### MED-7: Facts DELETE-then-INSERT Without Transaction
- **File:** `api/brands/[id]/accuracy/route.ts:88-99`
- Crash mid-loop = all facts permanently lost
- **Fix:** Wrap in database transaction

### MED-8: TOTP Secrets and Backup Codes in Plaintext
- **Files:** `api/auth/2fa/verify/route.ts:27-35`, `api/auth/login/route.ts:51-53`
- Database breach = all 2FA bypassed
- **Fix:** Encrypt TOTP secrets; bcrypt hash backup codes

### MED-9: Missing Pagination on Multiple Endpoints
- `brands/route.ts:55` - No LIMIT on brands query
- `competitor-analysis/route.ts:14` - No LIMIT
- `accuracy/route.ts:23` - No LIMIT

### MED-10: Cookie Consent Doesn't Actually Gate Any Behavior
- **File:** `components/CookieConsent.tsx:17-19`
- "Accept" and "Decline" do the same thing. No cookies/scripts blocked on decline
- No server-side consent record. No ability to change preferences later
- GDPR non-compliant

### MED-11: Checkout Metadata is Client-Controlled
- **File:** `api/payments/checkout/route.ts:38`
- Client can inject `plan: "enterprise"` in metadata. Webhook handler trusts `metadata.plan`
- **Fix:** Never include `plan` in metadata; always derive from product ID

### MED-12: SeoLayout Nav Has No Mobile Hamburger Menu
- **File:** `components/seo/SeoLayout.tsx:41-54`
- All 7 nav links rendered inline. Overflow on mobile
- **Fix:** Add responsive hamburger menu

### MED-13: CSP Allows `unsafe-inline` and `unsafe-eval`
- **File:** `next.config.ts:26`
- Effectively negates XSS protection from CSP
- **Fix:** Use nonces for inline scripts; remove `unsafe-eval`

### MED-14: Cron lastRun Date Comparison Is Unreliable
- **File:** `api/cron/route.ts:45`
- Date stored as `YYYY-MM-DD` (midnight UTC). Run at 23:00 UTC makes hours-since appear 23h larger
- Causes scheduled runs to fire more frequently than intended

### MED-15: Server API Keys Always Use First Key
- **File:** `api/brands/[id]/run/route.ts:231`
- Parses up to 10 keys per platform but always uses `[0]`. No rotation
- **Fix:** Round-robin or random selection

---

## SECTION 4: LOW / SEO / UX / ACCESSIBILITY ISSUES

### SEO Issues
1. **Missing OG images on sub-pages** - All `(public)/` pages lack `openGraph.images`
2. **Sitemap includes `/login` and `/signup`** - Auth pages add no SEO value
3. **`lastModified: new Date()`** in sitemap - Updates on every request, reducing trust
4. **Duplicate JSON-LD schemas** - Root layout + home layout both inject same schemas
5. **`keywords` meta tag** - Google ignores it. Harmless but pointless weight
6. **Missing `/home` in sitemap** - Exists as route but not listed
7. **`robots.txt` doesn't block `/home`** - If it's a duplicate of `/`, should be blocked

### Accessibility Issues
8. **No `<main>` landmark** on root page
9. **`dangerouslySetInnerHTML`** without sanitization on home pages
10. **Mobile menu lacks ARIA attributes** - No `aria-expanded`, `aria-controls`
11. **Language switcher has no ARIA dropdown semantics**
12. **FAQ sections missing accessible toggle pattern** on `/home`
13. **Testimonial carousel not keyboard accessible** - Auto-rotates with no stop control
14. **Color contrast** - `#FF6154` on white is ~3.5:1, below WCAG AA 4.5:1 threshold
15. **No skip-to-content link** anywhere

### i18n Issues
16. **Client-side only translations** - Search engines can't see translated content
17. **No `hreflang` tags** for multi-language support
18. **No URL-based locale** (`/en/`, `/fr/`) - All languages share same URL
19. **SeoLayout pages are English-only** - Don't use `useLanguage()`
20. **`<html lang="en">` hardcoded** - Never changes on language switch

### Conversion Optimization Issues
21. **No product screenshots** - Users must sign up blindly
22. **"Coming Soon" blog posts** - Empty blog signals immaturity
23. **Contact page has no form** - Only email addresses shown
24. **No annual billing toggle** - Standard SaaS conversion tactic missing
25. **No free tier on pricing page** - Subtitle says "Start free" but cheapest shown is $9/mo
26. **Email capture form is non-functional** - `// TODO: integrate with email service`
27. **Google Fonts via `<link>` instead of `next/font`** - Render-blocking, hurts Core Web Vitals

### Code Quality Issues
28. **Dead code:** `src/lib/run-state.ts` - Never imported
29. **`CREATE TABLE IF NOT EXISTS` on every cold start** instead of migrations
30. **Brand name confusion:** Codebase says "Livesov" everywhere, repo is "trackly"
31. **Large CSS duplication** - `legacy.css` and `trackly-landing.css` both loaded
32. **No `error.tsx` error boundaries** at any route level
33. **No `loading.tsx`** for route transitions
34. **`Cache-Control: no-store` on all pages** including public marketing pages

---

## SECTION 5: WHAT'S DONE WELL

- **SQL Injection Prevention:** All queries use parameterized queries (`$1`, `$2`). Zero injection found
- **Password Hashing:** bcrypt with 12 rounds + dummy-hash comparison preventing timing attacks
- **Security Headers:** Comprehensive CSP, X-Frame-Options, HSTS, Referrer-Policy in `next.config.ts`
- **Cookie Security:** HttpOnly, SameSite=Strict, Secure in production
- **JWT Algorithm Pinning:** Explicitly specifies HS256, preventing algorithm confusion attacks
- **2FA Backup Codes:** Atomic consumption with `SELECT...FOR UPDATE` in transactions
- **Audit Logging:** Security actions logged with IP addresses
- **robots.txt:** Correctly blocks `/dashboard/`, `/api/`, `/reset-password`
- **JSON-LD Structured Data:** Well-implemented schema.org data
- **Express Backend:** Proper env var validation, HTTPS enforcement, helmet security headers
- **Admin Panel:** Proper role-based access with database verification
- **Rate Limiting on Auth:** Login, register, forgot-password all have rate limits

---

## SECTION 6: RECOMMENDED FIX PRIORITY ORDER

### Tier 1: Revenue & Security (This Week)
1. Add webhook signature verification + derive plan from `PLAN_MAP[productId]` only
2. Fix JWT secret empty fallback (throw error if unset)
3. Add per-period prompt usage tracking and enforcement
4. Fix plan downgrade on cancellation
5. Fix cron auth (add service token) + require CRON_SECRET

### Tier 2: Security Hardening (Next 2 Weeks)
6. Hash tokens in database (reset, verify, refresh)
7. Invalidate sessions on password reset/change
8. Fix Google OAuth auto-linking
9. Switch to Redis-based rate limiting
10. Fix inconsistent auth (`verifyRequestAuth` -> `requireVerifiedAuth`)
11. Add SSRF protection on URL fetching
12. Fix payment history data leakage

### Tier 3: SEO & Conversion (Next Month)
13. Convert home pages to server components for SSR
14. Fix/create missing platform tracking pages (4 pages)
15. Resolve duplicate home page conflict
16. Fix pricing page discrepancies
17. Switch to `next/font` for Google Fonts
18. Add product screenshots to landing pages
19. Add free tier to pricing page
20. Add annual billing toggle

### Tier 4: Polish & Compliance (Ongoing)
21. Fix cookie consent to actually gate behavior
22. Add ARIA attributes and skip-to-content link
23. Add `error.tsx` and `loading.tsx` at route levels
24. Fix i18n to be SSR-compatible with `hreflang` tags
25. Add mobile hamburger menu to SeoLayout
26. Implement database migrations instead of `CREATE TABLE IF NOT EXISTS`
27. Clean up dead code and CSS duplication
28. Add contact form
29. Write real blog content

---

---

## SECTION 7: DASHBOARD & ADMIN ISSUES (Additional Findings)

### DASH-1: 2FA Secret Leaked to Third-Party QR Code Service (HIGH)
- **File:** `(dashboard)/dashboard/account/page.tsx:161`
- The TOTP secret (most sensitive auth data) is sent to `api.qrserver.com` for QR generation
- **Fix:** Generate QR codes client-side using a library like `qrcode`

### DASH-2: XSS via dangerouslySetInnerHTML in 3 Dashboard Pages (HIGH)
- **File:** `(dashboard)/dashboard/mentions/page.tsx:233` - AI response text
- **File:** `(dashboard)/dashboard/proof/page.tsx:338` - AI response excerpts
- **File:** `(dashboard)/dashboard/copilot/page.tsx:105` - Bot responses with regex-based markdown parsing
- `escHtml()` only escapes `&`, `<`, `>` but not quotes/attributes. Brand names survive regex escaping but could be dangerous in HTML attribute contexts

### DASH-3: Team Invite Adds Users Without Their Consent (HIGH)
- **File:** `api/team/invite/route.ts:14-24`
- Any authenticated user can add any registered user (by email) to their team instantly. No invitation acceptance flow
- **Fix:** Add invite-accept workflow

### DASH-4: Team Invite Endpoint is Broken (HIGH - Functional Bug)
- **File:** `(dashboard)/dashboard/team/page.tsx:29`
- Frontend POSTs to `/api/team` but that route only has a GET handler
- The actual POST handler is at `/api/team/invite/route.ts`
- **Impact:** Team invitations from the UI don't work at all

### DASH-5: Brand Selector in Topbar is Non-Functional (HIGH - UX Bug)
- **Files:** Nearly every dashboard page
- Each page independently fetches `/api/brands` and uses `brands[0]`
- The Topbar has a brand selector (Topbar.tsx:69) but changing it does NOT update any page content
- **Impact:** Multi-brand dashboard is fundamentally broken. Users always see only their first brand

### DASH-6: Open Redirect on Login Page (MEDIUM)
- **File:** `(auth)/login/page.tsx:30`
- `redirect` query parameter used directly in `router.push()` without validation
- Attacker can craft `/login?redirect=https://evil.com` to redirect users post-login

### DASH-7: Notifications Bell is Hardcoded "No new notifications" (MEDIUM)
- **File:** `components/dashboard/Topbar.tsx:142-155`
- Never fetches from `/api/notifications`. The notification API exists and works but is completely disconnected from the UI

### DASH-8: 6+ Dashboard Buttons Are Non-Functional (LOW - UX)
- Account page: Export Data (4 buttons), Plan switching buttons - no `onClick` handlers
- Prompt Details: Save button, Export CSV button - no `onClick` handlers

### DASH-9: Every Dashboard Page Fetches /api/brands Independently (MEDIUM)
- BrandContext exists and wraps all pages but is unused by most
- Creates N+1 API calls on every page navigation + state desynchronization

### DASH-10: RunContext Uses window.location.reload() (MEDIUM)
- **File:** `contexts/RunContext.tsx:137`
- Full page reload after run completion destroys all client-side state

---

## SECTION 8: BACKEND INFRASTRUCTURE ISSUES (Additional Findings)

### BACK-1: Hardcoded Admin Email in Database Init (HIGH)
- **File:** `config/db.js:355-364`
- `nikseo101@gmail.com` hardcoded, auto-promoted to admin/owner on every startup
- **Fix:** Use environment variable for initial admin email

### BACK-2: SQL Injection Risk in Cleanup Functions (MEDIUM)
- **File:** `config/db.js:415,423,441,449,571`
- Template literals inject retention day values directly into SQL instead of parameterized queries
- Currently safe (integer constants) but dangerous pattern

### BACK-3: Cluster Mode Multiplies Rate Limits (HIGH)
- **File:** `server.js:182-216`
- `express-rate-limit` uses in-memory store. With 4 workers, attackers get 4x the configured limits
- **Fix:** Use `rate-limit-redis` for cluster deployments

### BACK-4: No Database Transaction for Brand Run Save (HIGH)
- **File:** `routes/brands.js:722-860`
- Multiple operations (save brand, insert prompt_runs, insert citations, refresh stats, evaluate alerts) without transaction wrapping
- Partial failure = inconsistent data

### BACK-5: Static Assets Cached 7 Days + `immutable` Without Content Hash (MEDIUM)
- **File:** `server.js:220-232`
- Filename has no content hash, so updated CSS/JS files are stale for up to 7 days after deployment

### BACK-6: Weak Default JWT_SECRET in .env.example (MEDIUM)
- **File:** `.env.example:9`
- `JWT_SECRET=livesov-super-secret-jwt-key-change-in-production` - developers commonly copy without changing

### BACK-7: Duplicate Gemini Model Pricing (LOW)
- **File:** `lib/ai-platforms.js:194-196`
- `gemini-2.5-flash` appears twice with different prices. Second overwrites first silently

### BACK-8: No Database Init Timeout (LOW)
- **File:** `server.js:58-61`
- `initDB()` can hang indefinitely if database is unreachable. Process appears started but never becomes ready

---

## UPDATED EXECUTIVE SUMMARY

| Severity | Count | Key Risk |
|----------|-------|----------|
| **CRITICAL** | 7 | Billing bypass, auth bypass, broken features, SEO destruction |
| **HIGH** | 23 | Revenue leakage, XSS, data exposure, cost exposure, broken features |
| **MEDIUM** | 25 | Race conditions, UX gaps, compliance, performance |
| **LOW** | 20+ | SEO, accessibility, dead code, conversion, non-functional UI |

---

## SECTION 9: ADDITIONAL FINDINGS FROM FINAL AUDIT PASS

### FINAL-1: User Settings Endpoint Allows Arbitrary JSONB Injection (HIGH)
- **File:** `routes/admin.js:387-410` (Express backend)
- The `PUT /settings` endpoint merges the entire `settings` object into the user's JSONB column via `settings || $1::jsonb`
- An attacker could inject arbitrary keys to overwrite `totp_secret`, `totp_enabled`, or `dodo_subscription_id` to **disable 2FA or fake a subscription**
- **Fix:** Whitelist allowed settings keys before merging

### FINAL-2: First-User Admin Claim Without ADMIN_SECRET (HIGH)
- **File:** `routes/admin.js:343-369` (Express backend)
- `/admin/make-first-admin` only requires `ADMIN_SECRET` if configured. If unset, **any authenticated user can promote themselves to admin**
- **Fix:** Always require `ADMIN_SECRET`; fail closed if not set

### FINAL-3: Express Backend Missing Password Complexity (MEDIUM)
- **File:** `routes/auth.js:135-136`
- Express registration only requires `password.length >= 8`
- Next.js version enforces uppercase, lowercase, number, special char
- Same database, different password policies = inconsistency

### FINAL-4: Admin Panel Secret Passed via URL Query Parameter (MEDIUM)
- **File:** `server.js:278-313`
- Admin secret appears in URL as `?key=<secret>`, visible in server logs, browser history, proxy logs
- **Fix:** Accept admin secret via POST body or header only

### FINAL-5: Express CSRF Protection Not Mirrored in Next.js (HIGH)
- Express backend has explicit origin-header CSRF protection (`server.js:131-152`)
- Next.js app has **no equivalent CSRF middleware** at all
- State-changing POST/PUT/DELETE requests are unprotected

**Total issues found: 80+**

*This audit covers 100+ files across the entire Next.js frontend, API routes, authentication system, payment processing, dashboard, admin panel, team management, and Express backend infrastructure.*
