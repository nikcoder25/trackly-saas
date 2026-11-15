/**
 * Fix Engine - same-site guard and sitemap target filtering. Sitemap <loc>
 * entries on other hosts must never become crawl targets, since targets flow
 * into credentialed CMS writes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sitemap = vi.hoisted(() => ({ xml: '' }));
vi.mock('@/lib/safe-fetch', () => ({
  safeFetch: vi.fn(async () => ({ ok: true, status: 200, text: async () => sitemap.xml })),
}));

import { isSameSite } from '@/lib/fix-engine/same-site';
import { resolveCrawlTargets } from '@/lib/fix-engine/crawl';

beforeEach(() => { sitemap.xml = ''; });

describe('isSameSite', () => {
  it('matches ignoring www, scheme and path', () => {
    expect(isSameSite('https://acme.test', 'https://www.acme.test/a/b')).toBe(true);
    expect(isSameSite('acme.test', 'http://acme.test/')).toBe(true);
    expect(isSameSite('https://www.acme.test/blog', 'https://acme.test/x')).toBe(true);
  });

  it('rejects other hosts, look-alikes, ports and non-http schemes', () => {
    expect(isSameSite('https://acme.test', 'https://attacker.tld/')).toBe(false);
    expect(isSameSite('https://acme.test', 'https://acme.test.attacker.tld/')).toBe(false);
    expect(isSameSite('https://acme.test', 'https://evilacme.test/')).toBe(false);
    expect(isSameSite('https://acme.test', 'https://sub.acme.test/')).toBe(false);
    expect(isSameSite('https://acme.test', 'https://acme.test:8443/')).toBe(false);
    expect(isSameSite('https://acme.test', 'ftp://acme.test/')).toBe(false);
    expect(isSameSite(undefined, 'https://acme.test/')).toBe(false);
  });
});

describe('resolveCrawlTargets sitemap filtering', () => {
  it('drops sitemap entries that are off the site origin', async () => {
    sitemap.xml = `<urlset>
      <url><loc>https://acme.test/a</loc></url>
      <url><loc>https://www.acme.test/b</loc></url>
      <url><loc>https://attacker.tld/wp-json</loc></url>
      <url><loc>http://169.254.169.254/latest</loc></url>
      <url><loc>https://acme.test.attacker.tld/c</loc></url>
    </urlset>`;
    const targets = await resolveCrawlTargets('https://acme.test', 50);
    expect(targets).toEqual(['https://acme.test', 'https://acme.test/a', 'https://www.acme.test/b']);
  });
});
