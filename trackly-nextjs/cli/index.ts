#!/usr/bin/env -S npx tsx
/**
 * livesov-admin - command-line interface to the Livesov dashboard backend.
 *
 * A thin, dependency-free HTTP client over the /api/admin-backend/* endpoints.
 * It reuses the app's own auth, validation, and audit logging - every mutation
 * you make here is recorded in audit_logs exactly as if done from the web UI.
 *
 * Run `livesov-admin help` for usage.
 */
import { ApiClient, ApiError } from './client';
import { loadConfig } from './config';
import { parseArgs, flagString, flagBool, type ParsedArgs } from './args';
import { c } from './output';
import * as authCmd from './commands/auth';
import { users } from './commands/users';
import { stats, revenue, system, analytics } from './commands/reports';
import { models } from './commands/models';
import { audit } from './commands/audit';

const HELP = `${c.bold('livesov-admin')} - CLI for the Livesov dashboard backend

${c.bold('USAGE')}
  livesov-admin <command> [subcommand] [args] [flags]

${c.bold('AUTH')}
  login                 Log in (prompts for email/password; --email --password --totp)
  logout                Clear stored credentials
  whoami                Show the current authenticated user
  config [url]          Show config, or set the API base URL

${c.bold('REPORTS')} ${c.dim('(read-only)')}
  stats                 User growth, plan mix, 24h API usage, top users
  revenue               MRR, revenue by plan, subscriptions, recent payments
  system                DB health, environment, today's costs, largest tables
  analytics [--days N]  Platform usage, latency, error rates, cost breakdown
  audit                 Audit log  (--action --user --limit --offset)

${c.bold('USERS')}
  users list            (--search --plan --sort --dir --limit --offset)
  users get <id>
  users create          (--email --password --name --plan)
  users update <id>     (--plan --name --email --password --verified)
  users delete <id>     (--yes to skip confirmation)

${c.bold('MODELS')}
  models list           AI model selection per platform
  models set <platform> <modelId>

${c.bold('GLOBAL FLAGS')}
  --url <url>           Override API base URL for this invocation
  --json                Machine-readable JSON output
  -h, --help            Show this help

${c.bold('ENVIRONMENT')}
  LIVESOV_API_URL       Default API base URL (default http://localhost:3000)
  LIVESOV_CLI_CONFIG    Override config file path (default ~/.config/livesov/cli.json)
  NO_COLOR              Disable ANSI colour

${c.bold('EXAMPLES')}
  livesov-admin --url https://livesov.com login
  livesov-admin stats
  livesov-admin users list --plan pro --limit 20
  livesov-admin users update <id> --plan agency
  livesov-admin analytics --days 7 --json
`;

type Handler = (client: ApiClient, args: ParsedArgs) => void | Promise<void>;

const COMMANDS: Record<string, Handler> = {
  login: authCmd.login,
  logout: (client) => authCmd.logout(client),
  whoami: authCmd.whoami,
  config: (_client, args) => authCmd.config(args),
  stats,
  revenue,
  system,
  analytics,
  audit,
  users,
  models,
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positionals[0];

  if (!command || flagBool(args.flags, 'help') || command === 'help') {
    process.stdout.write(HELP + '\n');
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.error(c.red(`Unknown command: ${command}`));
    console.error(`Run ${c.bold('livesov-admin help')} for usage.`);
    process.exitCode = 1;
    return;
  }

  // A per-invocation --url overrides stored config without persisting it.
  const config = loadConfig();
  const urlOverride = flagString(args.flags, 'url');
  if (urlOverride) config.baseUrl = urlOverride.replace(/\/+$/, '');
  const client = new ApiClient(config);

  // Guard: everything except these needs a stored session.
  const publicCommands = new Set(['login', 'logout', 'config']);
  if (!publicCommands.has(command) && !client.isAuthenticated) {
    console.error(c.yellow('Not logged in. Run: ') + c.bold('livesov-admin login'));
    process.exitCode = 1;
    return;
  }

  await handler(client, args);
}

main().catch((err) => {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      console.error(c.red('Authentication failed or session expired. Run: ') + c.bold('livesov-admin login'));
    } else if (err.status === 404) {
      console.error(c.red('Not found (404). ') + c.dim('The admin-backend also returns 404 for non-admin accounts.'));
    } else {
      console.error(c.red(`Error ${err.status}: `) + err.message);
    }
  } else {
    console.error(c.red('Error: ') + (err instanceof Error ? err.message : String(err)));
  }
  process.exitCode = 1;
});
