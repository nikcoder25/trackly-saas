/**
 * Wrap a lazy "CREATE TABLE IF NOT EXISTS ..." bootstrap so it runs at most
 * once per process and survives the race two concurrent first requests hit.
 *
 * Postgres' IF NOT EXISTS is not atomic across sessions: when two requests
 * both find the table missing and both issue the CREATE, the loser fails
 * with `duplicate key value violates unique constraint
 * "pg_type_typname_nsp_index"` (23505) or `relation already exists`
 * (42P07 / 42710). The table exists at that point, so the right response is
 * to re-run the (idempotent) bootstrap once, not to surface a 500 to the
 * user - which is exactly what the NAP audits list did on a cold start.
 *
 * Callers keep their existing `let schemaEnsured` fast path; this adds
 * in-flight de-duplication and the retry on top.
 */
const ALREADY_EXISTS_CODES = new Set(['23505', '42P07', '42710', '42P06']);

export function schemaOnce(run: () => Promise<void>): () => Promise<void> {
  let done = false;
  let inflight: Promise<void> | null = null;
  return () => {
    if (done) return Promise.resolve();
    if (inflight) return inflight;
    inflight = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          await run();
          done = true;
          return;
        } catch (e) {
          const code = (e as { code?: string } | null)?.code;
          if (attempt === 0 && code && ALREADY_EXISTS_CODES.has(code)) continue;
          throw e;
        }
      }
    })().finally(() => {
      if (!done) inflight = null;
    });
    return inflight;
  };
}
