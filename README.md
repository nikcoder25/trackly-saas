# Livesov - AI Visibility Tracker

Track how your brand appears in ChatGPT, Perplexity, Claude, Gemini, Grok, and Google AI Overviews.

> **The application lives in [`./trackly-nextjs/`](./trackly-nextjs/).** The previous Express monolith at the repository root has been removed - all features (auth, brands, analytics, payments, admin, PDF reports, scheduled email digests, SEO pages) now live in the Next.js app. History for the old Express code is preserved in git prior to the consolidation commit.

---

## Quick start

```bash
# 1. Install deps for the Next.js app
cd trackly-nextjs
npm install

# 2. Configure environment
cp .env.example .env
#    The required minimum is DATABASE_URL and JWT_SECRET (≥32 chars).

# 3. Run locally
npm run dev
# http://localhost:3000
```

From the repo root the root-level `package.json` just forwards into `trackly-nextjs`, so you can also do:

```bash
npm run install:all
npm run dev
npm test
```

## Deployment

- **Vercel**: point the project at the repo root and set the project root to `trackly-nextjs/`. `vercel.json` inside that directory wires the hourly `/api/cron` endpoint plus the weekly / monthly `/api/cron/reports` digests.
- **DigitalOcean / self-hosted**: deploy the `trackly-nextjs/` directory as a standard Next.js app (`npm run build && npm start`). `src/instrumentation.ts` includes a self-triggering cron scheduler that hits `/api/cron` every hour if `APP_URL` and `CRON_SECRET` are set - set those env vars when there is no external cron provider.

## Environment variables

Every env var the app reads is documented in [`trackly-nextjs/.env.example`](./trackly-nextjs/.env.example). The highlights:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. Schema + migrations auto-apply on boot. |
| `JWT_SECRET` | Signs session JWTs. ≥32 characters in production. |
| `ENCRYPTION_KEY` | 32-byte hex. Encrypts per-user AI API keys at rest. |
| `ALLOWED_ORIGINS` | Comma-separated list of origins for CORS / CSRF. |
| `ADMIN_SECRET` | Gate for the admin surface and the bootstrap admin promotion. |
| `CRON_SECRET` | Bearer token required by `/api/cron*` endpoints. |
| `DODO_PAYMENTS_*` | DodoPayments API key, webhook secret, and product IDs per plan. |
| `EMAIL_API_KEY` / `EMAIL_API_URL` | Transactional email (Resend by default, SendGrid-compatible). |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | Google AI Overviews checks. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Sign-In. |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry (optional). |
| `APP_URL` | Public base URL of the deployment. |

## Tests

```bash
# From the repo root - forwards into trackly-nextjs
npm test

# Or directly:
cd trackly-nextjs && npm test
```

The suite covers the token-hashing helper, the webhook HMAC verifier, and the SSRF guard used by brand webhooks. More coverage is incoming.

## Repository layout

```
livesov/
├── package.json          # Thin wrapper - all scripts forward to trackly-nextjs/
├── trackly-nextjs/       # The Next.js application (source of truth)
│   ├── src/app/          # Routes, pages, and API handlers
│   ├── src/lib/          # Auth, DB, AI platforms, email, PDF reports, …
│   ├── tests/            # Vitest suite
│   ├── vercel.json       # Cron schedule for Vercel deployments
│   └── .env.example
└── README.md
```
