/**
 * Pure username (handle) helpers. Allowed characters are a-z, 0-9, ".",
 * "_" and "-" (see /api/auth/username).
 */

/** "ņ" -> "n", "é" -> "e": decompose, then drop the combining marks. */
export function transliterate(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]+/g, '');
}

/**
 * Clean a value as the user types it into the username field. An email
 * keeps only its local part ("vikramdeora.seo@gmail.com" -> "vikramdeora.seo")
 * and accented letters are transliterated rather than deleted. Leading and
 * trailing dots are kept so typing "antra." is not undone mid-word.
 */
export function sanitizeUsernameInput(raw: string): string {
  let s = String(raw ?? '').trim().replace(/^@+/, '');
  if (s.includes('@')) s = s.split('@')[0];
  return transliterate(s)
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9_.-]/g, '');
}

/**
 * Derive a handle from a display name or an email address, before any
 * uniqueness suffix is added. Always 3 to 25 characters.
 */
export function usernameBase(nameOrEmail: string): string {
  let base = sanitizeUsernameInput(nameOrEmail)
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (base.length < 3) base = 'user' + base;
  if (base.length > 25) base = base.substring(0, 25).replace(/[._-]+$/g, '');
  return base;
}
