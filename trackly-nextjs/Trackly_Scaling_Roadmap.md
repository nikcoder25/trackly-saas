# Livesov Scaling Roadmap

**Date:** April 14, 2026
**Generated from:** Analysis of the actual codebase and infrastructure
**Purpose:** Offline reference guide for the founder

---

## 1. Current Architecture Summary

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | Next.js 16.2 + React 19 + Tailwind CSS 4 | Production |
| Backend | Next.js API Routes (75 endpoints) + Legacy Express | Production |
| Database | PostgreSQL 12+ (node-pg, pool max 50) | Production |
| Job Queue | BullMQ + Redis (optional) | Available |
| Payments | DodoPayments (webhook-based) | Production |
| Email | Resend (primary), Zoho SMTP (contact form) | Production |
| Auth | JWT (15min access + 7d refresh), TOTP 2FA, Google OAuth | Production |
| Monitoring | Sentry (client + server + edge) | Production |
| Deployment | Vercel (Next.js) + Railway/Render (Express) | Production |
| AI Platforms | 5 platforms (ChatGPT, Claude, Gemini, Perplexity, Grok) | Production |

**Database:** 25+ tables, 40+ indexes. Key tables: `users`, `brands`, `prompt_runs`, `prompt_run_stats`, `citations`, `competitor_cooccurrence`, `response_cache`, `daily_cost_tracker`.

**Current Plan Tiers:** Free ($0) | Starter ($9/mo) | Pro ($29/mo) | Agency ($89/mo) | Enterprise (Custom)

---

## 2. Scaling Phases

### Phase 1: Foundation Hardening (0-50 Users)

**Priority: HIGH | Timeline: Immediate | Cost: $0-50/mo**

- [ ] **Enable Redis + BullMQ in production** - The job queue (`src/lib/job-queue.ts`) is built but optional. Activate it to move brand runs off the Next.js event loop and prevent OOM crashes. Start the worker as a separate process: `npx tsx src/lib/run-worker.ts`
- [ ] **Add connection pool monitoring** - Current pool is configured at max 50 (`src/lib/db.ts:24`). Add logging for pool exhaustion events. At 50 users this is sufficient
- [ ] **Set up Sentry alerts** - Sentry is integrated but needs alert rules for error spikes, slow transactions (>5s), and failed payment webhooks
- [ ] **Add E2E tests** - Currently only 16 unit tests (helpers + plans). Add Playwright tests for signup, brand creation, and run execution flows
- [ ] **Enable response caching aggressively** - The 24-48hr cache (`response_cache` table) drastically reduces API costs. Verify cache hit rates via `api_logs`
- [ ] **Database backups** - Set up automated daily pg_dump or use managed Postgres (Railway/Supabase built-in backups)

### Phase 2: Performance Optimization (50-200 Users)

**Priority: HIGH | Timeline: Month 2-3 | Cost: $50-150/mo**

- [ ] **Add read replicas** - Separate read-heavy dashboard queries from write-heavy run execution. Route `/api/brands/[id]/prompt-runs` and analytics endpoints to replica
- [ ] **Implement query result pagination** - Several API endpoints return full result sets. Add cursor-based pagination to `prompt_runs`, `activity-logs`, `notifications`
- [ ] **Redis caching layer** - Cache frequently accessed data: plan limits, admin models (`src/lib/site-config.ts` already has 1-min memory cache), user sessions. Move rate limiting from PostgreSQL (`src/lib/rate-limit.ts`) to Redis
- [ ] **Optimize database queries** - Add composite indexes for common query patterns: `(brand_id, created_at DESC)`, `(user_id, platform, created_at)`
- [ ] **CDN for static assets** - Vercel handles this automatically, but ensure `Cache-Control` headers are set for public pages. Dashboard pages correctly use `no-store` already
- [ ] **Reduce ChatGPT API costs** - ChatGPT Search is ~$0.01/call (80% of total API cost). Consider defaulting Starter plan users to cheaper models (GPT-4o-mini at $0.0003/call) and reserving search models for Pro+

### Phase 3: Scale Architecture (200-1,000 Users)

**Priority: MEDIUM | Timeline: Month 4-8 | Cost: $200-800/mo**

- [ ] **Dedicated worker fleet** - Run 2-4 BullMQ workers on separate instances. The worker (`src/lib/run-worker.ts`) already supports this - just deploy multiple processes pointing to the same Redis
- [ ] **Database connection pooling (PgBouncer)** - At 200+ concurrent users, 50 direct connections won't suffice. Add PgBouncer in transaction mode between the app and Postgres
- [ ] **Implement queue prioritization** - Paid users should have priority in the BullMQ queue. Add priority levels: Enterprise (1) > Agency (2) > Pro (3) > Starter (4) > Free (5)
- [ ] **Horizontal API scaling** - Deploy multiple Next.js instances behind a load balancer. The app is already stateless (JWT auth, DB-backed rate limiting). Session state lives in cookies
- [ ] **Batch scheduling optimization** - The hourly cron (`vercel.json` cron at `0 * * * *`) processes all scheduled brands sequentially. Partition by priority and run in parallel batches
- [ ] **Implement webhook retry queue** - DodoPayments webhooks (`/api/payments/webhooks/dodopayments`) need a dead-letter queue for failed processing. Store failed events and retry with exponential backoff

### Phase 4: Enterprise Scale (1,000+ Users)

**Priority: LOW | Timeline: Month 9-18 | Cost: $1,000-5,000/mo**

- [ ] **Multi-region deployment** - Deploy to US-East + EU-West. Use geo-routing at the CDN layer. The geo-audit feature already tracks location-based results
- [ ] **Database sharding strategy** - Shard `prompt_runs` and `response_cache` by `brand_id`. These are the highest-volume tables. Keep `users` and `brands` on a single primary
- [ ] **Dedicated tenant isolation** - Enterprise customers get isolated worker pools and dedicated database schemas. Prevents noisy-neighbor issues
- [ ] **API gateway** - Add rate limiting, authentication, and request routing at the edge. Consider Cloudflare Workers or AWS API Gateway
- [ ] **Event-driven architecture** - Replace direct DB writes with an event bus (Redis Streams or Kafka) for real-time analytics, alerting, and audit logging
- [ ] **SOC 2 / GDPR compliance** - Audit logging is already in place (`audit_logs` table). Add data retention policies, right-to-delete automation, and encryption at rest for PII fields

---

## 3. Infrastructure Cost Projections

| Users | Brands (est.) | Monthly Infra Cost | Monthly Revenue (est.) | Viable? |
|------:|-------------:|-----------------:|---------------------:|:-------:|
| 10 | 15 | ~$27 | $150-250 | Yes |
| 30 | 45 | ~$55 | $450-750 | Yes |
| 60 | 90 | ~$130 | $900-1,500 | Yes |
| 100 | 180 | ~$180 | $1,800-3,000 | Yes |
| 200 | 300 | ~$350 | $3,000-5,000 | Yes |
| 500 | 600 | ~$800 | $6,000-10,000 | Yes |
| 1,000 | 1,500 | ~$2,000 | $15,000-30,000 | Yes |

**Note:** Revenue estimates assume $30-50/user/month average. Actual margins depend on AI API costs which scale with brand count. ChatGPT Search ($0.01/call) dominates cost; other 5 platforms combined cost <$0.002/query.

### Cost Breakdown by Component

| Component | 50 Users | 200 Users | 1,000 Users |
|-----------|---------|----------|------------|
| PostgreSQL (managed) | $15/mo | $50/mo | $200/mo |
| Redis | $0 (free tier) | $15/mo | $50/mo |
| Vercel (Next.js) | $20/mo | $40/mo | $150/mo |
| Worker instances | $0 (shared) | $30/mo | $200/mo |
| AI API calls | $20/mo | $150/mo | $800/mo |
| Email (Resend) | $0 (free tier) | $20/mo | $50/mo |
| Sentry | $0 (free tier) | $26/mo | $80/mo |

---

## 4. Database Scaling Roadmap

### Current State
- Single PostgreSQL instance, pool max 50 connections
- 25+ tables with 40+ indexes
- Statement timeout: 30s (`src/lib/db.ts:28`)
- Auto-migration via `CREATE TABLE IF NOT EXISTS`

### Scaling Steps

1. **Now:** Enable `pg_stat_statements` to identify slow queries
2. **50 users:** Add missing indexes on `prompt_runs(brand_id, platform, created_at)` and `response_cache(cache_key, expires_at)`
3. **200 users:** Add PgBouncer, increase pool to 100 connections, add read replica
4. **500 users:** Partition `prompt_runs` by month (table partitioning). Archive runs older than 12 months
5. **1,000 users:** Evaluate sharding `response_cache` and `prompt_runs` by brand_id hash

### Data Retention Policy (Recommended)

| Table | Retention | Action |
|-------|----------|--------|
| `prompt_runs` | 12 months | Archive to cold storage |
| `response_cache` | 48 hours (already) | Auto-cleanup via cron |
| `api_logs` | 90 days | Purge |
| `audit_logs` | 2 years | Required for compliance |
| `rate_limits` | Ephemeral | Auto-cleanup every 5 min |
| `notifications` | 90 days | Purge read notifications |

---

## 5. AI API Cost Optimization

### Current Cost Per Query by Platform

| Platform | Model | Input $/1M | Output $/1M | Notes |
|----------|-------|-----------:|------------:|-------|
| ChatGPT (default) | gpt-5.4-mini | $0.75 | $4.50 | Default lineup; non-search path |
| ChatGPT (premium) | gpt-5.4 | $2.50 | $15.00 | Admin opt-in for premium tier |
| ChatGPT (analysis) | gpt-5.4-nano | $0.20 | $1.25 | Fact-checker / internal-analysis tier |
| Claude | claude-haiku-4-5 | $0.80 | $4.00 | Good balance |
| Perplexity | sonar | $1.00 | $1.00 | Search-native, includes citations |
| Gemini | gemini-2.5-flash-lite | $0.075 | $0.30 | Cheapest option |
| Grok | grok-3-mini | $0.30 | $0.50 | Very affordable |

The `web_search_options` surcharge ($0.030/call) on the legacy
`*-search-preview` lineup was the May-11 cost incident driver. The
gpt-5.4 family removes that surcharge from the default path entirely;
the freshness gate (`WEB_SEARCH_DEFAULT_OFF=true`) and 150-call/day
budget cap (`AI_SEARCH_BUDGET_CHATGPT=150`) remain as defense-in-depth
for any admin-selected `*-search-preview` model.

### Optimization Strategies (status: shipped this PR)

1. **web_search OFF by default** - `WEB_SEARCH_DEFAULT_OFF=true` gates the
   per-call surcharge behind a strict freshness classifier (only fires on
   "today / this week / breaking news / live score / weather / right now"
   anchors).
2. **Daily search budget capped at 150 calls/day** -
   `AI_SEARCH_BUDGET_CHATGPT=150` (~$3.75/day ceiling). When exhausted,
   ChatGPT falls back to gpt-5.4.
3. **gpt-5.4 family as default** - Replaces gpt-4o-mini-search-preview /
   gpt-4o; the new lineup has no `search` in the model name so
   `web_search_options` is structurally not attached on default calls.
4. **Internal analysis on gpt-5.4-nano** - fact-checker downgraded from
   gpt-4o-mini.
5. **Response cache TTL → 7 days** - Non-search responses now live 7
   days (was 72h); cache key normalization strips trailing punctuation
   so "best plumber" / "best plumber?" / "best plumber!" share a row.
6. **Prompt caching invariant** - System prompt is byte-identical across
   calls (region context moved to the user message in geo-audits) so
   OpenAI's automatic prompt caching engages once the prefix grows past
   the ~1024-token threshold.

Deferred (24h SLA risk needs more planning):
- Batch API for scheduled scans. **Do NOT enable `CHATGPT_BATCH_ENABLED`
  as wired today.** The worker submits one single-item batch per query and
  polls it inline under the per-task abort budget
  (`RUN_PER_QUERY_TIMEOUT_MS`, default 180s), while OpenAI batches
  routinely take minutes-to-hours — so nearly every batch would be
  abandoned at 180s and the query re-billed on the sync fallback.
  Abandoned batches are now cancelled best-effort (POST
  /v1/batches/{id}/cancel) so the orphan can't also complete and
  double-bill, but that only caps the downside; there are still no
  savings. The viable design is run-level aggregation: collect a run's
  (or the daily cron tick's) no-search ChatGPT queries into ONE batch,
  submit before / outside the per-query task loop, and harvest results
  into the response cache so the per-query path hits cache.

June 2026 addendum — shipped after the public-tools cost review:
7. **Response cache on all `queryAI` callers** - The free public tools
   (/api/free-check, chatgpt-mention-checker, citation-finder,
   competitor-finder) and the authed helpers (ai-generate-queries,
   nearby-areas, nap-audit gaps) previously called `queryAI` bare and
   paid the provider on every request; they now go through
   `withCacheAndRetry` like the run paths, so identical prompts serve
   from `response_cache` for the full TTL.

---

## 6. Security Scaling Checklist

### Already Implemented
- [x] AES-256-GCM encryption for stored API keys
- [x] bcrypt (12 rounds) for passwords
- [x] JWT with short-lived access tokens (15min) + refresh rotation
- [x] TOTP 2FA with backup codes
- [x] Rate limiting (middleware + DB-backed)
- [x] CSP, HSTS, X-Frame-Options, X-XSS-Protection headers
- [x] Parameterized SQL queries (no raw string interpolation)
- [x] Audit logging with IP tracking
- [x] Webhook idempotency (dedup table)
- [x] Input sanitization (`src/lib/sanitize.ts`, `src/lib/spam-filter.ts`)

### Add Before 100 Users
- [ ] IP-based anomaly detection (multiple failed logins from same IP)
- [ ] Automated account lockout notifications via email
- [ ] API key rotation reminders for users storing their own keys
- [ ] Vulnerability scanning in CI/CD pipeline (npm audit + Snyk)

### Add Before 1,000 Users
- [ ] WAF (Web Application Firewall) - Cloudflare or AWS WAF
- [ ] DDoS protection at edge layer
- [ ] Penetration testing (annual)
- [ ] Bug bounty program
- [ ] Data encryption at rest (PostgreSQL TDE or disk-level encryption)

---

## 7. Feature Scaling Priorities

### High Impact, Low Effort
1. **Shared query cache** - Deduplicate identical queries across users. Single DB change + cache key normalization
2. **Webhook retry queue** - BullMQ dead-letter queue for failed payment/email webhooks
3. **Dashboard lazy loading** - Split 21 dashboard pages into dynamic imports (already using Next.js App Router)

### High Impact, Medium Effort
4. **Real-time WebSocket updates** - Replace SSE polling with WebSocket for run progress. Reduces connection overhead at scale
5. **Multi-brand batch runs** - Agency users with 20 brands need parallel execution. Current sequential approach is too slow
6. **White-label reports** - PDF export (`pdfkit` already in root `package.json`) with custom branding for agency clients

### High Impact, High Effort
7. **Public API** - RESTful API with API key auth for Enterprise customers. The internal API routes already exist - add versioning and docs
8. **Zapier/Make integration** - Webhook triggers when mention count changes, sentiment shifts, or new competitor detected
9. **Multi-tenant architecture** - Schema-per-tenant isolation for Enterprise accounts

---

## 8. Monitoring & Observability Roadmap

### Current State
- Sentry error tracking (client + server + edge)
- `api_logs` table tracks every API call with cost
- `audit_logs` table tracks user actions
- Health check endpoint (`/api/health`)

### Add Incrementally

| Users | Add |
|------:|-----|
| 50 | Uptime monitoring (Betterstack or Checkly) - ping `/api/health` every 60s |
| 100 | Database query performance dashboard (pg_stat_statements + Grafana) |
| 200 | APM (Application Performance Monitoring) - Sentry Performance or Datadog |
| 500 | Custom business metrics dashboard: DAU, runs/day, cache hit rate, API cost/user |
| 1,000 | Distributed tracing across Next.js → Worker → AI APIs → Database |

---

## 9. Team Scaling Guide

| Users | Team Size | Roles Needed |
|------:|----------:|-------------|
| 0-100 | 1 (founder) | Full-stack development, support, marketing |
| 100-500 | 2-3 | + Part-time DevOps, part-time support |
| 500-1,000 | 4-6 | + Dedicated backend engineer, customer success |
| 1,000-5,000 | 8-12 | + Frontend engineer, data engineer, sales |
| 5,000+ | 15+ | + Security engineer, SRE, product manager |

---

## 10. Quick Reference: Critical File Paths

| Purpose | File |
|---------|------|
| Database config & pool | `src/lib/db.ts` |
| Plan limits & pricing | `src/lib/constants.ts` |
| AI platform integrations | `src/lib/ai-platforms.ts` |
| Background job queue | `src/lib/job-queue.ts` |
| Background job worker | `src/lib/run-worker.ts` |
| Auth middleware | `src/middleware.ts` |
| Rate limiting | `src/lib/rate-limit.ts` |
| Email service | `src/lib/email.ts` |
| Site config (admin models) | `src/lib/site-config.ts` |
| Sentry config | `sentry.client.config.ts`, `sentry.server.config.ts` |
| Deployment config | `vercel.json` |
| Environment variables | `.env.example` |

---

*This document was generated on April 14, 2026 based on analysis of the actual Livesov codebase and infrastructure. All file paths, configurations, costs, and technical details reflect the current state of the repository.*
