/**
 * HTTP helpers shared by the OAuth and MCP endpoints. These are called by AI
 * apps from other origins (and, for some, from a browser), so they answer
 * CORS preflights. None of them read cookies, so a wildcard origin is safe.
 */
import { OAuthError, OAUTH_SCOPE, issuerFor } from '@/lib/oauth';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, X-Api-Key',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

export function corsJson(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS, ...extra },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function oauthErrorResponse(e: unknown): Response {
  if (e instanceof OAuthError) return corsJson({ error: e.code, error_description: e.message }, e.status);
  return corsJson({ error: 'server_error', error_description: 'Something went wrong. Try again.' }, 500);
}

/** Reads an OAuth request body: form-encoded per the spec, JSON tolerated. */
export async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const j = await request.json().catch(() => ({}));
    return Object.fromEntries(Object.entries(j && typeof j === 'object' ? j : {}).map(([k, v]) => [k, String(v)]));
  }
  const text = await request.text().catch(() => '');
  return Object.fromEntries(new URLSearchParams(text));
}

export function protectedResourceMetadata(request: Request) {
  const base = issuerFor(request);
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Livesov',
    resource_documentation: `${base}/dashboard/account`,
  };
}

export function authorizationServerMetadata(request: Request) {
  const base = issuerFor(request);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [OAUTH_SCOPE],
    service_documentation: `${base}/dashboard/account`,
  };
}
