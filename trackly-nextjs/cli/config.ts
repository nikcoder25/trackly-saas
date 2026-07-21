/**
 * Persisted CLI state: the API base URL, the current access token, and the
 * rotating refresh cookie so a long-lived shell session doesn't have to
 * re-enter a password every 15 minutes (the access-token lifetime).
 *
 * The file is written 0600 (owner read/write only) because it holds bearer
 * credentials equivalent to an admin session. We never log its contents.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface RefreshCookie {
  name: string;
  value: string;
}

export interface StoredUser {
  id: string;
  email: string;
  role?: string;
  plan?: string;
}

export interface CliConfig {
  baseUrl: string;
  token?: string;
  refresh?: RefreshCookie;
  user?: StoredUser;
}

export const DEFAULT_BASE_URL = process.env.LIVESOV_API_URL || 'http://localhost:3000';

/**
 * Resolve the config file path. Honours an explicit override, then
 * XDG_CONFIG_HOME, then ~/.config. Kept as a function (not a constant) so
 * tests can point it at a scratch dir via env without import-order games.
 */
export function configPath(): string {
  if (process.env.LIVESOV_CLI_CONFIG) return process.env.LIVESOV_CLI_CONFIG;
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'livesov', 'cli.json');
}

export function loadConfig(): CliConfig {
  const file = configPath();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return { baseUrl: parsed.baseUrl || DEFAULT_BASE_URL, ...parsed };
  } catch {
    // Missing or unreadable config is normal on first run.
    return { baseUrl: DEFAULT_BASE_URL };
  }
}

export function saveConfig(config: CliConfig): void {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write to a temp file then rename so a crash mid-write can't leave a
  // truncated (and therefore un-parseable) credential file behind.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.chmodSync(tmp, 0o600);
  fs.renameSync(tmp, file);
}

export function clearConfig(): void {
  const file = configPath();
  try {
    fs.unlinkSync(file);
  } catch {
    // Already gone - nothing to clear.
  }
}
