/**
 * Auth commands: login, logout, whoami.
 */
import { ApiClient, TwoFactorRequiredError } from '../client';
import { loadConfig, saveConfig } from '../config';
import { ask, askHidden } from '../prompt';
import { flagString, flagBool, type ParsedArgs } from '../args';
import { c, keyValue, printJson } from '../output';

export async function login(client: ApiClient, args: ParsedArgs): Promise<void> {
  const email = flagString(args.flags, 'email') || (await ask('Email or username: '));
  const password = flagString(args.flags, 'password') || (await askHidden('Password: '));
  const totp = flagString(args.flags, 'totp');

  try {
    const user = await client.login(email, password, totp);
    if (flagBool(args.flags, 'json')) {
      printJson({ ok: true, user });
      return;
    }
    console.log(c.green('✓ Logged in as ') + c.bold(user.email) + c.dim(` (role: ${user.role || 'user'})`));
    if (user.role !== 'admin') {
      console.log(
        c.yellow(
          '⚠ This account is not an admin. admin-backend commands will return "not found" until it is promoted.',
        ),
      );
    }
  } catch (e) {
    if (e instanceof TwoFactorRequiredError) {
      const code = await ask('2FA code: ');
      const user = await client.login(email, password, code);
      console.log(c.green('✓ Logged in as ') + c.bold(user.email));
      return;
    }
    throw e;
  }
}

export function logout(client: ApiClient): void {
  client.logout();
  console.log(c.green('✓ Logged out (local credentials cleared)'));
}

export async function whoami(client: ApiClient, args: ParsedArgs): Promise<void> {
  if (!client.isAuthenticated) {
    console.log(c.yellow('Not logged in. Run: livesov-admin login'));
    process.exitCode = 1;
    return;
  }
  // Hit /api/auth/me so we report live server truth, not just cached config.
  const data = await client.get<{ user?: Record<string, unknown> }>('/api/auth/me');
  const user = data.user || {};
  if (flagBool(args.flags, 'json')) {
    printJson(user);
    return;
  }
  console.log(
    keyValue({
      'API URL': client.baseUrl,
      ID: user.id,
      Email: user.email,
      Name: user.name,
      Role: user.role || 'user',
      Plan: user.plan,
    }),
  );
}

/** `config` command: view or set the API base URL. */
export function config(args: ParsedArgs): void {
  const cfg = loadConfig();
  const url = flagString(args.flags, 'url') || args.positionals[1];
  if (url) {
    cfg.baseUrl = url.replace(/\/+$/, '');
    saveConfig(cfg);
    console.log(c.green('✓ API URL set to ') + cfg.baseUrl);
    return;
  }
  if (flagBool(args.flags, 'json')) {
    printJson({ baseUrl: cfg.baseUrl, authenticated: Boolean(cfg.token), user: cfg.user });
    return;
  }
  console.log(
    keyValue({
      'API URL': cfg.baseUrl,
      Authenticated: cfg.token ? 'yes' : 'no',
      User: cfg.user?.email || '-',
    }),
  );
}
