# Fix Engine

The Fix Engine is the framework that runs every SEO/GEO fix the same way:

```
detect → generate → preview → approve → ship → recheck
```

A "module" is one fix type (title rewrite, llms.txt, FAQ schema, …). Every
module implements the same `FixModule` contract, so adding a new fix is one
file plus one registry line — the engine never changes.

This is the Phase-1 backend (the "wedge"): the engine core, five modules,
Channel-A CMS shipping (WordPress reference), and the Connector protocol
specified for Channel B.

---

## The SEO brain (grounding)

Every module's generation is grounded in a shared **SEO brain**
(`src/lib/fix-engine/seo-brain.ts`): a codified SEO/GEO playbook
(intent + E-E-A-T, entities, GEO structure, internal links + authoritative
citations, on-page hygiene, no fabrication) that is prepended to each
module's system prompt. So a title rewrite, a new comparison page, a schema
block, and a passage rewrite all follow the same principles.

Set or change the brain (first non-empty wins):
1. **From the dashboard** — the **SEO brain** card in the Fix Engine tab.
   Users edit the playbook, or load a built-in preset, and Save. Stored
   per brand in `fix_seo_brains` and applied to every generation for that
   brand. (`GET/PUT/DELETE /api/brands/[id]/seo-brain`.)
2. `FIX_ENGINE_SEO_BRAIN` env — inline playbook text (ops-level default).
3. A repo file — `FIX_ENGINE_SEO_BRAIN_PATH`, else `growth-atlas-seo-brain.md`
   at the project root. (See `growth-atlas-seo-brain.md.example`.)
4. The codified `DEFAULT_SEO_BRAIN`.

**Presets** (`SEO_BRAIN_PRESETS`): _Livesov default_ and _Matt Diggity
(Diggity Marketing / TSI)_ — the latter distilled from Matt Diggity's
published playbooks (intent-first prioritisation, answer capsules + original
data for LLM citation, topical clusters, hub-and-sibling internal linking,
E-E-A-T/author pages, structured data). Users load a preset in the editor
and Save it as their brain.

## AI-answer before/after (the loop)

When a fix ships, the engine snapshots the brand's **Share-of-Voice**
(SOV — the % of tracked AI prompts that mention the brand) into
`fixes.ai_before`; on `recheck` it captures `ai_after`. The card shows the
delta (`🤖 AI SOV 20% → 45% (+25)`). This reads the brand's existing run
history (`src/lib/fix-engine/ai-visibility.ts`) — no extra provider calls.
It is brand-level and only moves once the brand's tracking runs again
after the fix, so it's surfaced as a **directional** signal, not per-fix
attribution.

## SEO coverage map

| SEO need | Module(s) |
|---|---|
| Titles / meta / CTR | title-rewrite, meta-rewrite, ctr-rescue |
| Content depth & GEO structure | geo-page-rewrite, citable-passages, indexing-repair |
| **Internal linking** | internal-linking |
| **External authoritative citations** | external-citations (verified URLs) |
| Structured data | faq-schema, schema-markup (Org/LocalBusiness/Article/Product/Service) |
| Rankings (near page-1) | striking-distance |
| Indexing & canonical | indexing-repair, canonical-fix, noindex-removal |
| Crawlability / AI access | robots-ai-access, llms-txt |
| Social / sharing | og-cards |
| Comparison/alternatives (GEO) | comparison-pages |
| Accuracy / corrections | hallucination-correction |
| Surgical edits | passage-rewrite |

## Setup checklist (to run it live)

Already used by the app (no action if set): `DATABASE_URL`, `JWT_SECRET`,
`ENCRYPTION_KEY`, `CRON_SECRET`, and the AI provider keys.

Fix-Engine-specific:

1. **Google Search Console** (for `striking-distance`, `ctr-rescue`,
   `indexing-repair`, `canonical-fix`):
   - Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
   - In Google Cloud Console, add the OAuth redirect URI
     `$APP_URL/api/connections/gsc/callback`.
   - Enable the **Search Console API** on the Google project.
2. **CMS shipping (Channel A)**: in each brand's WordPress, create an
   Application Password and connect it in **Fix Engine → Connections**.
3. **Connector (Channel B)** for `llms-txt`, `robots-ai-access`,
   `og-cards`: install `connector-plugin/livesov-connector.php`, then
   **Pair Connector** in the dashboard and paste the token/secret/pull URL.
4. The cron safety-net (`/api/cron/fix-engine-worker`) is already wired
   into `.github/workflows/cron.yml` (every 15 min, `Bearer CRON_SECRET`).

## Architecture

It reuses the repo's existing detect→store→surface pattern (geo-audits,
nap-audits, recommendations) and its primitives:

| Concern | Reused primitive |
|---|---|
| Background work | `after(() => runScan())` + `/api/cron/fix-engine-worker` cold-restart net |
| Schema | `ensureFixEngineSchema()` idempotent `CREATE TABLE IF NOT EXISTS` |
| LLM generation | `queryAI` + `resolveKeysForTenant` + `acquirePlatformSlot` (`generate.ts`) |
| Credits | `reserveCredits` / `refundCredits` |
| Auth/tenancy | `requireVerifiedAuth` + `getBrandWithAccess` |
| Secrets at rest | `encryptValue` / `decryptValue` (AES-256-GCM, `ENCRYPTION_KEY`) |
| SSRF-safe crawl | `safeFetch` |

### Files

```
src/lib/fix-engine/
  types.ts          FixModule contract + row/status types
  schema.ts         tables (fixes, fix_batches, fix_connections, fix_events) + persistence
  crawl.ts          SSRF-safe page crawler + sitemap target discovery
  generate.ts       LLM generation helper (text + JSON)
  prompts.ts        per-module generation prompts (the "agent prompts")
  connections.ts    encrypted per-brand integration credentials
  engine.ts         the runner: runScan, generateFix, approveFix, shipFix, recheckFix
  registry.ts       module registry + plan gating (meetsPlan/planRank)
  cms/              Channel-A CMS adapters (interface + WordPress reference)
  modules/          the five Phase-1 modules
```

### State machine

`fixes.status`: `detected → generating → generated → approved → shipping →
shipped → verified`, with `failed` (any stage) and `reverted` as exits.
The engine is the only writer of status; each transition is claimed
atomically (`claimFixTransition`) so the `after()` path and the cron
safety-net can never double-run a stage.

`ship` is the only outward-facing, hard-to-reverse step. It requires an
explicit prior `approve` (human gate) and write access (team viewers are
blocked).

---

## Channels

- **Channel A — REST API (no plugin).** Ships by writing through the
  customer's CMS REST API via a `CmsAdapter`. WordPress is the reference
  (Application-Password auth). Webflow/Shopify/etc. register behind the
  same interface. **Custom-coded sites** connect via the `custom` adapter:
  the site exposes one small signed-POST endpoint and implements only the
  ops it wants (everything else degrades to hand-off) — full contract +
  copy-paste templates in `docs/CUSTOM-SITE-CONNECT.md`.
- **Channel B — Connector plugin.** Head/file/technical changes
  (`llms.txt`, robots.txt, `<head>` schema) that a REST API can't make.
  Ships by queuing a **Connector instruction** the plugin pulls and
  applies. Spec below.

---

## Modules

| Module | Channel | Trigger | Min plan | Phase |
|---|---|---|---|---|
| `title-rewrite` | A | crawl | starter | 1 |
| `meta-rewrite` | A | crawl | starter | 1 |
| `faq-schema` | A | crawl | starter | 1 |
| `geo-page-rewrite` | A | crawl | pro | 1 |
| `llms-txt` | B | crawl | starter | 1 |
| `striking-distance` | A | gsc | pro | 2 |
| `ctr-rescue` | A | gsc | pro | 2 |
| `internal-linking` | A | crawl | pro | 2 |
| `schema-markup` | A | crawl | starter | 2 |
| `indexing-repair` | A | gsc | pro | 3 |
| `canonical-fix` | A | gsc | pro | 3 |
| `comparison-pages` | A | crawl | pro | GEO |
| `citable-passages` | A | crawl | pro | GEO |
| `hallucination-correction` | A | manual | pro | GEO |
| `robots-ai-access` | B | crawl | starter | 3 |
| `noindex-removal` | A | crawl | starter | 3 |
| `og-cards` | B | crawl | starter | 3 |
| `passage-rewrite` | A | manual | starter | 1 |
| `external-citations` | A | crawl | pro | 2 |

`external-citations` adds authoritative outbound links (official docs,
.gov/.edu, standards bodies) to support a page's claims. Every
LLM-suggested URL is **verified to resolve (`safeFetch` < 400) before it's
shown or shipped**, so hallucinated/dead links never reach the live site;
unverifiable suggestions are dropped and counted in the preview.

`passage-rewrite` is user-initiated (not surfaced by scans): the user
supplies a URL + the exact passage + an instruction via
`POST /api/brands/[id]/fixes/targeted`, and ship does an in-place
find-and-replace of that passage in the CMS body (`replaceInBody`). If the
exact text isn't in the stored body (e.g. theme-rendered), ship returns a
clear "passage not found" error rather than guessing.

The GEO modules are the product differentiator. `comparison-pages`
creates new "Brand vs Competitor" pages (the format LLMs cite most) via
the CMS adapter's `createPage`. `citable-passages` adds quotable,
fact-dense answer blocks. `hallucination-correction` reuses the existing
accuracy monitor (`accuracy_issues`) as its detection source — each open
false-claim becomes a published correction passage; whether models stop
repeating the claim is then tracked by the accuracy monitor over time.

GSC-triggered modules read Google Search Console data in `detect()` and
return `[]` when the brand has no active GSC connection (so a scan that
includes them is harmless before GSC is connected). `striking-distance`
and `ctr-rescue` use the Search Analytics API; `indexing-repair` and
`canonical-fix` use the URL Inspection API. `canonical-fix` is
deterministic (no LLM call, zero credit cost) — the intended canonical is
the page's own declared canonical.

### Competitor-SERP-aware titles & metas (`serp.ts`)

`title-rewrite`, `meta-rewrite`, and `ctr-rescue` don't rewrite in a
vacuum: before generating, they pull the **current top-ranking results**
for the page's primary query and hand the competitors' titles +
descriptions to the prompt with an explicit "beat the SERP" instruction
(cover what they miss, be more specific, break the pattern of the
results — never fabricate). The goal is a title/meta that wins the click
against the real SERP, which is what moves CTR and, over time, rankings.

- **Primary query**: the page's top GSC query by impressions (28d) when
  GSC is connected; otherwise derived from the page's own title/H1 with
  the brand suffix stripped (`deriveQuery`).
- **SERP source** (first configured wins): Serper.dev via `SERPER_API_KEY`
  (real Google results, ~$1 per 1k searches, pay-as-you-go — the
  recommended provider), then SerpApi via `SERPAPI_KEY`, then one
  web-grounded model call (Perplexity — the same grounded engine tracking
  uses) asked to report the real ranking pages with their real metadata.
  The brand's own domain is filtered out, and results are capped at 8.
- **Cache**: `fix_serp_cache (brand_id, query)`, 7-day TTL — one fetch
  covers every fix generated for that query within the week. The
  scheduler cron prunes rows older than 30 days (and keyword-metrics
  cache rows older than 60).
- **Best-effort**: any failure (no query, no GSC, provider error) returns
  no competitors and generation proceeds exactly as before. Drafts record
  `serpQuery`, `serpCompared`, and `serpCompetitors` (top 5, shown on the
  fix card under "The SERP this draft was written to beat") in their
  generated payload.

---

## API

```
GET  /api/brands/[id]/fixes                          list + module catalog
POST /api/brands/[id]/fixes                          start a scan (body: {modules?:string[]})
GET  /api/brands/[id]/fixes/batches/[batchId]        scan progress
GET  /api/brands/[id]/fixes/[fixId]                  detail + rendered preview
POST /api/brands/[id]/fixes/[fixId]/generate         run generation
POST /api/brands/[id]/fixes/[fixId]/approve          human approval gate
POST /api/brands/[id]/fixes/[fixId]/ship             write to live site
POST /api/brands/[id]/fixes/[fixId]/recheck          verify + score
POST   /api/brands/[id]/fixes/[fixId]/revert         undo a shipped fix (revertable modules)
PATCH  /api/brands/[id]/fixes/[fixId]                set a fix's note / assignee
GET    /api/brands/[id]/fixes/export                 download fixes as CSV (honours filters)
GET    /api/brands/[id]/fixes/report                 client-ready PDF report
POST   /api/brands/[id]/fixes/notify                 send a status summary to the brand webhook (Slack/Zapier)
GET/PUT  /api/brands/[id]/automation                 scheduled scans + auto-pilot settings
GET/POST /api/brands/[id]/connections                manage CMS/GSC/Connector creds
GET  /api/brands/[id]/connections/gsc/start          begin GSC OAuth → returns {url}
GET  /api/connections/gsc/callback                   fixed OAuth redirect URI
GET  /api/cron/fix-engine-worker                     cold-restart safety net (Bearer CRON_SECRET)
GET  /api/cron/fix-engine-scheduler                  scheduled scans + auto-pilot driver (Bearer CRON_SECRET)
```

### Automation (scheduled scans + auto-pilot)

`fix_automation` (per brand) drives recurring scans and auto-pilot. The
`/api/cron/fix-engine-scheduler` cron (wired into `cron.yml`) finds brands
whose `next_scan_at` is due, runs the scan to completion, then applies
auto-pilot and reschedules. Auto-pilot can **auto-generate** detected
fixes and **auto-ship only deterministic (cost-0, no-LLM-content) fixes**
when a ship channel is connected — LLM-written content always waits for
human approval.

### Google Search Console connection (Phase 2)

Server-side OAuth 2.0 Authorization-Code flow with offline access, so the
engine can pull data on a schedule:

1. `GET /api/brands/[id]/connections/gsc/start` returns the Google consent
   URL (scope `webmasters.readonly`, `access_type=offline`,
   `prompt=consent`, signed `state` carrying brandId+userId).
2. The browser is redirected to Google; on approval Google calls the fixed
   redirect URI `GET /api/connections/gsc/callback`.
3. The callback authenticates the user (session cookie), verifies the
   signed state, exchanges the code for tokens, picks the GSC property that
   matches the brand website (URL-prefix or `sc-domain:` — see
   `matchSite`), and stores the connection (access + refresh token,
   encrypted). It redirects back to `/dashboard-v2?gsc=connected#fixes`.
4. `getValidAccessToken()` transparently refreshes the access token from
   the stored refresh token and persists the new token.

Requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_URL`. The
redirect URI `$APP_URL/api/connections/gsc/callback` must be registered on
the Google OAuth client.

### CMS connection (WordPress)

```
POST /api/brands/[id]/connections
{ "provider": "cms", "cmsType": "wordpress",
  "siteUrl": "https://example.com",
  "creds": { "username": "editor", "appPassword": "xxxx xxxx xxxx xxxx" } }
```

Credentials are verified against the live site before storage and stored
encrypted; they are never returned by any read endpoint.

---

## Connector plugin protocol (Channel B) — spec

The Connector is a small plugin/agent the customer installs on their site
(WordPress plugin, a script, or an edge function) that applies head/file
changes the REST API can't. The engine never pushes to the customer's
server; the Connector **pulls** pending instructions and acknowledges
them. This keeps the customer's server outbound-only and means no inbound
firewall changes.

### 1. Pairing

1. User clicks "Connect" → `POST /api/brands/[id]/connections {provider:"connector"}`.
   The engine stores a `connector` connection and generates a **pairing
   token** (random, stored hashed; the raw token is shown once).
2. User installs the Connector and pastes the token. The Connector stores
   `{ baseUrl, brandId, token }`.

### 2. Pull loop

The Connector polls on an interval (default 5 min):

```
GET /api/connector/instructions
Authorization: Bearer <connector-token>
→ 200 { "instructions": [
    { "id": "<fixId>", "op": "write_file",
      "payload": { "path": "/llms.txt", "contentType": "text/plain", "content": "..." },
      "issuedAt": "..." }
  ] }
```

`op` values for Phase 1+:
- `write_file` — write/replace a file at `payload.path` with `payload.content`.
- `set_header_block` — inject a `<head>` block (schema JSON-LD, OG tags).
- `patch_robots` — add/replace `robots.txt` directives.

The engine produces these from a Channel-B fix's `ship()` (see
`queueConnectorInstruction` in `modules/_shared.ts`). Until the Connector
is live they are persisted (`fix_events` + the fix's `after_snapshot`) so
content is never lost and can be offered as a manual download.

### 3. Apply + acknowledge

The Connector applies each instruction and acks:

```
POST /api/connector/instructions/<id>/ack
Authorization: Bearer <connector-token>
{ "ok": true, "appliedAt": "...", "detail": { "bytesWritten": 812 } }
```

On ack the engine moves the fix to `shipped` and the next `recheck` (which
fetches the live `/llms.txt`) flips it to `verified`. A failed ack
(`{ok:false, error}`) marks the fix `failed` with the reported reason.

### 4. Security

- Token is a bearer secret scoped to one brand; stored hashed server-side.
- Instruction payloads are signed (HMAC over `id|op|sha256(content)` with
  a per-connection secret) so a compromised relay can't inject content.
- Path allow-list: `write_file` is restricted to site-root files
  (`/llms.txt`, `/robots.txt`, `/.well-known/*`); no traversal.
- Rate-limited pull + ack endpoints; revocation flips the connection to
  `revoked` and the Connector stops receiving instructions.

> **Status: built.** The `/api/connector/*` endpoints and a reference
> WordPress plugin (`connector-plugin/livesov-connector.php`) are
> implemented:
>
> - `POST /api/brands/[id]/connections/connector/pair` → issues the raw
>   token + HMAC secret once (only the token *hash* + encrypted secret are
>   stored, on `fix_connections.token_hash` / `encrypted_creds`).
> - `GET /api/connector/instructions` (Bearer token) → returns the brand's
>   pending Channel-B fixes (`status='shipped'`, not yet delivered) as
>   signed, validated wire instructions. `write_file` paths are checked
>   against the allow-list (`/llms.txt`, `/robots.txt`, `/.well-known/*`)
>   before being served.
> - `POST /api/connector/instructions/[id]/ack` (Bearer token) → on
>   success marks the fix delivered (`connector_delivered_at`); on failure
>   moves it to `failed`. The next `recheck` confirms it's actually live.
>
> The plugin polls every 5 minutes via wp-cron, verifies each instruction's
> HMAC signature, applies it (`write_file` to allow-listed root files;
> `patch_robots` via the `robots_txt` filter; `set_header_block` via
> `wp_head`), and acks. The flagship Channel-B module `robots-ai-access`
> uses `patch_robots` to explicitly allow GPTBot/ClaudeBot/PerplexityBot/
> Google-Extended.
>
> **Reliability (built for "set it and forget it"):**
> - *Heartbeat* — every pull stamps `fix_connections.last_seen_at`; the
>   dashboard shows the Connector as **Online / Offline / last-polled**, so
>   a silently-broken plugin is visible (`connectorOnline()` ⇒ 12-min
>   window).
> - *Self-healing retries* — a failed apply isn't fatal: the ack bumps
>   `fixes.connector_attempts` and the instruction is **re-delivered on the
>   next pull** until `CONNECTOR_MAX_ATTEMPTS` (5), then marked `failed`.
>   All ops are idempotent overwrites, so re-delivery is safe.
> - *Auto-verify* — on a successful ack the engine auto-runs `recheck`
>   (non-blocking via `after()`), so Channel-B fixes flip to `verified`
>   with no manual step.
> - *Server-side watchdog* — the `fix-engine-worker` cron runs
>   `runConnectorWatchdog()` each tick (`connector-watchdog.ts`). It finds
>   Channel-B fixes still undelivered after a grace period (default 2h) and
>   flags each **once** with a `connector.stuck` event recording
>   `hoursStuck` + whether the Connector looks online — so a stuck queue
>   surfaces even when the plugin never polls (offline, deactivated). Idempotent
>   via `hasFixEvent()`.
> - *Token revoke + expiry* — `POST /api/brands/[id]/connections/connector/revoke`
>   is the kill switch for a leaked token (flips the connection to `revoked`;
>   pull/ack reject it immediately). `createConnectorPairing(userId, brandId,
>   expiresInDays?)` can issue a time-boxed token (`fix_connections.expires_at`,
>   honoured by `getConnectorByToken`); re-pairing rotates the token and resets
>   `last_seen_at`. The dashboard exposes a **Revoke** button alongside Re-pair.

---

## No-plugin WordPress (Application Passwords)

Most fixes need **no plugin at all** — the Channel-A WordPress adapter writes
through the standard WordPress REST API authenticated with an **Application
Password** (WP core since 5.6). That covers body rewrites, FAQ/JSON-LD
(appended to the body), citable passages, in-place passage edits, and new
pages.

**SEO plugin fields (title, meta description, canonical, indexable)** live in
Yoast / Rank Math post-meta. WordPress core **silently ignores** any meta key a
plugin hasn't registered with `show_in_rest` and still returns HTTP 200, so a
bare REST write can look like it succeeded while the field never actually
persisted. The adapter therefore **reads the object WordPress echoes back and
confirms the value stuck** before reporting the write ok; if the SEO plugin
doesn't expose the field to REST, the write reports a truthful failure (reason
`seo_field_not_writable_via_rest`) that directs the user to the Connector —
which writes the meta server-side with `update_post_meta` — instead of falsely
marking the fix "shipped".

Connecting is one click, no copy-paste, via WP core's own authorize screen:

1. Dashboard → Connections → **Connect WordPress** (enter the site URL).
   `GET …/connections/cms/wp-authorize/start` builds a link to the site's
   `wp-admin/authorize-application.php?app_name=Livesov…&success_url=…` with
   our signed `state`.
2. The user approves once in their **own** WP admin. WordPress mints an
   Application Password and redirects back to
   `GET /api/connections/cms/wp-authorize/callback` with
   `site_url / user_login / password` (+ our `state`).
3. The callback verifies the signed state belongs to the signed-in user,
   verifies the credentials against the live site, and stores the CMS
   connection (encrypted). Manual Application-Password entry remains as a
   fallback.

The site must be served over **HTTPS** (a WordPress requirement for
Application Passwords).

**Site-root files without a plugin:** WordPress core's REST API has no way to
write `/llms.txt` or `/robots.txt`, so those two modules (`llms-txt`,
`robots-ai-access`) normally use the Connector. For a fully plugin-free setup
the engine instead serves the generated file for **one-time manual upload**:
`GET …/fixes/[fixId]/file` returns the `llms.txt` / `robots.txt` content as a
download; the user drops it at their site root once and clicks **Re-check**,
which fetches the live file and verifies it. The dashboard shows a **Download
file** button on these fixes.

**Edge delivery (Cloudflare / any reverse proxy) — automatic, no plugin:**
For sites behind a CDN, the root files can also stay in sync automatically
without our plugin. `GET /api/edge/serve?token=<connector-token>&file=llms.txt|robots.txt`
returns the brand's latest ready content (gated by the Connector token, the
same one the plugin uses; rate-limited). The dashboard generates a ready-to-
paste **Cloudflare Worker** (token embedded) that serves `/llms.txt` and
appends the AI directives to the origin's `/robots.txt`. Once routed, future
fixes go live with zero further action — and it's CMS-agnostic.

So the only thing that *requires* the Connector plugin is the connector-staged
*draft preview* of edits to already-published pages. Everything else can be
applied with **no plugin**:

| Need | No-plugin path |
|---|---|
| On-page fixes (title/meta/body/schema/…) | WordPress REST (Application Passwords) |
| `/llms.txt`, `/robots.txt` — automatic | Cloudflare Worker → `/api/edge/serve` |
| `/llms.txt`, `/robots.txt` — manual | Download file → drop at site root → Re-check |

## One-click connect (handshake)

Instead of copy-pasting the pull URL + token + secret into the plugin, the
Connector can be linked in one click — like "Sign in with Google":

1. In the plugin (Settings → Livesov Connector) the user clicks **Connect
   with Livesov**. The plugin mints a `state` nonce and bounces the browser
   to `…/connect/connector?site=&callback=&state=` (callback = the plugin's
   `admin-post.php?action=lvx_connect_callback`).
2. The consent screen (`/connect/connector`) confirms who's signed in, lists
   the user's brands, and on **Approve** calls
   `POST /api/connect/connector/approve`. That route verifies brand access,
   checks the **callback is on the same host as the site** (so a code can't
   be redirected to a foreign origin), creates/rotates the pairing, mints a
   **single-use, short-lived code** (`fix_connector_handshakes`, payload
   encrypted at rest), and returns the callback redirect (`code` + `state`).
3. The browser lands back on the plugin's callback, which verifies `state`
   and exchanges the code **server-to-server** at
   `POST /api/connect/connector/exchange` for `{ pullUrl, token, hmacSecret }`,
   stores them, and runs the first poll. The token/secret never travel
   through the URL or browser history.

Manual pairing (`/connections/connector/pair`) remains as a fallback.

## Ship-as-draft (staged preview)

For page-content fixes you don't want to push straight to production, the
engine can stage the change as a **draft revision** the Connector creates on
your site, give you a **preview URL**, and only go live when you click
**Publish**.

How it works:

1. A module that can express its change as a normalised `ContentPatch`
   implements `contentPatch()` (title / meta / canonical / indexable / body
   append / body replace). Today: title-rewrite, meta-rewrite,
   geo-page-rewrite, faq-schema, canonical-fix, passage-rewrite,
   citable-passages.
2. `POST /api/brands/[id]/fixes/[fixId]/stage` (`stageFix`) — requires an
   approved fix + an active Connector. Queues a `stage_content` Connector
   instruction carrying `{ url, patch }` and moves the fix to **`staged`**.
3. The plugin (`stage_content`) saves a preview-able draft revision via
   `wp_create_post_autosave` **without touching the live page**, and returns
   a preview URL in its ack. The ack route stores `fixes.preview_url` and
   keeps the fix `staged` (no recheck — nothing is live yet).
4. `POST /api/brands/[id]/fixes/[fixId]/publish` (`publishStagedFix`) —
   re-queues the fix with the `publish_content` op. The plugin promotes the
   change with `wp_update_post` (which snapshots the prior content into a
   revision, so it's reversible from wp-admin → Revisions), the ack flips the
   fix to **`shipped`**, and the usual auto-recheck verifies it live.

Staging requires the Connector (it's the component that can create a draft
revision); without it, the dashboard nudges you to pair it or ship live.

## Native issue trackers (Linear / Jira)

Hand a fix off to your dev team as a real ticket, not just a chat message.

- Connect a tracker under **Connections** with a per-user API token (Linear
  API key + team id; Jira email + API token + site domain + project key).
  Tokens are verified on connect and stored encrypted in `fix_connections`
  (providers `linear` / `jira`), exactly like the CMS creds.
- `POST /api/brands/[id]/fixes/[fixId]/ticket` builds a title/body from the
  fix and calls `notifyBrand()`, which creates a native issue via
  `dispatchTracker()` (Linear preferred when both are connected) and **falls
  back to the brand webhook** when no tracker is connected.
- The digest endpoint (`/fixes/notify`) still posts the Slack-compatible
  summary to the webhook — trackers are for per-fix hand-offs.

---

## Security model (public endpoints)

The engine's internet-facing endpoints follow one consistent model:

- **Token-gated, hashed at rest:** `/api/connector/instructions` (+ ack) and
  `/api/edge/serve` resolve the per-brand Connector token via a SHA-256 hash
  lookup that honours `status='active'` + `expires_at`. `/edge/serve` accepts
  the token via `Authorization: Bearer` (preferred — keeps it out of URLs/logs)
  or a query param.
- **Signed, short-TTL handshakes:** the one-click connect (`/connect/connector`
  → `/approve` → `/exchange`) and the WordPress Application-Password flow use
  HMAC-signed state and single-use, expiring codes (consumed atomically). The
  approve step requires the plugin callback to be on the **same host** as the
  site being connected.
- **SSRF-safe:** every outbound fetch (crawl, CMS adapters, detection, edge
  serve) goes through `safeFetch`, which blocks private/link-local/loopback
  targets. The CMS detect endpoint is additionally rate-limited per user.
- **Authn/authz:** brand-scoped routes use `requireVerifiedAuth` +
  `getBrandWithAccess` and block viewers from write/connect actions. Secrets
  are encrypted at rest (AES-256-GCM); read paths never return them.

> Known trade-off (inherent to WordPress): the Application-Password
> authorize flow returns the new password in the redirect URL — that's WP's
> own design; we never log it, store it only encrypted, and the manual path
> remains available.

## Workflow layer (scale, proof, guardrails)

Features that make the detect→fix→automate loop scale and prove itself:

- **Grouped bulk cards** — ≥4 same-module fixes collapse into one card
  ("Meta description rewrite — 47 pages") with Generate/Approve/Ship-all and
  an expandable per-page review.
- **Page-weighted ranking** — `page-metrics.ts` caches each page's 28-day
  GSC clicks/impressions (`fix_page_metrics`, 12h TTL); fixes are ranked by
  severity → module impact × log(page impressions), with an impressions chip
  on each card.
- **GEO Health Score** — `health.ts`: 0-100 from the open queue (severity-
  weighted), a needle that moves as fixes ship (unlike SOV, which waits for
  the next tracking run).
- **Per-fix outcome measurement** — ship captures the page's GSC baseline
  (`gsc_before`); the worker cron's `runOutcomePass()` measures the +28-day
  window (`gsc_after`), logs `outcome.measured` with the relative CTR delta,
  and the card shows "MEASURED: CTR +x%". Thin data (<100 impressions either
  side) reports no delta rather than a misleading one.
- **Measured mode (guarded auto-revert)** — opt-in per brand
  (`fix_automation.measured_revert`): when an auto-revertable fix
  (title/meta) measures a relative CTR drop ≥20% with ≥300 impressions in
  BOTH windows, the outcome pass reverts it automatically, logs
  `outcome.autoreverted`, and notifies the brand's tracker/webhook. Keep is
  the default; revert is the strictly-guarded exception, so noise can't
  un-ship a fine change.
- **Regression watch** — `runRegressionWatch()` rechecks verified fixes
  older than 7 days; ones a CMS edit wiped get `regression.detected`, count
  into the needs-attention banner, and can be re-shipped.
- **Brand rules** — deterministic guardrails on every LLM draft
  (`rules.ts`, stored on `fix_automation.rules`): title suffix, title/meta
  length caps, banned phrases. Applied centrally in `generateFix` with a
  `rules.applied` audit event.
- **Approval workflow** — `POST …/fixes/[fixId]/request-review` pings the
  assignee via the connected tracker/webhook (`approval.requested` event).
- **Change-rate throttle** — autopilot ships at most
  `MAX_AUTOPILOT_SHIPS_PER_RUN` (10) live changes per scheduled run.
- **New-page trigger** — scheduled scans diff crawl targets against
  `fix_seen_pages` and log `trigger.new_pages` (first run seeds silently).
- **Automation activity feed** — recent `fix_events` surfaced in the
  Automation section, so autopilot's work is visible.
- **Inline draft editing** — a reviewer can edit the AI's draft text
  (title/meta/passage/llms.txt/freshness update) before approving: PATCH
  `…/fixes/[fixId]` with `generated:{field}` merges string fields the draft
  already has, only while awaiting review, re-applies the brand rules, and
  logs `draft.edited`.
- **Content freshness module** (`content-freshness`) — flags pages whose
  last-modified date (article meta → JSON-LD → HTTP header, via
  `extractLastModified`) is older than 180 days (high severity past a
  year; pages with NO detectable date are skipped — unknown ≠ stale).
  Generates a dated 40-60-word update block grounded in the page's own
  facts; shipping it also bumps the CMS modified date. Stageable +
  autopilot-friendly.
- **Stats-injection prompts** — the GEO rewrite / citable-passages /
  passage-rewrite prompts now require concrete statistics density (~1 per
  150-200 words, source-grounded only, never invented) and 40-60-word
  answer capsules, per the Princeton/Georgia-Tech GEO finding that adding
  statistics lifts AI visibility ~41%.
- **Agency scale (batched crawling)** — crawl scans cover up to **200
  pages** by default (`FIX_ENGINE_MAX_PAGES` to override). A scan-scoped
  crawl cache (`beginCrawlCache`/`endCrawlCache`, wrapped around runScan's
  module loop) fetches each page ONCE per scan instead of once per module —
  200 pages × 8 crawl modules is 200 fetches, not 1,600. The cache never
  applies outside a scan, so recheck/verification always reads the live page.
- **Image alt module** (`image-alt`) — the crawler extracts `<img>` tags
  with no alt attribute (empty `alt=""` is valid decorative markup and left
  alone); one fix per page generates context-grounded alts (filename + page
  topic — the prompt is explicit that it can't see pixels) and ships them as
  per-image in-place body edits. Images not present in the editable body
  (theme/builder-rendered) surface as a clear "add it in your builder"
  handoff instead of a fake success.
- **Keyword opportunities** (`keyword-opportunities`, needs GSC +
  **Keywords Everywhere**) — the classic agency motion, automated: page-2/3
  queries from the brand's own GSC (positions 8-30, real impressions)
  enriched with KWE volume + ad competition; an opportunity = volume ≥ 100
  and competition ≤ 0.4. Generates a targeting plan (suggested title +
  specific actions) plus one ready-to-publish intent-answering section.
  The KWE API key is a per-brand connection (provider `kwe`, encrypted,
  verified on connect — verification spends 1 credit); volume lookups are
  cached 7 days (`fix_keyword_metrics`) to conserve credits.

## Testing & ops notes

- **Unit/integration:** ~1,190 Vitest tests cover the engine state machine,
  every module, the connector protocol + watchdog, staging, trackers, the
  handshake/edge endpoints, CMS detection, and all CMS adapters (with
  `safeFetch` mocked).
- **Beta adapters:** the Shopify / Ghost / Webflow adapters are written to
  each platform's documented API but have **not** been exercised against a
  live store — validate before relying on them in production. WordPress
  (REST) is the proven path.
- **Connector plugin:** the PHP plugin passes `php -l`; its `stage_content` /
  `publish_content` ops can't be unit-tested here — verify on a staging
  WordPress before production use of ship-as-draft.

## The agent prompts

Generation prompts live in `src/lib/fix-engine/prompts.ts`. Each is a
system prompt (role + hard constraints, e.g. title 50-60 chars, never
fabricate facts, return only JSON) plus a per-page user prompt. They
optimise for classic SEO **and** GEO (a quotable lede, question-style
headings, fact-dense standalone passages LLMs can cite). See that file for
the full text of each module's prompt.

---

## Credits

A flat per-module generation cost is reserved before `generate()` and
refunded on failure (`engine.ts: GENERATE_COST`). The real provider spend
is recorded by `queryAI`'s own `recordCostEvent` during the call, exactly
as in brand runs and geo-audits.

## Tests

`src/lib/__tests__/fix-engine-engine.test.ts` — state-machine transitions,
credit reserve/refund, error handling (in-memory store + fake module).
`src/lib/__tests__/fix-engine-modules.test.ts` — real module
detect/generate/preview logic (crawler + LLM mocked) and registry/plan
gating invariants.
