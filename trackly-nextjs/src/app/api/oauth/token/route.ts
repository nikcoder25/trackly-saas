// OAuth token endpoint: authorization_code (with PKCE) and refresh_token.
import { exchangeCode, refreshTokens, OAuthError } from '@/lib/oauth';
import { corsJson, oauthErrorResponse, preflight, readParams } from '@/lib/oauth-http';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const rl = await rateLimit(`oauth_token:${getClientIp(request)}`, 60 * 1000, 60).catch(() => ({ allowed: true, retryAfter: 0 }));
  if (!rl.allowed) return corsJson({ error: 'slow_down', error_description: 'Too many requests' }, 429, { 'Retry-After': String(rl.retryAfter) });
  const p = await readParams(request);
  try {
    if (p.grant_type === 'authorization_code') return corsJson(await exchangeCode(p));
    if (p.grant_type === 'refresh_token') return corsJson(await refreshTokens(p));
    throw new OAuthError('unsupported_grant_type', 'Supported grant types: authorization_code, refresh_token');
  } catch (e) {
    return oauthErrorResponse(e);
  }
}
export function OPTIONS() { return preflight(); }
