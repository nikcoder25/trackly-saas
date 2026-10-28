# NAP audit unblocker - production setup & verification

The NAP verification engine has a Layer-3 "unblocker" cascade for citation
pages that block server fetches (Cloudflare/WAF 403s on Yelp, YellowPages,
etc.). Without it, those pages show as **Unverified/blocked** and the operator
must "Mark OK" by hand - blocked citations are the biggest source of
false "issues" on large directory lists.

The cascade lives in `trackly-nextjs/src/lib/page-render.ts` and activates
only when at least one backend is configured via env vars (DigitalOcean →
App → Settings → trackly-saas → App-Level Environment Variables):

| Env var | Backend | Notes |
|---|---|---|
| `SCRAPERAPI_KEY` | ScraperAPI (paid) | `SCRAPERAPI_ULTRA=true` for premium pool, `SCRAPERAPI_RENDER=false` to disable JS render, `SCRAPERAPI_COUNTRY` to pin geo. |
| `ZYTE_API_KEY` | Zyte API (paid) | `ZYTE_BROWSER=false` to disable browser rendering. |
| `BRIGHTDATA_API_TOKEN` + `BRIGHTDATA_UNLOCKER_ZONE` | Bright Data Web Unlocker (paid) | Both vars required. |
| `NAP_RENDER_ENDPOINT` (+ optional `NAP_RENDER_TOKEN`) | Self-hosted render service | Generic headless endpoint. |

With **no** paid backend configured, blocked pages still fall back to a free
Internet Archive (Wayback) snapshot when one exists - rows sourced this way
are flagged "via Web Archive" with the snapshot date.

Paid unblocker calls are only spent on **authenticated** audit runs. The free
public tool (`/api/tools/nap-checker`) runs with the cascade disabled
(`noRender`), so anonymous visitors can never spend paid credits.

## How to verify it's working

1. Check the env vars above are set (as encrypted secrets) on the deployed app.
2. Run an audit containing a known bot-hostile directory URL (e.g. a Yelp
   listing) from the dashboard.
3. In the audit detail, the row should come back **verified** with a
   `JS-rendered` flag - not `blocked`. The list page's **BLOCKED** KPI should
   stay near zero across audits.
4. If rows still show `blocked`, check the app logs for `page-render`
   backend errors (invalid key, exhausted plan).
