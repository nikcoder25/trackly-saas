/**
 * DataForSEO Basic auth header from DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD.
 * Values are trimmed and stripped of wrapping quotes: a stray newline,
 * space or quote pasted into the host's env settings makes every call
 * fail with HTTP 401.
 */
function clean(v: string | undefined): string {
  return String(v || '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
}

export function dataForSeoCredentials(): { login: string; password: string } | null {
  const login = clean(process.env.DATAFORSEO_LOGIN);
  const password = clean(process.env.DATAFORSEO_PASSWORD);
  return login && password ? { login, password } : null;
}

export function dataForSeoAuthHeader(): string | null {
  const c = dataForSeoCredentials();
  return c ? `Basic ${Buffer.from(`${c.login}:${c.password}`).toString('base64')}` : null;
}
