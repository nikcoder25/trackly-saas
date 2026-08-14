/**
 * First-touch capture, browser side.
 *
 * The tracked half of attribution has to be recorded on the FIRST page the
 * visitor lands on, not on /signup. By the time someone reaches the signup
 * form they have usually clicked through two or three internal pages, and
 * `document.referrer` at that point is our own domain - which is how the
 * external referrer gets lost and everything files under "Direct".
 *
 * So: capture once, on the first page view of the session, into
 * sessionStorage, and read it back at signup. Only ever written when the key
 * is absent, so later navigations cannot overwrite the original referrer.
 *
 * Storage choice: sessionStorage, first-party, cleared when the tab closes.
 * It holds a referrer and UTM tags for the duration of one visit for the
 * purpose of attributing a signup the visitor is in the middle of making.
 * Nothing is written to a cookie and nothing leaves the origin until the
 * user submits the signup form.
 */

const KEY = 'lv_first_touch';

export interface FirstTouch {
  referrer: string | null;
  landingPath: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  promoCode: string | null;
}

const EMPTY: FirstTouch = {
  referrer: null, landingPath: null,
  utmSource: null, utmMedium: null, utmCampaign: null,
  utmTerm: null, utmContent: null, gclid: null, promoCode: null,
};

/** Reads a query param, collapsing empty strings to null. */
function param(sp: URLSearchParams, name: string): string | null {
  const v = sp.get(name);
  return v && v.trim() ? v.trim().slice(0, 200) : null;
}

/**
 * Records first touch if it has not been recorded yet in this session.
 * Safe to call on every page view and during SSR (no-ops without a window).
 */
export function captureFirstTouch(): void {
  if (typeof window === 'undefined') return;

  try {
    if (window.sessionStorage.getItem(KEY)) return;

    const sp = new URLSearchParams(window.location.search);
    const ref = document.referrer || '';

    // An internal referrer is not a referrer. Dropping same-origin values
    // here means a visitor who lands directly on /signup from our own /pricing
    // is correctly recorded as having no external referrer, rather than
    // "referred by livesov.com".
    let external: string | null = null;
    if (ref) {
      try {
        if (new URL(ref).hostname !== window.location.hostname) external = ref.slice(0, 500);
      } catch { /* malformed referrer - treat as absent */ }
    }

    const touch: FirstTouch = {
      referrer: external,
      landingPath: (window.location.pathname + window.location.search).slice(0, 500),
      utmSource: param(sp, 'utm_source'),
      utmMedium: param(sp, 'utm_medium'),
      utmCampaign: param(sp, 'utm_campaign'),
      utmTerm: param(sp, 'utm_term'),
      utmContent: param(sp, 'utm_content'),
      gclid: param(sp, 'gclid'),
      // Set when the visitor arrives from the offer page or from a link an
      // AI assistant surfaced with the promo code attached. This is what
      // makes the agent-facing offer measurable rather than a guess.
      promoCode: param(sp, 'promo'),
    };

    window.sessionStorage.setItem(KEY, JSON.stringify(touch));
  } catch {
    // Private browsing / storage disabled / quota. Attribution degrades to
    // the self-reported answer alone, which is still the more useful half.
  }
}

/** Reads back whatever was captured. Returns empty values if nothing was. */
export function readFirstTouch(): FirstTouch {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<FirstTouch>) };
  } catch {
    return EMPTY;
  }
}
