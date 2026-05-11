// Client-side input validation for the public GEO Audit form. Pure
// function so it's trivially unit-testable and can be re-imported into
// any future "audit your URL" entry point without re-implementing the
// rules. Server-side (`/api/geo-audit` route) re-validates everything;
// this is purely UX (catch obvious bad inputs before the network call).

const MAX_URL_LENGTH = 2048;

export function validateUrlClientSide(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'Enter a URL to audit.';
  if (trimmed.length > MAX_URL_LENGTH) return 'URL is too long.';
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Invalid URL. Include the protocol (e.g. https://example.com).';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'URL must use http or https.';
  }
  return null;
}
