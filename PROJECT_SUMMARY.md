# Livesov - AI Visibility Tracker SaaS

## What Is Livesov?

Livesov is a SaaS platform that monitors how brands appear across AI platforms — ChatGPT, Perplexity, Claude, Gemini, and Grok. It helps marketers and brands understand their **Share of Voice (SOV)** in AI-generated answers, enabling **Generative Engine Optimization (GEO)** and **Answer Engine Optimization (AEO)** strategies.

---

## Tech Stack

| Layer        | Technology                                      |
|-------------|--------------------------------------------------|
| Backend     | Node.js + Express.js                             |
| Database    | PostgreSQL (parameterized queries, connection pool) |
| Frontend    | Vanilla JavaScript SPA, Chart.js                 |
| Auth        | JWT (access + refresh tokens), TOTP 2FA          |
| Payments    | DodoPayments (webhook-based subscription management) |
| Email       | Configurable HTTP API provider (SendGrid, Mailgun, etc.) |
| Scheduling  | node-cron (hourly brand runs, weekly/monthly reports) |
| Deployment  | PM2, Railway, Render, or any VPS                 |

---

## Features Built

### Authentication & User Management
- Email/password registration with email verification
- JWT access tokens (15min) + rotating refresh tokens
- Two-factor authentication (TOTP) with backup codes
- Password reset flow via email
- Account settings (username, password change, account deletion)

### Brand Tracking
- Create and manage brands with custom queries, competitors, and industry tags
- Run queries across up to 8 AI platforms simultaneously
- Real-time streaming results via Server-Sent Events (SSE)
- Scheduled automatic runs at configurable hourly intervals (Pro+)
- Per-brand platform and model selection

### AI Response Analysis
- **Sentiment analysis** — positive, negative, or recommended classification
- **Brand mention detection** — 6 matching strategies (exact, fuzzy, domain, aliases, etc.)
- **Competitor tracking** — detect when competitors appear in AI responses
- **Citation extraction** — pull source URLs from AI-generated answers
- **List position detection** — identify ranking in numbered lists
- **Location-based relevance** — detect geographic mentions

### Dashboard & Metrics
- Share of Voice (SOV) percentage across platforms
- Mention counts and trends over time
- Per-platform performance breakdowns
- Historical data with chart visualizations (Chart.js)

### Team Collaboration
- Share brands with team members
- Read-only or full-access permission levels

### Subscription & Billing
- Four-tier plan system: Free, Pro, Agency, Owner
- DodoPayments checkout integration with webhook processing
- Automatic plan upgrades/downgrades on payment events

| Plan    | Brands | Queries | Runs/Day | Competitors | Scheduled | Platforms |
|---------|--------|---------|----------|-------------|-----------|-----------|
| Free    | 1      | 10      | 2        | 0           | No        | 2         |
| Pro     | 5      | 25      | 10       | 5           | Yes       | 8         |
| Agency  | 20     | 50      | 50       | 20          | Yes       | 8         |
| Owner   | 9999   | 9999    | 99999    | 9999        | Yes       | 8         |

### Admin Panel
- User management (CRUD, plan changes)
- Audit logs for all user actions
- Dashboard with user statistics

### SEO
- Dedicated landing pages for each AI platform (e.g., "ChatGPT Brand Tracking")
- Robots.txt and SEO-friendly routing

---

## Security

- AES-256-GCM encryption for API keys at rest
- bcryptjs password hashing (cost factor 12)
- Rate limiting — auth (20/15min), general (120/min), query runs (5/min)
- HTTPS enforcement + HSTS headers in production
- Helmet security headers, CORS validation
- Parameterized SQL queries (no ORM, no injection)
- Timing-safe secret comparison

---

## Performance

- 24-hour response caching (static models), 6-hour (search models)
- LRU cache with 10,000 entry limit
- Round-robin API key rotation per platform
- Batch cron processing with concurrency limits (5 brands in parallel)
- PostgreSQL advisory locks for multi-instance safety
- Gzip compression

---

## Project Structure

```
trackly-saas/
├── server.js               # Express server, middleware, cron jobs
├── config/db.js            # PostgreSQL schema & utilities
├── middleware/auth.js       # JWT verification
├── routes/
│   ├── auth.js             # Auth endpoints (register, login, 2FA, etc.)
│   ├── brands.js           # Brand CRUD + query execution
│   ├── admin.js            # Admin panel + user management
│   ├── payments.js         # DodoPayments webhooks & checkout
│   └── seo.js              # SEO landing pages
├── lib/
│   ├── ai-platforms.js     # API integrations (8 AI platforms)
│   ├── parser.js           # Response parsing & sentiment analysis
│   ├── plans.js            # Plan limit definitions
│   ├── helpers.js          # Encryption, brand operations
│   ├── email.js            # Email sending
│   ├── logger.js           # Logging
│   └── totp.js             # TOTP 2FA implementation
├── public/
│   ├── index.html          # SPA shell + inline styles
│   └── js/app.js           # Complete frontend application
└── admin.html              # Admin panel SPA
```

---

## API Endpoints

### Auth (`/api/auth`)
`POST /register` · `POST /login` · `GET /verify-email` · `POST /resend-verification` · `POST /refresh` · `GET /me` · `PUT /username` · `POST /change-password` · `DELETE /account` · `POST /forgot-password` · `POST /reset-password` · `POST /2fa/setup` · `POST /2fa/verify` · `POST /2fa/disable` · `GET /2fa/status`

### Brands (`/api/brands`)
`GET /` · `POST /` · `GET /:id` · `PUT /:id` · `DELETE /:id` · `POST /:id/run` (SSE streaming) · `GET /:id/run-status/:runId`

### Admin & Logs
`GET /api/api-logs` · `DELETE /api/api-logs` · `GET /api/activity-logs` · `GET /api/keys/status` · `GET /api/plans` · `POST /api/upgrade` · `GET /api/admin/users` · `POST /api/admin/users` · `PUT /api/admin/users/:id` · `DELETE /api/admin/users/:id`

### Payments (`/api/payments`)
`POST /checkout` · `POST /webhooks/dodopayments` · `GET /payment-status`

---

## Database Tables

`users` · `brands` · `audit_logs` · `archived_runs` · `notifications` · `team_members` · `api_logs` · `password_reset_tokens` · `webhook_events`

---

## Deployment

Supported on Railway (recommended), Render, DigitalOcean/Hetzner/Vultr, or any Node.js-capable server. Requires PostgreSQL and a `JWT_SECRET` environment variable. Optional: email provider config, DodoPayments keys, and AI platform API keys.
