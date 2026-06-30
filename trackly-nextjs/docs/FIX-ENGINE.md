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
  same interface.
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

---

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
