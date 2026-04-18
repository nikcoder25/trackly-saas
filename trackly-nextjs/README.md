# Livesov - Next.js Frontend

AI Visibility Tracker - Track how AI platforms like ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 + legacy CSS variables
- **Database:** PostgreSQL (via `pg` pool)
- **Auth:** JWT (httpOnly cookies) + Google OAuth
- **Payments:** DodoPayments

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database (shared with the Express app)

### Environment Variables

Create a `.env` file:

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-jwt-secret
CRON_SECRET=your-cron-secret

# AI Platform API Keys (at least one required for running queries)
OPENAI_API_KEY=sk-...
PERPLEXITY_API_KEY=pplx-...
CLAUDE_API_KEY=sk-ant-...
GEMINI_API_KEY=AI...
GROK_API_KEY=xai-...

# Optional
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
DODO_API_KEY=...
DODO_WEBHOOK_SECRET=...
ENCRYPTION_KEY=...

# Cron / scheduler (optional - defaults shown)
REDIS_URL=redis://...             # enables Redis-backed cron lock + BullMQ queue
CRON_LOCK_ENABLED=true            # set to "false" to force Postgres fallback
CRON_LOCK_TTL_MS=                 # global override for Redis lock TTL (default: per-call staleAfterMinutes)
CRON_INTERVAL_MINUTES=60          # in-process trigger cadence (clamped to [1, 1440])
APP_URL=https://your-host         # required for the in-process trigger to self-hit /api/cron

# Observability (optional - defaults shown)
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...   # enables Sentry error + logs ingestion
SENTRY_LOGS_ENABLED=true          # set to "false" to disable Sentry Logs forwarding
                                  # (console.* output is never affected - instant kill switch)
```

### Observability

Server-side structured logs are forwarded to Sentry Logs via
`src/lib/logger.ts`. The wrapper dual-writes to `console.*` (so App
Platform runtime logs stay complete) and to `Sentry.logger.*` (so logs
are searchable historically in Sentry).

- Enable Sentry Logs ingestion by setting `NEXT_PUBLIC_SENTRY_DSN` -
  `enableLogs: true` is already configured in the server / edge
  Sentry configs.
- Kill switch: set `SENTRY_LOGS_ENABLED=false` to stop forwarding
  without redeploying. Console output is unaffected.
- Docs: https://docs.sentry.io/product/explore/logs/getting-started/

### Cron scheduling

Scheduled brand runs and payment reconciliation are driven by
[`.github/workflows/cron.yml`](../.github/workflows/cron.yml). The Next.js
app also starts an in-process trigger in `src/instrumentation.ts` as a
belt-and-suspenders fallback - both sources are deduped by the
`acquireCronLock` helper in `src/lib/cron-lock.ts`.

The lock prefers Redis (`SET cron:lock:<name> <token> PX <ttl> NX`) and
falls back to the `cron_locks` Postgres table when Redis is unreachable or
`CRON_LOCK_ENABLED=false`. Contended acquires log a structured
`{msg:"cron.skip", reason:"locked"}` line and return HTTP 200 with
`{ skipped: true, reason: "locked" }` so overlapping runs never 500.

### Install & Run

```bash
npm install
npm run dev     # Development server on http://localhost:3000
npm run build   # Production build
npm start       # Start production server
```

## Folder Structure

```
src/
├── app/
│   ├── (auth)/          # Login, signup, reset-password pages
│   ├── (dashboard)/     # Dashboard pages (setup, proof, trends, etc.)
│   ├── (public)/        # Landing pages, blog, pricing, SEO pages
│   └── api/             # API routes
│       ├── auth/        # Authentication endpoints
│       ├── brands/      # Brand CRUD + run queries + analytics
│       ├── payments/    # DodoPayments checkout & webhooks
│       └── ...
├── components/
│   ├── auth/            # Auth layout
│   ├── dashboard/       # Sidebar, Topbar, shared form components
│   └── seo/             # SEO layout for public pages
├── contexts/            # React contexts (Auth, Language)
├── lib/                 # Server utilities (db, auth, AI platforms, parser)
├── locales/             # i18n translations (en, es, fr)
└── styles/              # Global CSS + legacy dashboard styles
```

## Key Features

- **Brand Setup** - Configure brand name, aliases, queries, nearby areas, AI platforms
- **Query Runs** - Send queries to 6 AI platforms and analyze responses
- **Evidence & Proof** - Full AI responses with brand mention highlighting
- **SOV Tracking** - Share of Voice trends over time
- **Competitors** - Track competitor mentions alongside your brand
- **Citation Analysis** - See which sources AI platforms cite
- **Scheduled Runs** - Automatic cron-based query execution
- **Team Sharing** - Invite team members with role-based access
