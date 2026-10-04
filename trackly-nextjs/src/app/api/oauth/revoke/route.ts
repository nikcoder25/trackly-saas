// RFC 7009 token revocation. Always 200, so it reveals nothing about tokens.
import { revokeToken } from '@/lib/oauth';
import { corsJson, preflight, readParams } from '@/lib/oauth-http';

export async function POST(request: Request) {
  const p = await readParams(request);
  await revokeToken(p.token).catch(() => {});
  return corsJson({});
}
export function OPTIONS() { return preflight(); }
