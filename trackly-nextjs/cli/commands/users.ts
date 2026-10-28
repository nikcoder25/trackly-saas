/**
 * User management against /api/admin-backend/users[/:id].
 * Subcommands: list, get, create, update, delete.
 */
import { ApiClient } from '../client';
import { ask } from '../prompt';
import { flagString, flagBool, type ParsedArgs } from '../args';
import { c, table, keyValue, heading, printJson } from '../output';

interface AdminUserRow {
  id: string;
  email: string;
  username?: string;
  name?: string;
  plan?: string;
  role?: string;
  email_verified?: boolean;
  created_at?: string;
  brand_count?: number;
  total_queries?: number;
}

function fmtDate(v: unknown): string {
  if (!v) return '';
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}

export async function users(client: ApiClient, args: ParsedArgs): Promise<void> {
  const sub = args.positionals[1] || 'list';
  switch (sub) {
    case 'list':
      return listUsers(client, args);
    case 'get':
    case 'show':
      return getUser(client, args);
    case 'create':
      return createUser(client, args);
    case 'update':
    case 'edit':
      return updateUser(client, args);
    case 'delete':
    case 'rm':
      return deleteUser(client, args);
    default:
      console.error(c.red(`Unknown users subcommand: ${sub}`));
      console.error('Try: list | get <id> | create | update <id> | delete <id>');
      process.exitCode = 1;
  }
}

async function listUsers(client: ApiClient, args: ParsedArgs): Promise<void> {
  const data = await client.get<{ users: AdminUserRow[]; total: number; limit: number; offset: number }>(
    '/api/admin-backend/users',
    {
      search: flagString(args.flags, 'search'),
      plan: flagString(args.flags, 'plan'),
      sort: flagString(args.flags, 'sort'),
      dir: flagString(args.flags, 'dir'),
      limit: flagString(args.flags, 'limit'),
      offset: flagString(args.flags, 'offset'),
    },
  );

  if (flagBool(args.flags, 'json')) return printJson(data);

  console.log(
    table(data.users, [
      { header: 'ID', get: (u) => u.id, max: 36 },
      { header: 'EMAIL', get: (u) => u.email, max: 34 },
      { header: 'NAME', get: (u) => u.name, max: 20 },
      { header: 'PLAN', get: (u) => u.plan },
      { header: 'ROLE', get: (u) => u.role },
      { header: 'VERIF', get: (u) => (u.email_verified ? 'yes' : 'no') },
      { header: 'BRANDS', get: (u) => u.brand_count ?? 0 },
      { header: 'QUERIES', get: (u) => u.total_queries ?? 0 },
      { header: 'JOINED', get: (u) => fmtDate(u.created_at) },
    ]),
  );
  console.log(
    c.dim(`\nShowing ${data.users.length} of ${data.total} (offset ${data.offset}, limit ${data.limit})`),
  );
}

function requireId(args: ParsedArgs): string {
  const id = args.positionals[2] || flagString(args.flags, 'id');
  if (!id) {
    console.error(c.red('A user id is required.'));
    process.exit(1);
  }
  return id;
}

async function getUser(client: ApiClient, args: ParsedArgs): Promise<void> {
  const id = requireId(args);
  const data = await client.get<{ user: Record<string, unknown>; recentActivity: Record<string, unknown>[] }>(
    `/api/admin-backend/users/${encodeURIComponent(id)}`,
  );
  if (flagBool(args.flags, 'json')) return printJson(data);

  const u = data.user;
  console.log(
    keyValue({
      ID: u.id,
      Email: u.email,
      Username: u.username,
      Name: u.name,
      Plan: u.plan,
      Role: u.role,
      'Email verified': u.email_verified ? 'yes' : 'no',
      '2FA enabled': u.totp_enabled ? 'yes' : 'no',
      Google: u.has_google ? 'yes' : 'no',
      Brands: u.brand_count,
      'Total queries': u.total_queries,
      'Total cost': u.total_cost,
      Subscription: u.subscription_id || '-',
      Joined: fmtDate(u.created_at),
    }),
  );

  const brands = (u.brands as Array<Record<string, unknown>> | null) || [];
  if (brands.length) {
    console.log(heading('Brands'));
    console.log(table(brands, [
      { header: 'ID', get: (b) => b.id, max: 36 },
      { header: 'NAME', get: (b) => b.name },
      { header: 'CREATED', get: (b) => fmtDate(b.created_at) },
    ]));
  }

  if (data.recentActivity?.length) {
    console.log(heading('Recent activity'));
    console.log(table(data.recentActivity, [
      { header: 'ACTION', get: (a) => a.action },
      { header: 'TARGET', get: (a) => a.target_type },
      { header: 'IP', get: (a) => a.ip },
      { header: 'WHEN', get: (a) => a.created_at },
    ]));
  }
}

async function createUser(client: ApiClient, args: ParsedArgs): Promise<void> {
  const email = flagString(args.flags, 'email') || (await ask('Email: '));
  const password = flagString(args.flags, 'password') || (await ask('Password: '));
  const name = flagString(args.flags, 'name');
  const plan = flagString(args.flags, 'plan');

  const data = await client.request<{ user: AdminUserRow }>('POST', '/api/admin-backend/users', {
    body: { email, password, name, plan },
  });
  if (flagBool(args.flags, 'json')) return printJson(data);
  console.log(c.green('✓ Created user ') + c.bold(data.user.email) + c.dim(` (${data.user.id})`));
}

async function updateUser(client: ApiClient, args: ParsedArgs): Promise<void> {
  const id = requireId(args);
  const body: Record<string, unknown> = {};
  const plan = flagString(args.flags, 'plan');
  const name = flagString(args.flags, 'name');
  const email = flagString(args.flags, 'email');
  const password = flagString(args.flags, 'password');
  const verified = args.flags['verified'];

  if (plan !== undefined) body.plan = plan;
  if (name !== undefined) body.name = name;
  if (email !== undefined) body.email = email;
  if (password !== undefined) body.password = password;
  if (verified !== undefined) body.email_verified = verified === true || verified === 'true';

  if (Object.keys(body).length === 0) {
    console.error(c.red('Nothing to update. Pass at least one of --plan --name --email --password --verified.'));
    process.exitCode = 1;
    return;
  }

  const data = await client.request<{ user: AdminUserRow }>('PUT', `/api/admin-backend/users/${encodeURIComponent(id)}`, {
    body,
  });
  if (flagBool(args.flags, 'json')) return printJson(data);
  console.log(c.green('✓ Updated user ') + c.bold(data.user.email));
}

async function deleteUser(client: ApiClient, args: ParsedArgs): Promise<void> {
  const id = requireId(args);
  if (!flagBool(args.flags, 'yes')) {
    const answer = await ask(c.yellow(`Delete user ${id} and all their brands/logs? Type "yes" to confirm: `));
    if (answer !== 'yes') {
      console.log('Aborted.');
      return;
    }
  }
  await client.request('DELETE', `/api/admin-backend/users/${encodeURIComponent(id)}`);
  console.log(c.green('✓ Deleted user ') + id);
}
