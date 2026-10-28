/**
 * Read-only dashboard reports: stats, revenue, system, analytics.
 * Each mirrors an /api/admin-backend/* GET endpoint. --json prints the raw
 * payload; otherwise we surface the headline figures as tables.
 */
import { ApiClient } from '../client';
import { flagString, flagBool, type ParsedArgs } from '../args';
import { c, table, keyValue, heading, printJson } from '../output';

export async function stats(client: ApiClient, args: ParsedArgs): Promise<void> {
  const data = await client.get<Record<string, any>>('/api/admin-backend/stats');
  if (flagBool(args.flags, 'json')) return printJson(data);

  const o = data.overview || {};
  console.log(heading('Users'));
  console.log(
    keyValue({
      Total: o.total_users,
      Today: o.users_today,
      'This week': o.users_this_week,
      'This month': o.users_this_month,
    }),
  );

  if (data.planDistribution?.length) {
    console.log(heading('Plan distribution'));
    console.log(table(data.planDistribution, [
      { header: 'PLAN', get: (r: any) => r.plan },
      { header: 'USERS', get: (r: any) => r.count },
    ]));
  }

  const api = data.apiUsage24h || {};
  console.log(heading('API usage (24h)'));
  console.log(keyValue(api));

  if (data.topUsers?.length) {
    console.log(heading('Top users'));
    console.log(table(data.topUsers, [
      { header: 'EMAIL', get: (r: any) => r.email, max: 34 },
      { header: 'PLAN', get: (r: any) => r.plan },
      { header: 'QUERIES', get: (r: any) => r.query_count ?? r.total_queries },
    ]));
  }
}

export async function revenue(client: ApiClient, args: ParsedArgs): Promise<void> {
  const data = await client.get<Record<string, any>>('/api/admin-backend/revenue');
  if (flagBool(args.flags, 'json')) return printJson(data);

  console.log(heading('Monthly recurring revenue'));
  console.log(c.bold(`$${data.totalMrr ?? 0}/mo`));

  if (data.planRevenue?.length) {
    console.log(heading('Revenue by plan'));
    console.log(table(data.planRevenue, [
      { header: 'PLAN', get: (r: any) => r.plan },
      { header: 'USERS', get: (r: any) => r.count },
      { header: '$/USER', get: (r: any) => `$${r.price_per_user}` },
      { header: 'MRR', get: (r: any) => `$${r.estimated_mrr}` },
    ]));
  }

  if (data.subscriptionStats) {
    console.log(heading('Subscriptions'));
    console.log(keyValue(data.subscriptionStats));
  }

  if (data.recentPayments?.length) {
    console.log(heading('Recent payments'));
    console.log(table(data.recentPayments, [
      { header: 'WHEN', get: (r: any) => r.created_at },
      { header: 'TYPE', get: (r: any) => r.event_type || r.type },
      { header: 'EMAIL', get: (r: any) => r.email, max: 30 },
    ]));
  }
}

export async function system(client: ApiClient, args: ParsedArgs): Promise<void> {
  const data = await client.get<Record<string, any>>('/api/admin-backend/system');
  if (flagBool(args.flags, 'json')) return printJson(data);

  const db = data.database || {};
  console.log(heading('Database'));
  console.log(
    keyValue({
      Name: db.name,
      Version: String(db.version || '').split(' ').slice(0, 2).join(' '),
      'Size (MB)': db.sizeMb,
      'Active connections': db.activeConnections,
      'Idle connections': db.idleConnections,
    }),
  );

  const env = data.environment || {};
  console.log(heading('Environment'));
  console.log(keyValue(env));

  if (data.costsToday) {
    console.log(heading('Costs today'));
    console.log(c.dim(`alarm threshold: $${data.costsToday.alarmThresholdUsd}`));
    if (data.costsToday.byPlatform?.length) {
      console.log(table(data.costsToday.byPlatform, [
        { header: 'PLATFORM', get: (r: any) => r.platform },
        { header: 'COST', get: (r: any) => `$${r.cost ?? r.total_cost ?? 0}` },
      ]));
    }
  }

  if (data.tables?.length) {
    console.log(heading('Largest tables'));
    console.log(table(data.tables.slice(0, 10), [
      { header: 'TABLE', get: (r: any) => r.table_name },
      { header: 'ROWS', get: (r: any) => r.row_count },
    ]));
  }

  if (data.recentErrors?.length) {
    console.log(heading('Recent errors'));
    console.log(table(data.recentErrors.slice(0, 10), [
      { header: 'WHEN', get: (r: any) => r.created_at },
      { header: 'PLATFORM', get: (r: any) => r.platform },
      { header: 'STATUS', get: (r: any) => r.status },
    ]));
  }
}

export async function analytics(client: ApiClient, args: ParsedArgs): Promise<void> {
  const days = flagString(args.flags, 'days');
  const data = await client.get<Record<string, any>>('/api/admin-backend/analytics', { days });
  if (flagBool(args.flags, 'json')) return printJson(data);

  console.log(heading(`Analytics (last ${data.period} days)`));

  const cost = data.costSummary || {};
  console.log(
    keyValue({
      'Total cost': `$${cost.total_cost ?? 0}`,
      'Tokens in': cost.total_tokens_in,
      'Tokens out': cost.total_tokens_out,
      'Tokens total': cost.total_tokens,
    }),
  );

  if (data.platformUsage?.length) {
    console.log(heading('Usage by platform'));
    console.log(table(data.platformUsage, [
      { header: 'PLATFORM', get: (r: any) => r.platform },
      { header: 'CALLS', get: (r: any) => r.calls },
      { header: 'AVG ms', get: (r: any) => r.avg_latency_ms },
      { header: 'ERRORS', get: (r: any) => r.errors },
    ]));
  }

  if (data.costByPlatform?.length) {
    console.log(heading('Cost by platform'));
    console.log(table(data.costByPlatform, [
      { header: 'PLATFORM', get: (r: any) => r.platform },
      { header: 'COST', get: (r: any) => `$${r.cost ?? r.total_cost ?? 0}` },
    ]));
  }
}
