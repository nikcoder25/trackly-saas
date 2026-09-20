/**
 * Audit-log viewer against /api/admin-backend/audit-logs.
 * Filters: --action, --user, --limit, --offset.
 */
import { ApiClient } from '../client';
import { flagString, flagBool, type ParsedArgs } from '../args';
import { c, table, printJson } from '../output';

interface AuditRow {
  id: string;
  user_id?: string;
  user_email?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  details?: unknown;
  ip?: string;
  created_at?: string;
}

export async function audit(client: ApiClient, args: ParsedArgs): Promise<void> {
  const data = await client.get<{ logs: AuditRow[]; total: number; limit: number; offset: number }>(
    '/api/admin-backend/audit-logs',
    {
      action: flagString(args.flags, 'action'),
      user_id: flagString(args.flags, 'user'),
      limit: flagString(args.flags, 'limit'),
      offset: flagString(args.flags, 'offset'),
    },
  );
  if (flagBool(args.flags, 'json')) return printJson(data);

  console.log(
    table(data.logs, [
      { header: 'WHEN', get: (r) => r.created_at },
      { header: 'ACTION', get: (r) => r.action, max: 28 },
      { header: 'ACTOR', get: (r) => r.user_email || r.user_id, max: 30 },
      { header: 'TARGET', get: (r) => [r.target_type, r.target_id].filter(Boolean).join(':'), max: 24 },
      { header: 'IP', get: (r) => r.ip },
    ]),
  );
  console.log(
    c.dim(`\nShowing ${data.logs.length} of ${data.total} (offset ${data.offset}, limit ${data.limit})`),
  );
}
