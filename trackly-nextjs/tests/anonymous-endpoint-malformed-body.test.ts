import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every anonymous POST endpoint must answer a malformed body with a 4xx, not
 * a 500.
 *
 * `/api/geo-audit`, `/api/newsletter`, `/api/contact` and `/api/free-check`
 * all did a bare `await req.json()`. A junk body threw into the catch-all and
 * returned 500 - verified against a running server before this fix. These are
 * unauthenticated endpoints, so garbage payloads from scanners are routine
 * traffic: every one of them logged a fake server error, inflating the error
 * rate the on-call alerting watches. The six `/api/tools/*` routes already got
 * this right with `.catch(() => ({}))`.
 *
 * A source scan rather than a request test: these handlers reach rate limiting,
 * Turnstile, email and the DB before returning, so invoking them here would
 * mean mocking four subsystems to assert one line of parsing behaviour.
 */

const API_DIR = join(process.cwd(), 'src/app/api');

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

/** Endpoints reachable with no session - the ones scanners actually hit. */
const ANONYMOUS_ROUTES = [
  'src/app/api/geo-audit/route.ts',
  'src/app/api/newsletter/route.ts',
  'src/app/api/contact/route.ts',
  'src/app/api/free-check/route.ts',
  'src/app/api/tools/llms-txt-generator/route.ts',
  'src/app/api/tools/llms-txt-validator/route.ts',
  'src/app/api/tools/ai-crawler-checker/route.ts',
  'src/app/api/tools/chatgpt-mention-checker/route.ts',
  'src/app/api/tools/citation-finder/route.ts',
  'src/app/api/tools/competitor-finder/route.ts',
];

describe('anonymous endpoints tolerate malformed JSON bodies', () => {
  it.each(ANONYMOUS_ROUTES)('%s guards its json() parse', (rel) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    const unguarded = [...src.matchAll(/await\s+(?:req|request)\.json\(\)(?!\s*\.catch)/g)];
    expect(
      unguarded.length,
      `${rel} has a bare await req.json() - a malformed body will 500 instead of 400. ` +
        'Add .catch(() => ({})) and let the existing field validation return 400.',
    ).toBe(0);
  });

  it('covers every anonymous route the CSRF bootstrap list exposes', () => {
    // If a new anonymous endpoint is added to the middleware allow-list, it
    // must also be listed above - otherwise it ships without this guard.
    const middleware = readFileSync(join(process.cwd(), 'src/middleware.ts'), 'utf8');
    const block = middleware.slice(
      middleware.indexOf('CSRF_BOOTSTRAP_PATHS'),
      middleware.indexOf('function getAllowedOrigins'),
    );
    const listed = [...block.matchAll(/'(\/api\/(?:tools\/[a-z0-9-]+|geo-audit|contact|newsletter|free-check))'/g)]
      .map((m) => m[1]);
    for (const path of listed) {
      const rel = `src/app/api${path.replace('/api', '')}/route.ts`;
      expect(ANONYMOUS_ROUTES, `${path} is CSRF-bootstrapped but not covered by this test`).toContain(rel);
    }
  });

  it('does not let the bare-json() pattern spread further (ratchet)', () => {
    // 58 AUTHENTICATED routes still have a bare `await req.json()`. They are
    // materially lower risk than the anonymous ones fixed above - a valid
    // session is required to reach them, so they are not scanner-facing and
    // do not inflate the public error rate - and converting all 58 is a large
    // mechanical change with its own regression risk, so it is deliberately
    // NOT bundled with this fix.
    //
    // This is a ratchet, not an approval: the count may go down, never up. If
    // this fails because you added a route, guard its parse with
    // `.catch(() => ({}))` instead of raising the number. When someone does
    // the full sweep, drop this to 0 and restore the `toEqual([])` assertion.
    const KNOWN_AUTHENTICATED_OFFENDERS = 58;

    const offenders: string[] = [];
    for (const file of routeFiles(API_DIR)) {
      const src = readFileSync(file, 'utf8');
      if (/await\s+(?:req|request)\.json\(\)(?!\s*\.catch)/.test(src)) {
        offenders.push(file.replace(process.cwd() + '/', ''));
      }
    }

    // No anonymous route may ever appear here - those are covered above and
    // must stay at zero regardless of the ratchet.
    const anonymousOffenders = offenders.filter((o) => ANONYMOUS_ROUTES.includes(o));
    expect(anonymousOffenders, 'an anonymous endpoint regressed to a bare json() parse').toEqual([]);

    expect(
      offenders.length,
      `bare await req.json() count changed. Expected <= ${KNOWN_AUTHENTICATED_OFFENDERS}, got ${offenders.length}. ` +
        'Guard new routes with .catch(() => ({})); do not raise this number.',
    ).toBeLessThanOrEqual(KNOWN_AUTHENTICATED_OFFENDERS);
  });
});
