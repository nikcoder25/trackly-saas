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

GSC-triggered modules read Google Search Console data in `detect()` and
return `[]` when the brand has no active GSC connection (so a scan that
includes them is harmless before GSC is connected).

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
GET/POST /api/brands/[id]/connections                manage CMS/GSC/Connector creds
GET  /api/brands/[id]/connections/gsc/start          begin GSC OAuth → returns {url}
GET  /api/connections/gsc/callback                   fixed OAuth redirect URI
GET  /api/cron/fix-engine-worker                     cold-restart safety net (Bearer CRON_SECRET)
```

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

> The `/api/connector/*` endpoints and the plugin itself are the Phase-3
> deliverable. The engine side (instruction generation, storage, the
> connection model) is already built; Channel-B fixes ship as
> `pending_connector` until the plugin lands.

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
