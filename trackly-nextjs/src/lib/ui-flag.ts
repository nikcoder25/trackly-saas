/**
 * Dashboard design switch ("v3" Livesov redesign vs the classic UI).
 *
 * v3 is the default for everyone. A user can fall back from the avatar menu
 * ("Back to classic design"), which writes lvx_ui=classic to a cookie (so
 * the server layout renders the right shell on the first paint) and to
 * localStorage (so the choice survives a cleared cookie). `?ui=classic` or
 * `?ui=v3` on any dashboard URL forces the choice and persists it.
 *
 * Pure helpers only: no React, no DOM access, so they unit-test in node.
 */

export type UiVersion = 'classic' | 'v3';

/** What a user sees until they pick otherwise. */
export const DEFAULT_UI: UiVersion = 'v3';

/** Cookie and localStorage key. */
export const UI_FLAG_KEY = 'lvx_ui';
/** Query-string override, e.g. /dashboard?ui=v3 */
export const UI_FLAG_PARAM = 'ui';
export const UI_FLAG_MAX_AGE = 60 * 60 * 24 * 365;

/** Normalise any stored or typed value. Unknown values return null. */
export function parseUiVersion(raw: unknown): UiVersion | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (v === 'v3' || v === 'new') return 'v3';
  if (v === 'classic' || v === 'old' || v === 'off' || v === 'v2') return 'classic';
  return null;
}

/**
 * Precedence: explicit URL param, then cookie, then localStorage, then the
 * default (v3). The cookie outranks localStorage because it is what the
 * server rendered with; localStorage only fills in when the cookie is gone.
 */
export function resolveUiVersion(sources: {
  param?: string | null;
  cookie?: string | null;
  stored?: string | null;
}): UiVersion {
  return (
    parseUiVersion(sources.param) ??
    parseUiVersion(sources.cookie) ??
    parseUiVersion(sources.stored) ??
    DEFAULT_UI
  );
}

/** document.cookie assignment string for a choice. */
export function uiFlagCookie(version: UiVersion, secure = false): string {
  return `${UI_FLAG_KEY}=${version}; Path=/; Max-Age=${UI_FLAG_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** Read the flag out of a raw `document.cookie` string. */
export function readUiCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === UI_FLAG_KEY) return decodeURIComponent(rest.join('='));
  }
  return null;
}
