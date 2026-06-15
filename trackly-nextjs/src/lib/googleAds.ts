/**
 * Google Ads conversion tracking helpers.
 *
 * The Google tag (gtag.js) is loaded once by <GoogleAnalytics/> and shared with
 * Google Analytics. <GoogleAnalytics/> also issues a `gtag('config', AW-…)`
 * command so that same tag reports conversions to this Google Ads account.
 * The helpers below fire individual conversion events through that shared tag.
 *
 * Privacy: the tag is only injected after the visitor accepts cookies, so when
 * there is no consent (or an ad blocker removed the tag) `gtag` is absent and
 * the helpers degrade gracefully — they simply run any navigation callback
 * without tracking, so user flows are never blocked.
 *
 * This is the React/Next.js equivalent of the `gtag_report_conversion(url)`
 * snippet Google Ads hands out for plain HTML pages.
 */

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

/** Google Ads account / conversion ID (e.g. "AW-11395303082"). */
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || 'AW-11395303082';

/**
 * `send_to` values keyed by a friendly conversion name. Each value is
 * "<ADS_ID>/<conversion_label>" exactly as shown in the Google Ads tag setup.
 */
export const CONVERSION_LABELS = {
  /** "Submit lead form" conversion action — fired on successful account sign-up. */
  submitLeadForm:
    process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL || 'AW-11395303082/muNQCKvE9aEaEKqN2rkq',
} as const;

export type ConversionName = keyof typeof CONVERSION_LABELS;

export interface ReportConversionOptions {
  /** Monetary value of the conversion. Defaults to 1.0 (per Ads setup). */
  value?: number;
  /** ISO 4217 currency code. Defaults to 'INR' (per Ads setup). */
  currency?: string;
  /**
   * Optional URL to navigate to once the conversion ping has been sent (or
   * after a short timeout if the tag is slow / blocked). Mirrors the `url`
   * argument of Google's `gtag_report_conversion`. Omit it when navigation is
   * handled elsewhere (e.g. Next.js router.push after the call).
   */
  url?: string;
}

/**
 * Report a Google Ads conversion through the shared gtag.js tag.
 *
 * Safe to call unconditionally and on the server: if `gtag` is unavailable it
 * falls back to navigating to `url` (when provided) so sign-up / checkout flows
 * are never blocked by a missing or blocked tag.
 */
export function reportConversion(
  name: ConversionName = 'submitLeadForm',
  { value = 1.0, currency = 'INR', url }: ReportConversionOptions = {},
): void {
  const navigate = () => {
    if (url) window.location.href = url;
  };

  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
      navigate();
      return;
    }

    let navigated = false;
    const callback = () => {
      if (navigated) return;
      navigated = true;
      navigate();
    };

    window.gtag('event', 'conversion', {
      send_to: CONVERSION_LABELS[name],
      value,
      currency,
      ...(url ? { event_callback: callback } : {}),
    });

    // Safety net: if event_callback never fires (blocked/slow tag), navigate anyway.
    if (url) setTimeout(callback, 1500);
  } catch {
    // gtag threw (blocked extension, etc.) — never block the user flow.
    navigate();
  }
}
