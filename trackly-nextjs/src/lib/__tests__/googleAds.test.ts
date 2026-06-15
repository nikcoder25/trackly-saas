/**
 * Google Ads conversion helper.
 *
 * Behaviors under test:
 *   1. reportConversion() fires a gtag('event','conversion', …) with the
 *      configured send_to / value / currency for the named action.
 *   2. When a `url` is supplied it navigates on the gtag event_callback and,
 *      as a safety net, after a timeout if the callback never fires.
 *   3. When gtag is unavailable (no consent / blocked tag) it never throws and
 *      still navigates to `url` so user flows are not blocked.
 *
 * The repo's vitest environment is `node`, so we stub a minimal `window` with
 * just the surface the helper touches (gtag + location.href) rather than pull
 * in a DOM environment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONVERSION_LABELS, reportConversion } from '../googleAds';

type TestWindow = {
  gtag?: (...args: unknown[]) => void;
  location: { href: string };
};

describe('reportConversion', () => {
  let hrefSetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    hrefSetter = vi.fn();
    const win: TestWindow = {
      location: { set href(v: string) { hrefSetter(v); }, get href() { return ''; } },
    };
    (globalThis as { window?: TestWindow }).window = win;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: TestWindow }).window;
  });

  it('fires a conversion event with the configured send_to/value/currency', () => {
    const gtag = vi.fn();
    (globalThis as { window?: TestWindow }).window!.gtag = gtag;

    reportConversion('submitLeadForm');

    expect(gtag).toHaveBeenCalledTimes(1);
    const [event, name, params] = gtag.mock.calls[0];
    expect(event).toBe('event');
    expect(name).toBe('conversion');
    expect(params).toMatchObject({
      send_to: CONVERSION_LABELS.submitLeadForm,
      value: 1.0,
      currency: 'INR',
    });
    // No url → no navigation callback wired.
    expect(params.event_callback).toBeUndefined();
  });

  it('respects custom value and currency', () => {
    const gtag = vi.fn();
    (globalThis as { window?: TestWindow }).window!.gtag = gtag;

    reportConversion('submitLeadForm', { value: 49.99, currency: 'USD' });

    expect(gtag.mock.calls[0][2]).toMatchObject({ value: 49.99, currency: 'USD' });
  });

  it('navigates via event_callback when a url is provided', () => {
    const gtag = vi.fn();
    (globalThis as { window?: TestWindow }).window!.gtag = gtag;

    reportConversion('submitLeadForm', { url: '/dashboard' });

    const params = gtag.mock.calls[0][2];
    expect(typeof params.event_callback).toBe('function');
    expect(hrefSetter).not.toHaveBeenCalled();

    params.event_callback();
    expect(hrefSetter).toHaveBeenCalledWith('/dashboard');

    // Safety-net timeout must not navigate a second time.
    vi.advanceTimersByTime(2000);
    expect(hrefSetter).toHaveBeenCalledTimes(1);
  });

  it('navigates via the safety-net timeout if the callback never fires', () => {
    const gtag = vi.fn(); // never invokes event_callback
    (globalThis as { window?: TestWindow }).window!.gtag = gtag;

    reportConversion('submitLeadForm', { url: '/dashboard' });
    expect(hrefSetter).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(hrefSetter).toHaveBeenCalledWith('/dashboard');
  });

  it('still navigates when gtag is unavailable, without throwing', () => {
    expect(() => reportConversion('submitLeadForm', { url: '/dashboard' })).not.toThrow();
    expect(hrefSetter).toHaveBeenCalledWith('/dashboard');
  });

  it('is a no-op (no throw) when gtag is unavailable and no url is given', () => {
    expect(() => reportConversion('submitLeadForm')).not.toThrow();
    expect(hrefSetter).not.toHaveBeenCalled();
  });
});
