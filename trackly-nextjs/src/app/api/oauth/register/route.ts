// RFC 7591 dynamic client registration for MCP clients (public clients only).
import { registerClient } from '@/lib/oauth';
import { corsJson, oauthErrorResponse, preflight } from '@/lib/oauth-http';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const rl = await rateLimit(`oauth_register:${getClientIp(request)}`, 60 * 60 * 1000, 20).catch(() => ({ allowed: true, retryAfter: 0 }));
  if (!rl.allowed) return corsJson({ error: 'slow_down', error_description: 'Too many registrations. Try again later.' }, 429, { 'Retry-After': String(rl.retryAfter) });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return corsJson({ error: 'invalid_client_metadata', error_description: 'Body must be JSON' }, 400);
  try {
    const c = await registerClient(body);
    return corsJson({
      client_id: c.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: c.clientName,
      redirect_uris: c.redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(c.clientUri ? { client_uri: c.clientUri } : {}),
    }, 201);
  } catch (e) {
    return oauthErrorResponse(e);
  }
}
export function OPTIONS() { return preflight(); }
