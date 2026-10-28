/**
 * Tests for src/lib/prompt-meta.ts.
 *
 * The sanitizers guard what reaches the table, and the upsert's ON
 * CONFLICT guard is what stops an automatic reclassification from
 * overwriting a topic or page a human deliberately set. That guard is the
 * difference between "the classifier is a helpful default" and "the
 * classifier silently undoes your work every time you save the brand", so
 * the emitted SQL is asserted directly.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const queryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

vi.mock('../db', () => ({ pool: { query: queryMock } }));
vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  normalizePromptKey,
  sanitizeTopic,
  sanitizePageUrl,
  upsertPromptMeta,
  __resetPromptMetaSchemaCache,
} = await import('../prompt-meta');

beforeEach(() => {
  queryMock.mockClear();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  __resetPromptMetaSchemaCache();
});

/** The INSERT is the last query; the first is the schema bootstrap. */
function lastSql(): string {
  return queryMock.mock.calls[queryMock.mock.calls.length - 1][0] as string;
}
function lastParams(): unknown[] {
  return queryMock.mock.calls[queryMock.mock.calls.length - 1][1] as unknown[];
}

describe('normalizePromptKey', () => {
  it('collapses casing and whitespace so an edit keeps its metadata', () => {
    expect(normalizePromptKey('  Best   HVAC Company  ')).toBe('best hvac company');
  });

  it('keeps trailing punctuation, which distinguishes two trackable prompts', () => {
    // "hvac financing" and "hvac financing?" are separately trackable, so
    // merging them here would make one silently inherit the other's page.
    expect(normalizePromptKey('hvac financing?')).not.toBe(normalizePromptKey('hvac financing'));
  });
});

describe('sanitizeTopic', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeTopic('  Emergency   Repair ')).toBe('Emergency Repair');
  });

  it('treats the Ungrouped label and empties as "no topic"', () => {
    expect(sanitizeTopic('Ungrouped')).toBeNull();
    expect(sanitizeTopic('ungrouped')).toBeNull();
    expect(sanitizeTopic('   ')).toBeNull();
    expect(sanitizeTopic(42)).toBeNull();
  });

  it('caps an over-long label', () => {
    expect(sanitizeTopic('x'.repeat(200))!.length).toBe(60);
  });
});

describe('sanitizePageUrl', () => {
  it('accepts http(s) URLs and strips the fragment', () => {
    expect(sanitizePageUrl('https://acme.test/ac-repair#top')).toBe('https://acme.test/ac-repair');
  });

  it('rejects non-http schemes and junk', () => {
    expect(sanitizePageUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizePageUrl('/relative/path')).toBeNull();
    expect(sanitizePageUrl('')).toBeNull();
    expect(sanitizePageUrl(null)).toBeNull();
  });
});

describe('upsertPromptMeta', () => {
  it('writes nothing for an empty row set', async () => {
    expect(await upsertPromptMeta('b1', [])).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('guards manual rows by default so a rebuild cannot clobber them', async () => {
    await upsertPromptMeta('b1', [{ query: 'best hvac', topic: 'HVAC' }]);
    const sql = lastSql();
    expect(sql).toContain('ON CONFLICT (brand_id, query_norm) DO UPDATE');
    expect(sql).toContain("prompt_meta.source <> 'manual'");
    expect(sql).toContain("EXCLUDED.source = 'manual'");
  });

  it('drops the guard when an explicit rebuild is requested', async () => {
    await upsertPromptMeta('b1', [{ query: 'best hvac' }], { overwriteManual: true });
    expect(lastSql()).not.toContain("prompt_meta.source <> 'manual'");
  });

  it('lets a manual write win over an existing manual row', async () => {
    // A user re-editing their own binding must not be blocked by the
    // guard that protects them from the classifier.
    await upsertPromptMeta('b1', [{ query: 'best hvac', source: 'manual' }]);
    const params = lastParams();
    expect(params).toContain('manual');
    expect(lastSql()).toContain("EXCLUDED.source = 'manual'");
  });

  it('sanitizes topic and page before they reach the database', async () => {
    await upsertPromptMeta('b1', [{
      query: 'best hvac',
      topic: '  Emergency  Repair ',
      pageUrl: 'javascript:alert(1)',
    }]);
    const params = lastParams();
    expect(params).toContain('Emergency Repair');
    // The bad URL became null rather than being stored verbatim.
    expect(params).not.toContain('javascript:alert(1)');
    expect(params).toContain(null);
  });

  it('skips rows whose prompt normalizes to nothing', async () => {
    expect(await upsertPromptMeta('b1', [{ query: '   ' }])).toBe(0);
  });

  it('reports the rows actually written, not the rows offered', async () => {
    // 3 offered, 1 skipped by the manual guard → the caller can honestly
    // say "2 updated, 1 kept as you set it".
    queryMock.mockResolvedValue({ rows: [], rowCount: 2 });
    const written = await upsertPromptMeta('b1', [
      { query: 'a' }, { query: 'b' }, { query: 'c' },
    ]);
    expect(written).toBe(2);
  });
});
