# livesov-admin CLI

A dependency-free command-line interface to the Livesov **dashboard backend**
(`/api/admin-backend/*`). It's a thin HTTP client over the same endpoints the
web admin UI uses, so it reuses the app's auth, validation, and **audit
logging** — every mutation you make here lands in `audit_logs` exactly as if
performed from the dashboard.

## Requirements

- The Next.js app must be running and reachable (locally or a deployment).
- An account with the `admin` **role**. The admin-backend deliberately returns
  `404` (not `403`) for non-admin accounts, so a `404` on these commands usually
  means "your account isn't an admin", not "endpoint missing".

## Running it

From `trackly-nextjs/`:

```bash
npm run admin -- <command> [flags]
# or directly:
npx tsx cli/index.ts <command> [flags]
```

The `--` after `npm run admin` is required so npm forwards the flags to the CLI.

### Point it at an environment

```bash
# One-off override for a single command:
npm run admin -- --url https://livesov.com stats

# Or persist it:
npm run admin -- config https://livesov.com

# Or via env var:
LIVESOV_API_URL=https://livesov.com npm run admin -- stats
```

Default base URL is `http://localhost:3000`.

## Authentication

```bash
npm run admin -- login                 # prompts for email + password (hidden)
npm run admin -- login --email you@example.com --password '...' --totp 123456
npm run admin -- whoami
npm run admin -- logout
```

`login` calls `POST /api/auth/login` and stores the returned access token plus
the rotating refresh cookie in `~/.config/livesov/cli.json` (mode `0600`). Access
tokens live 15 minutes; the CLI silently refreshes them on the next command, so
you rarely need to log in more than once. If the account has 2FA enabled you'll
be prompted for a code (or pass `--totp`).

Requests authenticate with `Authorization: Bearer <token>`, which the app's
middleware treats as CSRF-exempt server-to-server traffic. State-changing calls
also send an `Origin` header matching the API base URL to satisfy the app's
same-origin check in production.

## Commands

### Reports (read-only)

| Command | Description |
|---|---|
| `stats` | User growth, plan distribution, 24h API usage, top users |
| `revenue` | MRR, revenue by plan, subscription stats, recent payments |
| `system` | DB health, environment, today's provider costs, largest tables |
| `analytics [--days N]` | Platform usage, latency, error rates, cost breakdown |
| `audit [--action A] [--user ID] [--limit N] [--offset N]` | Audit log |

### Users

```bash
npm run admin -- users list --plan pro --sort created_at --dir desc --limit 20
npm run admin -- users get <id>
npm run admin -- users create --email new@x.com --password '...' --plan starter
npm run admin -- users update <id> --plan agency --verified true
npm run admin -- users delete <id> --yes
```

### Models

```bash
npm run admin -- models list
npm run admin -- models set chatgpt gpt-4o
```

## Global flags

| Flag | Effect |
|---|---|
| `--url <url>` | Override the API base URL for this invocation only |
| `--json` | Emit machine-readable JSON instead of tables |
| `-h`, `--help` | Show usage |

## Environment variables

| Variable | Purpose |
|---|---|
| `LIVESOV_API_URL` | Default API base URL |
| `LIVESOV_CLI_CONFIG` | Override the config/credential file path |
| `NO_COLOR` | Disable ANSI colour output |

## Design notes

- **Zero new dependencies.** Pure Node (`fetch`, `readline`) + the repo's
  existing `tsx`.
- **Decoupled from app internals.** The CLI only depends on the HTTP contract —
  it imports nothing from `src/`, so it could be extracted to its own package
  unchanged.
- Piping to a file or another process disables colour automatically (non-TTY),
  and `--json` is stable for scripting.
