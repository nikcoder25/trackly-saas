import { pool, auditLog } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { cleanKeyName, createApiKey, listApiKeys, MAX_ACTIVE_KEYS } from '@/lib/api-keys';

// Personal API keys for the MCP server and scripts. Managed from Account
// settings with the normal browser session; a key can never manage keys.

export async function GET(request: Request) {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  try {
    return Response.json({ keys: await listApiKeys(auth.id), max: MAX_ACTIVE_KEYS });
  } catch {
    return Response.json({ error: 'Could not load your API keys' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  let body: { name?: unknown } = {};
  try { body = await request.json(); } catch { /* empty body is fine */ }
  try {
    const { key, row } = await createApiKey(auth.id, cleanKeyName(body.name));
    auditLog(auth.id, 'api_key.create', 'api_key', row.id, { name: row.name }).catch(() => {});
    // The plaintext key is returned exactly once.
    return Response.json({ key, apiKey: row }, { status: 201 });
  } catch (e) {
    if ((e as Error).message === 'limit') {
      return Response.json({ error: `You can have up to ${MAX_ACTIVE_KEYS} keys. Delete one to create another.` }, { status: 400 });
    }
    return Response.json({ error: 'Could not create the key' }, { status: 500 });
  }
}
