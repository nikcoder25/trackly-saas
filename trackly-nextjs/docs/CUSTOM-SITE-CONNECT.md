# Connecting a custom-coded site to the Fix Engine

No CMS? No problem. Your site exposes **one small HTTPS endpoint**; Livesov
sends every approved fix to it as a signed POST. You implement only the
operations your site can perform — anything else degrades to a clean
hand-off (ticket/manual) instead of a failure.

Detection, AI drafting, previews, and re-checks never need this endpoint —
they crawl your site like Google does. The endpoint is only for the
**ship** step.

## 1. The wire contract

Livesov → your endpoint, one POST per operation:

```
POST https://yoursite.com/livesov-fix
Content-Type: application/json
Authorization: Bearer <shared secret>
X-Livesov-Signature: sha256=<hex hmac-sha256(raw request body, shared secret)>

{ "op": "update_title", "ts": 1720800000000, "url": "https://yoursite.com/pricing", "value": "New Title" }
```

Verify **all three** before acting:
1. `Authorization` header equals `Bearer <secret>` (constant-time compare).
2. `X-Livesov-Signature` matches your own HMAC-SHA256 of the **raw** body.
3. `ts` (unix milliseconds) is within ±5 minutes (replay protection).

### Operations

| `op` | Payload fields | What to do |
|---|---|---|
| `ping` | — | Reply `{ "ok": true }` (used by Connect to verify) |
| `update_title` | `url`, `value` | Set the page's `<title>` |
| `update_meta_description` | `url`, `value` | Set the page's meta description |
| `update_body` | `url`, `value` (HTML), `mode` (`replace`\|`append`) | Replace or append to the page body |
| `inject_schema` | `url`, `value` (JSON-LD string) | Add the JSON-LD block to the page |
| `update_canonical` | `url`, `value` | Set the canonical URL |
| `create_page` | `page: { title, slug, html, status }` | Create a page (`status`: `publish`\|`draft`) |
| `set_indexable` | `url` | Remove an accidental `noindex` from the page |
| `replace_in_body` | `url`, `find`, `replace` | Exact in-place text swap; reply `{ ok: true, found: false }` if `find` isn't present |

### Responses

| Situation | Reply |
|---|---|
| Success | `200` `{ "ok": true }` (optionally `resourceId`, `url`, `found`) |
| Op not implemented | `200` `{ "ok": false, "unsupported": true }` or plain `501` — Livesov hands the fix off instead of failing |
| Bad secret/signature | `401` — Livesov marks the connection as needing attention |
| Anything else went wrong | `200` `{ "ok": false, "error": "why" }` — shown on the fix card |

**Start small.** An endpoint that implements only `ping`, `update_title`,
and `update_meta_description` already unlocks the highest-impact modules
(title rewrite, meta rewrite, CTR rescue). Add ops as you need them.

## 2. Reference implementations

Copy-paste templates live in the dashboard (Connections → platform
"custom-coded site" → Copy Node/Express or PHP template). They implement
auth + signature + timestamp checks and the two starter ops, with TODOs
where you wire your own database.

For any other stack (Django, Rails, Laravel, Go, ...) implement the
contract above — it's ~40 lines anywhere.

## 3. Connect it

1. Deploy the endpoint on your site (HTTPS required).
2. Dashboard → Fix Engine → Connections → WordPress row → **Connect** →
   platform **custom-coded site (any stack)**.
3. Click **Generate secret**, put the same secret in your endpoint's env,
   paste the endpoint URL, **Connect** — Livesov sends a signed `ping`
   and stores the credentials encrypted only if it succeeds.
4. Ship your first fix to a low-traffic page. The engine auto-runs a
   re-check right after your endpoint acks: it crawls the live page and
   only marks the fix **verified** when the change is really there — an
   endpoint that replies `ok` without persisting stays at "shipped",
   never falsely "verified". If a CDN is still serving the old HTML, the
   cron ship-verify pass keeps re-checking (every ~30 min for 2 days), so
   the fix flips to verified by itself once the cache expires. **Re-check**
   stays available for manual re-runs at any time.

## 4. Alternatives if you can't add an endpoint

- **Edge publishing (Cloudflare Worker) — recommended when the domain is on
  Cloudflare.** Zero code on the site: paste the Worker from the dashboard
  (Connections → Pair → Worker snippet) into your Cloudflare zone, then
  connect the CMS as platform `edge`. Shipped title / meta description /
  canonical fixes are applied to every page as it is served, plus automatic
  `llms.txt` / `robots.txt`. Works on any stack; body/content edits still
  hand off to your team.
- **Linear/Jira/webhook hand-off** — every approved fix becomes a ticket
  with exact copy-paste content; re-check still verifies the dev applied it.
- **Connector protocol** — the pull-based protocol our WordPress plugin
  speaks (see `docs/FIX-ENGINE.md`); implement it server-side for staging
  + publish flows.
