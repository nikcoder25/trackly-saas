/**
 * AI model selection per platform against /api/admin-backend/models.
 * Subcommands: list (default), set <platform> <modelId>.
 */
import { ApiClient } from '../client';
import { flagBool, type ParsedArgs } from '../args';
import { c, table, printJson } from '../output';

interface PlatformModels {
  platform: string;
  models: { id: string; label?: string }[];
  selected: string;
}

export async function models(client: ApiClient, args: ParsedArgs): Promise<void> {
  const sub = args.positionals[1] || 'list';
  if (sub === 'set') return setModel(client, args);
  return listModels(client, args);
}

async function listModels(client: ApiClient, args: ParsedArgs): Promise<void> {
  const data = await client.get<{ platforms: PlatformModels[] }>('/api/admin-backend/models');
  if (flagBool(args.flags, 'json')) return printJson(data);

  for (const p of data.platforms) {
    console.log('\n' + c.bold(c.cyan(p.platform)) + c.dim(`  (selected: ${p.selected})`));
    console.log(
      table(p.models, [
        { header: '', get: (m) => (m.id === p.selected ? c.green('●') : ' ') },
        { header: 'MODEL ID', get: (m) => m.id },
        { header: 'LABEL', get: (m) => m.label },
      ]),
    );
  }
}

async function setModel(client: ApiClient, args: ParsedArgs): Promise<void> {
  const platform = args.positionals[2];
  const modelId = args.positionals[3];
  if (!platform || !modelId) {
    console.error(c.red('Usage: livesov-admin models set <platform> <modelId>'));
    process.exitCode = 1;
    return;
  }
  const data = await client.request<{ success: boolean; models: Record<string, string> }>(
    'PUT',
    '/api/admin-backend/models',
    { body: { models: { [platform]: modelId } } },
  );
  if (flagBool(args.flags, 'json')) return printJson(data);
  console.log(c.green(`✓ ${platform} model set to `) + c.bold(modelId));
}
