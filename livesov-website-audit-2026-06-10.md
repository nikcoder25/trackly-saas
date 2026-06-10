# Livesov.com — Full Website Audit

**Date:** June 10, 2026
**Scope:** Entire public website (marketing pages, free tools, auth pages, APIs, SEO surface)
**Method:** Production build of `main` (commit `f901a86`) run locally; full BFS crawl of every internal link (115+ URLs), sitemap verification, dynamic-route fuzzing, public API smoke tests, metadata/JSON-LD scan, code review of middleware/auth/instrumentation. The live livesov.com origin was not reachable from the audit sandbox (network egress restricted), so everything below was verified against a production-mode server built from the exact code that deploys to livesov.com.

---

## Executive summary

The site is in good shape structurally — clean build, 903/903 tests passing, zero broken internal links, zero broken assets, valid structured data, and strong security headers. However, the audit found **one critical functional bug** (every free tool is broken for signed-out visitors), **three high-severity issues** (soft-404s on four content sections, a disabled payments safety check, and a sitemap missing ~45 pages), and a handful of medium/minor SEO and performance items.

| # | Severity | Issue |
|---|----------|-------|
| 1 | **Critical** | All free tools return 403 "Invalid or missing CSRF token" for anonymous visitors |
| 2 | High | Nonexistent /blog, /glossary, /best, /case-studies URLs return HTTP 200 (soft-404) |
| 3 | High | Production "test_mode payments" boot guard is dead code (`if (false && …)`) |
| 4 | High | sitemap.xml omits ~45 indexable pages (glossary, best-of, case studies, docs, resources, integrations subpages, statistics page) |
| 5 | Medium | Missing `og:image` on 6 page groups (no social share cards) |
| 6 | Medium | Every marketing page is uncacheable (`Cache-Control: no-store`, fully dynamic SSR) |
| 7 | Medium | /login and /signup canonical points to the homepage; duplicate meta description |
| 8 | Low | ~95 internal links written as absolute `https://livesov.com/...` URLs |
| 9 | Low | Several page titles exceed 65 chars (one case-study title is 168 chars) |
| 10 | Low | Deprecated `X-XSS-Protection` header still sent |

---

## 1. CRITICAL — Free tools are broken for signed-out visitors (403 on submit)

**What happens:** Any visitor who is not logged in and submits one of the free tools gets a raw error: `Invalid or missing CSRF token`. The request never reaches the tool logic.

**Affected pages (8 — the entire lead-gen tool funnel):**

| Page | Endpoint it POSTs to |
|---|---|
| /tools/llms-txt-generator | /api/tools/llms-txt-generator |
| /tools/ai-crawler-checker | /api/tools/ai-crawler-checker |
| /tools/competitor-finder | /api/tools/competitor-finder |
| /tools/citation-finder | /api/tools/citation-finder |
| /tools/chatgpt-mention-checker | /api/tools/chatgpt-mention-checker |
| /tools/geo-score-checker | /api/geo-audit |
| /tools/ai-readiness-audit | /api/geo-audit |
| /geo-audit (landing-page form) | /api/geo-audit |

(/tools/prompt-generator and /tools/share-of-voice-calculator are pure client-side and unaffected. /api/free-check is already exempt, so the homepage free check works.)

**Root cause:** The CSRF middleware (`src/middleware.ts`) requires a double-submit cookie+header pair on every non-exempt POST. The CSRF cookie is only ever issued by `createTokenCookieHeaders()` in `src/lib/auth.ts:84-98`, which runs exclusively on login / register / token refresh. Anonymous visitors never receive the cookie, `CsrfFetchInterceptor` finds nothing to mirror into the `X-CSRF-Token` header, and the middleware rejects the POST at `src/middleware.ts:369-375`. The `/api/tools/*` and `/api/geo-audit` paths are in neither `CSRF_EXEMPT_PREFIXES` (`middleware.ts:25`) nor `CSRF_BOOTSTRAP_PATHS` (`middleware.ts:34`).

**Verified:** On a production build, an anonymous POST with correct same-origin `Origin` header → 403. The same POST with a manually matched cookie/header pair → passes CSRF and reaches input validation (400 "Domain is required"), proving only the missing token blocks real users. Visiting the tool pages sets no cookies at all.

**Why it likely went unnoticed:** anyone who has ever logged in (e.g. the team) carries a long-lived CSRF cookie and the tools work for them. Only fresh/incognito visitors hit the 403.

**Suggested fix (either):**
- Add `/api/tools/` and `/api/geo-audit` to `CSRF_BOOTSTRAP_PATHS`. The Origin check still applies, which is exactly the protection level `/api/contact`, `/api/newsletter`, and `/api/free-check` already rely on. These endpoints are anonymous and non-credentialed, so CSRF adds nothing for them anyway; or
- Have the middleware issue an anonymous CSRF cookie on HTML GET responses when none is present.

A regression test (anonymous POST to each tool endpoint expects non-403) would prevent this class of breakage.

---

## 2. HIGH — Soft-404s: invalid content URLs return HTTP 200

`/blog/<anything>`, `/glossary/<anything>`, `/best/<anything>`, `/case-studies/<anything>` return **HTTP 200** with a "not found" body for slugs that don't exist (verified on the production build; e.g. `/blog/does-not-exist` → 200 "Post Not Found").

**Root cause:** All four pages correctly call `notFound()` in the page body, but `src/app/(public)/loading.tsx` wraps every public page in a Suspense boundary. The 200 response shell streams before the page component throws, so the status code can no longer be changed. Static-route 404s (`/vs/nope`, `/tools/nope`) work because no dynamic segment exists.

**Impact:**
- Search engines treat any garbage URL under these sections as a valid 200 page (classic soft-404; wastes crawl budget and can index junk URLs).
- The glossary/best/case-studies fallbacks at least set `robots: noindex` in metadata, but the **blog** fallback (`src/app/(public)/blog/[slug]/page.tsx:16`) returns only `{ title: 'Post Not Found' }` — no `noindex` — so junk blog URLs are fully indexable 200s.

**Suggested fix:** Call `notFound()` inside `generateMetadata` when the slug doesn't resolve (metadata is computed before streaming starts, so Next.js returns a real 404), and/or add `robots: { index: false }` to the blog fallback as a stopgap.

---

## 3. HIGH — Payments "live_mode" boot guard is disabled by dead code

`src/instrumentation.ts:89`:

```ts
const dodoEnv = (process.env.DODO_PAYMENTS_ENVIRONMENT || "test_mode").toLowerCase();
if (false && dodoEnv !== "live_mode") {
  throw new Error(`[Boot] DODO_PAYMENTS_ENVIRONMENT must be 'live_mode' in production, ...`);
}
```

The `false &&` makes the check unreachable. The comment above it ("refuse to boot on test_mode … real customers see test sandbox checkouts"), `.env.example`, and the surrounding boot-guard design all say production must refuse to boot with test-mode payments — but it never will. If `DODO_PAYMENTS_ENVIRONMENT` ever regresses to `test_mode` in production, customers would silently get sandbox checkouts. Either remove the `false &&` (restoring the guard) or delete the block and its now-false comments.

---

## 4. HIGH — sitemap.xml is missing ~45 live, indexable pages

`src/app/sitemap.ts` is a hardcoded list (42 URLs) that was never updated as sections shipped. Missing, all verified live with full SEO metadata and internal links pointing at them:

- `/glossary` + all 28 `/glossary/[term]` pages
- `/best` + all 7 `/best/[slug]` list pages
- `/case-studies` + all 5 `/case-studies/[brand]` pages
- `/docs`
- `/resources` and `/resources/ai-visibility-report-template`
- `/integrations/api`, `/integrations/slack`, `/integrations/zapier`
- `/ai-search-statistics-2026`

For a product whose pitch is AI-search visibility, the programmatic SEO sections being absent from the sitemap is self-defeating. Blog posts are already generated from `@/data/blog-posts`; the same pattern should be applied to glossary terms, best-of categories, and case studies (their slug data also lives in `src/data/`).

---

## 5. MEDIUM — Missing `og:image` on six page groups

No `og:image` (so no social/link-preview card) on: `/case-studies` + all case-study pages, `/docs`, `/resources` + template page, all three `/integrations/*` subpages, and all `/glossary/[term]` pages. The older marketing pages all have one.

## 6. MEDIUM — Marketing pages are fully dynamic and uncacheable

Every public page is server-rendered on demand (`ƒ` in the build) and ships `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. No CDN or browser caching for content that changes rarely — every page view is a full SSR round trip. This is a side effect of the per-request CSP nonce in middleware. It's a deliberate trade-off, but worth knowing it's costing TTFB and server load on the highest-traffic pages; if desired, the marketing tree could move to cached/static rendering with hash-based CSP for inline scripts.

## 7. MEDIUM — /login and /signup metadata issues

Both pages set `rel=canonical` to `https://livesov.com` (the homepage) and reuse the homepage meta description. They also have no `<h1>`. Low SEO impact because robots.txt disallows both, but the canonical-to-homepage is wrong and worth fixing (self-canonical + `noindex`).

## 8. LOW — Absolute self-links

~95 internal links across the marketing pages are written as absolute `https://livesov.com/...` hrefs (e.g. in /best, /glossary, blog content). All resolve correctly (verified each path), but plain absolute `<a>` links skip Next.js client-side navigation/prefetch and make staging/preview environments link back to production. Prefer relative paths.

## 9. LOW — Title length

Several titles exceed ~65 chars and will truncate in SERPs; `/ai-search-statistics-2026` is 103 chars and case-study titles run up to 168 chars (e.g. lumen-fintech).

## 10. LOW — Deprecated header

`X-XSS-Protection: 1; mode=block` is deprecated and ignored by modern browsers (can enable XSS filtering side-channels in old ones). Safe to drop; CSP already covers this.

---

## What was checked and found healthy

- **Build & tests:** `next build` clean, `tsc --noEmit` clean, **903/903 unit tests pass**.
- **Crawl integrity:** 115+ internal URLs crawled from `/` — every page 200, no broken internal links, no orphan 404s; all 42 sitemap URLs 200; all 95 absolute livesov.com link targets resolve; all referenced images/assets exist.
- **Content quality:** no placeholder text (lorem ipsum / TODO / `undefined` / `NaN` / `[object Object]`) anywhere in rendered HTML.
- **Structured data:** 94 JSON-LD blocks across the site — all parse as valid JSON.
- **robots.txt / llms.txt:** correct (dashboard/api/auth disallowed, sitemap referenced; llms.txt accurate and well-formed).
- **Redirects:** `/home` → `/` (308), `/dashboard` → `/login?redirect=…` (307), unknown static routes 404 properly.
- **Security posture (request-level):** nonce-based CSP, HSTS, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy, Permissions-Policy all present; API rate limiting works; CSRF double-submit enforced (see finding #1 for the over-enforcement side effect); same-origin checks on anonymous POST endpoints; contact/newsletter/free-check validate input correctly (no 500s on malformed payloads).
- **Health endpoint:** `/api/health` reports DB + Redis status correctly.

## Out of scope / not testable from this environment

- The **live** livesov.com origin (sandbox egress is blocked) — findings were verified on a production-mode build of `main`; if production runs a different commit, statuses could differ.
- Client-side runtime JS errors in a real browser (no headless browser available in the sandbox). Recommend a quick manual pass with DevTools console open, especially on the dashboard.
- External outbound links (~60 unique domains) and social profiles — not verified.
- Auth/dashboard end-to-end flows — the `users` table schema lives only in the production DB (created by the legacy Express app), so register/login could not be exercised locally. The earlier dashboard audit (`livesov-brand-audit-report.md`) covers that surface.
- Payments, email delivery, AI provider calls (no live keys in the sandbox — by design).
