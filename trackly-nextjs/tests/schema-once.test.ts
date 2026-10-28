import { describe, it, expect, vi } from 'vitest';
import { schemaOnce } from '../src/lib/schema-once';

describe('schemaOnce', () => {
  it('runs the bootstrap once and de-duplicates concurrent callers', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => { resolve = r; });
    const run = vi.fn(async () => { await gate; });
    const ensure = schemaOnce(run);

    const a = ensure();
    const b = ensure();
    expect(run).toHaveBeenCalledTimes(1);
    resolve();
    await Promise.all([a, b]);
    await ensure();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries once when the CREATE lost the race to another session', async () => {
    // Postgres reports the loser of two concurrent CREATE TABLE IF NOT EXISTS
    // as a duplicate pg_type row (23505) - the table exists, so a second
    // pass of the idempotent bootstrap must succeed.
    const run = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('duplicate key value violates unique constraint "pg_type_typname_nsp_index"'), { code: '23505' }))
      .mockResolvedValueOnce(undefined);
    const ensure = schemaOnce(run);
    await expect(ensure()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('surfaces a genuine failure and allows a later retry', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: '42501' }))
      .mockResolvedValueOnce(undefined);
    const ensure = schemaOnce(run);
    await expect(ensure()).rejects.toThrow('permission denied');
    await expect(ensure()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not retry a duplicate error twice in a row', async () => {
    const dup = Object.assign(new Error('relation already exists'), { code: '42P07' });
    const run = vi.fn().mockRejectedValue(dup);
    const ensure = schemaOnce(run);
    await expect(ensure()).rejects.toBe(dup);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
