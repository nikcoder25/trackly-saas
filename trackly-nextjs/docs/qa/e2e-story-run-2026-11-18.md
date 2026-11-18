# E2E story run, 2026-11-18

## What was done

1. Pulled every closed PR from the last 6 months (#514 to #816). About 90 of them were bug fixes.
2. Wrote 200 user stories from those fixes ([user-stories.md](user-stories.md)). Each one targets a spot where the same class of bug could come back.
3. Built an automated check for every story in `tests/e2e-stories/` (169 API checks, 31 browser checks with Playwright).
4. Ran them against a production build (`next build && next start`) with a seeded local Postgres and Redis.

## First run

- API checks: 141 of 170 passed. 12 failures were real bugs (below). 17 were mistakes in the checks themselves, such as a wrong field name or an outdated assumption. Those checks were corrected.
- Browser checks: the failures came from the login rate limit (every browser shared one IP) and 3 wrong selectors. None were app bugs. The suite now signs in once per account, and each browser context gets its own IP.

## Bugs found and fixed

| Story | Bug | Fix |
|---|---|---|
| AUTH-03, AUTH-04, AUTH-05, BRAND-08, ACC-05, TEAM-02 | A junk or empty JSON body returned **500** on 20 routes, including the signed-out `/api/auth/login`, `/register`, `/forgot-password` and `/reset-password`. Scanners hit these all the time, so every hit logged a fake server error. | New `readJsonObject()` helper (`src/lib/read-json.ts`). All 20 routes now answer 400. The 4 auth routes were added to the anonymous-route guard test, and the ratchet went from 58 to 38. |
| BRAND-10 | `GET /api/brands/[id]/competitor-analysis` always returned 500. The `competitor_cooccurrence` table was only ever created by the retired Express app. | A missing table now returns an empty list. |
| DATA-09 | `prompt-runs?limit=-5` returned 500 (a negative LIMIT reached Postgres). | Both params now go through `intParam` with bounds. |
| ACC-02 | Toggling an accuracy issue with a non-numeric id returned 500. | A non-numeric id now returns 404. |
| FIX-08 | Any fix route called with an id that is not a UUID returned 500 (`invalid input syntax for type uuid`). | `getFix()` returns "not found" for a non-UUID id, so every fix route answers 404. |
| ALERT-03 | `PUT /api/alerts/[id]` with a wrong type (for example `enabled: "maybe"`, `cooldown_hours: "soon"`) returned 500. | Fields are now checked first, and bad input returns 400. |
| NAP-04 | Sending more than 500 URLs to the NAP audit API cut the list to the first 500 with no warning. | Create and edit now return 400 with "split the list". The dashboard already splits big pastes before sending, so it is not affected. |

## Found, not fixed (needs a product decision)

- **AI visibility alert rules never fire.** `/dashboard/alerts` saves rules to `alert_rules`, but no code ever reads them to send an email or webhook. The rank-tracking alerts are a separate system and do work. Making the visibility alerts fire means building a rule checker that runs after each scan and deciding what the emails say.

## Final run

200 of 200 stories passed. Unit tests: all passing (plus 9 new ones).

## How to run it

```
service postgresql start && service redis-server start
# .env.local needs DATABASE_URL, REDIS_URL, JWT_SECRET, ENCRYPTION_KEY, CRON_SECRET,
# APP_URL (https), ALLOWED_ORIGINS (include http://localhost:3000), EMAIL_FROM,
# plus a dummy OPENAI_API_KEY and DODO_PAYMENTS_WEBHOOK_KEY.
npx next build && npx next start -p 3000
DATABASE_URL=... node tests/e2e-v3/seed.cjs
node tests/e2e-stories/run.cjs            # all stories
SKIP_UI=1 node tests/e2e-stories/run.cjs  # API only
ONLY=AUTH,NAP-01 node tests/e2e-stories/run.cjs
```
