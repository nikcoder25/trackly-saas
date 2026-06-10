import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression tests for the production boot guards in src/instrumentation.ts.
// The DodoPayments live_mode check was once disabled with a hardcoded
// `if (false && ...)`, which would have let production boot with sandbox
// checkouts. These tests pin the guards so a silent re-disable fails CI.

// instrumentation.ts imports ../sentry.server.config (which calls
// Sentry.init); stub it out so the guard logic runs in isolation.
vi.mock('../sentry.server.config', () => ({}));

const GOOD_ENV: Record<string, string> = {
  NEXT_RUNTIME: 'nodejs',
  NODE_ENV: 'production',
  JWT_SECRET: 'a-sufficiently-long-random-jwt-secret-0123456789',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  CRON_SECRET: 'cron-secret',
  APP_URL: 'https://livesov.com',
  ALLOWED_ORIGINS: 'https://livesov.com',
};

async function registerWith(overrides: Record<string, string | undefined>): Promise<void> {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...GOOD_ENV, ...overrides })) {
    if (v === undefined) vi.stubEnv(k, '');
    else vi.stubEnv(k, v);
  }
  const { register } = await import('@/instrumentation');
  await register();
}

describe('instrumentation production boot guards', () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it('boots with a valid production configuration (payments unconfigured)', async () => {
    await expect(registerWith({})).resolves.toBeUndefined();
  });

  it('refuses to boot when DodoPayments is configured in test_mode', async () => {
    await expect(
      registerWith({
        DODO_PAYMENTS_API_KEY: 'dodo-key',
        DODO_PAYMENTS_ENVIRONMENT: 'test_mode',
        DODO_PAYMENTS_RETURN_URL: 'https://livesov.com',
      }),
    ).rejects.toThrow(/live_mode/);
  });

  it('refuses to boot when DodoPayments environment is missing entirely', async () => {
    await expect(
      registerWith({
        DODO_PAYMENTS_API_KEY: 'dodo-key',
        DODO_PAYMENTS_ENVIRONMENT: undefined,
        DODO_PAYMENTS_RETURN_URL: 'https://livesov.com',
      }),
    ).rejects.toThrow(/live_mode/);
  });

  it('boots when DodoPayments is fully configured for live_mode', async () => {
    await expect(
      registerWith({
        DODO_PAYMENTS_API_KEY: 'dodo-key',
        DODO_PAYMENTS_ENVIRONMENT: 'live_mode',
        DODO_PAYMENTS_RETURN_URL: 'https://livesov.com',
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses to boot with a localhost APP_URL', async () => {
    await expect(registerWith({ APP_URL: 'http://localhost:3000' })).rejects.toThrow(/APP_URL/);
  });
});
