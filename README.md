# Livesov — AI Visibility Tracker SaaS

Track how your brand appears in ChatGPT, Perplexity, Claude, Gemini, Grok, and Google AI Overviews.

The repository hosts two applications that share one PostgreSQL database:

- `./` — the production Express monolith (`server.js`, `routes/*`, `lib/*`).
- `./trackly-nextjs/` — a Next.js rewrite of the same product (see its own README).

Unless you have a reason to work in the Next.js tree, the Express app is the one to run.

---

## Quick start (local)

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill it in
cp .env.example .env
#    You MUST set at minimum:
#       DATABASE_URL=postgres://...
#       JWT_SECRET=<64 random hex bytes>

# 3. Start server (dev)
npm start
# Server listens on http://localhost:3000
```

### Required environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. Schema is auto-created on boot. |
| `JWT_SECRET` | Signs session JWTs. In production it must be at least 32 characters. |

### Strongly recommended

| Variable | Purpose |
|---|---|
| `ENCRYPTION_KEY` | 32-byte hex. Encrypts user API keys at rest. If unset, `JWT_SECRET` is used — rotating `JWT_SECRET` will then make every stored key unrecoverable. |
| `ALLOWED_ORIGINS` | Comma-separated list of origins (e.g. `https://livesov.com,https://www.livesov.com`). Required for CORS/CSRF. |
| `ADMIN_SECRET` | Gate for `/admin` panel and the `make-first-admin` bootstrap. Long random string. |
| `CRON_SECRET` | Required by the Next.js cron endpoints (`/api/cron*`). Ignored by Express, which runs in-process cron. |

### Optional

DodoPayments (`DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`, `DODO_STARTER_PRODUCT_ID`, `DODO_PRO_PRODUCT_ID`, `DODO_AGENCY_PRODUCT_ID`, `DODO_ENTERPRISE_PRODUCT_ID`), Resend / SMTP for transactional email, DataForSEO for Google AI Overviews checks, Google OAuth (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) and Sentry. See `.env.example` for the full list.

---

## Build the frontend bundle

```bash
npm run build
# Concatenates public/js/src/*.js → public/js/app.js,
# then minifies to public/js/app.min.js and
# minifies public/css/styles.css → public/css/styles.min.css.
```

---

## Data storage

The app is PostgreSQL-only. Tables (users, brands, prompt_runs, password_reset_tokens, api_logs, notifications, site_config, daily_costs, webhook_events, audit_log, cron_locks, …) are created and migrated automatically on boot via `config/db.js::initDB`.

- **Sensitive data at rest** — bcrypt for passwords, AES-256-GCM for stored API keys, SHA-256 digests for refresh and password-reset tokens.
- **Sessions** — JWT access tokens (15 min) and rotating refresh tokens stored as httpOnly, SameSite=strict cookies. `localStorage` holds only non-sensitive UI state.

The legacy file-backed `data/db.json` flow referenced in earlier versions of this README has been removed; ignore any instructions that point there.

---

## Running in production

Recommended stack for single-box deployments:

- Node 20+ via PM2 or systemd
- Nginx as reverse proxy with SSL (Let's Encrypt)
- Postgres 14+
- Set `NODE_ENV=production` and all recommended env vars above

Multi-instance deployments (Railway, Render, Fly) work out of the box: cron jobs run only on worker 1 (`CLUSTER_WORKER_ID=1`), and brand-run locking uses Postgres advisory locks so concurrent workers cannot clobber each other.

```bash
pm2 start server.js --name livesov
pm2 save
```

Nginx sample:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## Tests

```bash
npm test   # vitest
```

Tests live under `./tests/` and cover `lib/helpers` and `lib/plans`. The Next.js tree does not yet have a suite — see its roadmap.

---

## Admin bootstrap

The first admin is promoted via an authenticated call that also requires `ADMIN_SECRET`:

```bash
curl -X POST https://your-host/api/admin/make-first-admin \
  -H "Authorization: Bearer <user JWT>" \
  -H "X-Admin-Key: <ADMIN_SECRET>"
```

Subsequent admins are promoted from the `/admin` panel.

---

## File layout

```
trackly-saas/
├── server.js              # Express bootstrap, middleware, cron
├── cluster.js             # Optional multi-worker launcher
├── config/
│   ├── db.js              # Pool, schema, migrations, cleanup
│   └── constants.js       # Plan / rate-limit / timeout tables
├── middleware/auth.js     # JWT + cookie auth middleware
├── lib/                   # AI platforms, parser, email, PDF, TOTP, …
├── routes/                # auth, brands, admin, analytics, payments, seo
├── public/                # SPA (index.html), legal pages, assets
├── trackly-nextjs/        # Parallel Next.js rewrite
└── tests/                 # vitest suites
```
