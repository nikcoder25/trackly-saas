import { describe, expect, it } from 'vitest';

import { normalizeCitationUrl, mergeCitations } from '../citations';

// URLs reach the citations table from two untrusted directions: engine-
// native citation arrays and a regex pass over response text. The regex
// (parser.ts URL_RE) routinely swallows trailing prose punctuation, and
// engines occasionally emit non-http schemes — normalizeCitationUrl is
// the single choke point that cleans both before anything hits the DB
// or the crawl queue.
describe('normalizeCitationUrl', () => {
  it('passes through a clean URL and extracts the domain without www', () => {
    expect(normalizeCitationUrl('https://www.example.com/guide/page')).toEqual({
      url: 'https://www.example.com/guide/page',
      domain: 'example.com',
    });
  });

  it('strips trailing punctuation swallowed by the text-extraction regex', () => {
    expect(normalizeCitationUrl('https://example.com/page.')?.url).toBe('https://example.com/page');
    expect(normalizeCitationUrl('https://example.com/page),')?.url).toBe('https://example.com/page');
    expect(normalizeCitationUrl('https://example.com/page";')?.url).toBe('https://example.com/page');
  });

  it('drops URL fragments but keeps query strings', () => {
    expect(normalizeCitationUrl('https://example.com/page?id=1#section')?.url).toBe(
      'https://example.com/page?id=1',
    );
  });

  it('rejects non-http(s) schemes, garbage, and oversized URLs', () => {
    expect(normalizeCitationUrl('ftp://example.com/file')).toBeNull();
    expect(normalizeCitationUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeCitationUrl('not a url')).toBeNull();
    expect(normalizeCitationUrl('')).toBeNull();
    expect(normalizeCitationUrl('https://example.com/' + 'a'.repeat(2100))).toBeNull();
  });
});

describe('mergeCitations', () => {
  it('puts engine-native citations ahead of regex-extracted ones', () => {
    expect(
      mergeCitations(['https://native.com/a'], ['https://parsed.com/b']),
    ).toEqual(['https://native.com/a', 'https://parsed.com/b']);
  });

  it('dedupes on the normalized URL, not the raw string', () => {
    // Same page: trailing punctuation and a fragment differ, normalized
    // form is identical — only the first occurrence survives.
    expect(
      mergeCitations(['https://example.com/page'], ['https://example.com/page#ref', 'https://example.com/page.']),
    ).toEqual(['https://example.com/page']);
  });

  it('silently drops entries that fail normalization', () => {
    expect(
      mergeCitations(['javascript:alert(1)'], ['https://ok.com/x', 'nope']),
    ).toEqual(['https://ok.com/x']);
  });

  it('caps the merged list at 10 and handles undefined inputs', () => {
    const native = Array.from({ length: 8 }, (_, i) => `https://n.com/${i}`);
    const parsed = Array.from({ length: 8 }, (_, i) => `https://p.com/${i}`);
    expect(mergeCitations(native, parsed)).toHaveLength(10);
    expect(mergeCitations(undefined, undefined)).toEqual([]);
  });
});
