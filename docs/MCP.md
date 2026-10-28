# Livesov MCP server

Customers connect AI apps (Claude Code, Claude Desktop, Cursor, VS Code and
other MCP clients) to their Livesov data.

- Endpoint: `POST /api/mcp` (Streamable HTTP, stateless JSON responses)
- Auth, either:
  - OAuth 2.1 (claude.ai, Claude Desktop and ChatGPT connectors): the app
    discovers `/.well-known/oauth-protected-resource`, registers itself at
    `/api/oauth/register`, sends the user to `/oauth/authorize` (consent
    screen), then swaps the code at `/api/oauth/token` with PKCE S256.
    Access tokens `lsva_…` last 1 hour; refresh tokens rotate and last 30 days.
  - Personal API key: `Authorization: Bearer lsv_...` (or `x-api-key`)
- Keys: created and deleted in Account & Plan (`/api/api-keys`). Only the
  sha256 hash is stored; the plaintext is shown once. Max 10 active keys.
- Limits: 120 requests per minute per key, plus the normal per-route limits.

## Tools

| Tool | What it returns |
|---|---|
| `list_brands` | Brands on the account with latest SOV and last scan |
| `get_visibility` | SOV, change, per-engine scores, tone, goal, history |
| `get_competitors` | Rival ranking by share of mentions, gap to the next rival |
| `get_questions` | Winning and losing buyer questions, rivals named instead |
| `get_mentions` | AI answer excerpts, position, tone, sources (filterable) |
| `get_cited_sources` | Most cited domains, own-site citations |
| `get_recommendations` | Fix list, most severe first |
| `update_recommendation` | Set a fix to open, in progress, done or ignored |
| `get_accuracy` | Wrong facts AI states vs saved brand facts |
| `get_credits` | Plan, credits left, manual scans left today |
| `start_scan` | Starts a scan (spends credits), returns `run_id` |
| `get_scan_status` | Progress of a scan |

## How it works

`src/app/api/mcp/route.ts` resolves the key, mints a 15-minute access token
for its owner and calls the existing route handlers in-process (see the
`ROUTES` allow-list). Brand access, team roles, plan limits, credits and
per-user rate limits therefore behave exactly as in the dashboard.
Protocol handling lives in `src/lib/mcp/protocol.ts`, tools in
`src/lib/mcp/tools.ts`, data summaries in `src/lib/mcp/summarize.ts`.

## Try it

```
npx @modelcontextprotocol/inspector --cli https://livesov.com/api/mcp \
  --transport http --header "Authorization: Bearer lsv_..." --method tools/list
```

## OAuth details

- Code: `src/lib/oauth.ts` (storage, PKCE, codes, tokens), `src/lib/oauth-http.ts`
  (CORS, metadata), routes under `src/app/api/oauth/`, metadata under
  `src/app/.well-known/`, consent page `src/app/oauth/authorize/`.
- Public clients only, exact redirect URI match, https or loopback http.
- Codes are single use (claimed atomically) and expire in 10 minutes.
- Every code and token is stored as a sha256 digest.
- Users see and disconnect apps under Account & Plan; disconnecting revokes
  every token that app holds.
- Set `APP_URL` in production so metadata documents carry the public origin.
