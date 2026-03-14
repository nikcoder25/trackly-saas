# Trackly — AI Visibility Tracker SaaS

## What We Built

Trackly is a SaaS platform that tracks how brands appear in AI-generated answers across 8 major LLM platforms. It helps businesses monitor their "AI visibility" — essentially SEO for the age of AI (Generative Engine Optimization / GEO).

Users create brands, write queries (e.g., "Best HVAC company in Austin TX"), and Trackly fires those queries at multiple AI platforms simultaneously, then analyzes the responses to detect brand mentions, sentiment, recommendations, competitor references, and Share of Voice (SOV).

---

## Tech Stack

| Layer          | Technology                                   |
|----------------|----------------------------------------------|
| Backend        | Node.js + Express.js                         |
| Database       | PostgreSQL (with JSON file fallback)         |
| Frontend       | Vanilla JavaScript SPA                       |
| Auth           | JWT + Refresh Tokens + TOTP 2FA              |
| Styling        | Custom CSS, fully responsive                 |
| Payments       | DodoPayments integration                     |
| Email          | SendGrid-compatible API                      |

---

## Supported AI Platforms

1. **ChatGPT** (OpenAI) — with search API support
2. **Perplexity** — web-grounded responses
3. **Claude** (Anthropic) — via official API
4. **Gemini** (Google) — cost-effective tracking
5. **Grok** (xAI)
6. **Google AIO** (AI Overview)
7. **DeepSeek**
8. **Mistral**

Each platform supports multiple model tiers ranked by cost, enabling free-tier users to access the cheapest models (Gemini & DeepSeek) while paid users unlock all 8 platforms.

---

## Core Features

### Brand Tracking & Query Execution
- Create and manage brands with metadata (industry, website, city, goal SOV%)
- Configure custom queries per brand
- Run queries against selected AI platforms in parallel batches
- **Real-time streaming** results via Server-Sent Events (SSE)
- Background execution — runs continue even if the browser tab is closed
- Response caching (24h for static models, 6h for search models) to reduce API costs

### Advanced Mention Detection
The parsing engine uses a 6-strategy approach:
- Exact word-boundary matching
- Punctuation-stripped matching
- Space-collapsed matching
- Fuzzy word-proximity (for complex brand names)
- Domain name detection
- Alias matching

Plus: sentiment analysis, recommendation detection, location relevance, competitor mentions, list position tracking, and citation/URL extraction.

### Share of Voice (SOV)
- SOV calculated as % of queries where the brand was mentioned
- Per-platform SOV breakdown
- Historical SOV tracking across runs with trend analysis

### Scheduled Runs & Reports
- Automated hourly/weekly query runs (Pro & Agency plans)
- PostgreSQL advisory locks for safe distributed cron execution
- Weekly and monthly email reports with mentions, SOV, and trends

### Team Collaboration
- Share brands with team members (viewer role)
- Role-based access control
- Full audit logging of all user actions

### Reporting & Export
- CSV export for brand mention data and full responses
- Run history with the last 30 runs kept in-memory; older runs archived to DB
- API call logs with cost and token tracking

---

## Subscription Plans

| Plan       | Brands | Queries | Platforms          | Runs/Day | Price   |
|------------|--------|---------|--------------------|----------|---------|
| **Free**   | 1      | 10      | 2 (Gemini, DeepSeek) | 2      | $0      |
| **Pro**    | 5      | 25      | All 8              | 10       | $29/mo  |
| **Agency** | 20     | 50      | All 8              | 50       | $99/mo  |

---

## Authentication & Security

- **JWT auth** with 15-minute access tokens and refresh token rotation
- **Two-Factor Authentication** — TOTP via Google Authenticator/Authy with 8 backup codes
- **API key encryption** — AES-256-GCM for stored platform keys
- **Password hashing** — bcrypt with 12 rounds
- **Rate limiting** — per-endpoint (20 auth attempts/15min, 120 API requests/min, 5 runs/min)
- **Atomic operations** — PostgreSQL transactions with `SELECT FOR UPDATE` for race condition prevention
- **Per-brand execution locks** — prevent concurrent runs on the same brand
- **HTTPS enforcement** in production with HSTS headers
- **GDPR-compliant** account deletion with CASCADE deletes

---

## API Structure

### Authentication (`/api/auth`)
Registration, login (with 2FA support), token refresh, email verification, password reset, username updates, account deletion, and full 2FA lifecycle (setup → verify → disable).

### Brands (`/api/brands`)
CRUD operations, query execution with SSE streaming, run status polling, run history, recheck mentions, and webhook notifications.

### Admin (`/api/admin`)
User management, plan assignment, API logs, activity logs, platform key status, and payment configuration.

### Payments (`/api/payments`)
DodoPayments checkout session creation and webhook handling for payment events, subscription lifecycle, and refunds.

---

## API Key Management

- **Multi-key support** — comma-separated or numbered env vars (`OPENAI_API_KEY_1`, `OPENAI_API_KEY_2`, etc.)
- **Round-robin rotation** to distribute load across keys
- **Per-key rate limiting** with automatic retry and exponential backoff for 429 errors

---

## Project Structure

```
trackly-saas/
├── server.js              # Express server, routes, cron jobs
├── package.json           # Dependencies & scripts
├── middleware/
│   └── auth.js            # JWT authentication middleware
├── config/
│   └── db.js              # PostgreSQL pool, schema init, audit logging
├── lib/
│   ├── ai-platforms.js    # API integrations, rate limiting, caching
│   ├── parser.js          # Brand mention detection, sentiment analysis
│   ├── helpers.js         # Encryption, API key loading, brand CRUD
│   ├── email.js           # Email sending
│   ├── plans.js           # Plan limit definitions
│   ├── totp.js            # 2FA TOTP implementation
│   └── logger.js          # Logging utility
├── routes/
│   ├── auth.js            # Auth endpoints
│   ├── brands.js          # Brand CRUD & query execution
│   ├── admin.js           # Admin endpoints
│   ├── payments.js        # DodoPayments integration
│   └── seo.js             # SEO landing page routes
├── public/
│   ├── index.html         # Main SPA (~4700 lines)
│   ├── css/styles.css     # Styling (~1300 lines)
│   └── js/app.js          # SPA logic (~4600 lines)
└── data/
    └── db.json            # JSON fallback (auto-created)
```

---

## Notable Technical Decisions

1. **SSE streaming** — real-time results while maintaining background execution
2. **Response caching** — LRU cache (10K entries) reduces API costs across brands
3. **Advisory locks** — PostgreSQL native locks for distributed cron coordination
4. **Atomic run limits** — transactions prevent exceeding daily run quotas under concurrency
5. **Lazy pagination** — only last 30 runs in-memory; older runs archived to DB
6. **Graceful degradation** — platform failures don't stop the entire run
7. **Multi-key rotation** — built-in load balancing across API keys
8. **Admin-only owner plan** — prevents privilege escalation via self-service

---

## Summary

Trackly is a production-ready SaaS application with a comprehensive feature set: multi-platform AI querying, advanced brand mention parsing, real-time streaming, subscription billing, 2FA authentication, team collaboration, scheduled automation, and a full admin panel. It's built for scalability with PostgreSQL, distributed-safe cron jobs, and API key rotation — ready to serve hundreds of active users tracking their AI visibility.
