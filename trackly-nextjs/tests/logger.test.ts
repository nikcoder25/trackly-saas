import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock @sentry/nextjs so we don't need a real DSN or network, and we can
// inspect calls to Sentry.logger.*. The vi.mock call is hoisted, so the
// mocked module is in place before the logger module imports it.
const sentryMocks = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
vi.mock('@sentry/nextjs', () => ({
  logger: sentryMocks,
}));

async function loadFreshLogger() {
  // Force re-evaluation so the module picks up the current env state. Not
  // strictly needed for this logger (env is read per-call), but it isolates
  // tests from each other.
  vi.resetModules();
  return (await import('../src/lib/logger')).logger;
}

describe('logger', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>;
  let consoleWarn: ReturnType<typeof vi.spyOn>;
  let consoleError: ReturnType<typeof vi.spyOn>;
  const prevFlag = process.env.SENTRY_LOGS_ENABLED;

  beforeEach(() => {
    Object.values(sentryMocks).forEach(fn => fn.mockReset());
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLog.mockRestore();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
    if (prevFlag === undefined) delete process.env.SENTRY_LOGS_ENABLED;
    else process.env.SENTRY_LOGS_ENABLED = prevFlag;
  });

  it('forwards info to Sentry.logger.info AND still console.logs (dual-write)', async () => {
    delete process.env.SENTRY_LOGS_ENABLED; // default: enabled
    const logger = await loadFreshLogger();

    logger.info('cron.summary', { processed: 3, skipped: 1 });

    expect(sentryMocks.info).toHaveBeenCalledTimes(1);
    expect(sentryMocks.info).toHaveBeenCalledWith('cron.summary', { processed: 3, skipped: 1 });
    expect(consoleLog).toHaveBeenCalledWith('cron.summary', { processed: 3, skipped: 1 });
  });

  it('forwards error to Sentry.logger.error with the right payload AND console.errors', async () => {
    delete process.env.SENTRY_LOGS_ENABLED;
    const logger = await loadFreshLogger();

    const attrs = { userId: 'u_123', code: 'E_TIMEOUT' };
    logger.error('brand.run_failed', attrs);

    expect(sentryMocks.error).toHaveBeenCalledTimes(1);
    expect(sentryMocks.error).toHaveBeenCalledWith('brand.run_failed', attrs);
    expect(consoleError).toHaveBeenCalledWith('brand.run_failed', attrs);
  });

  it('warn goes to Sentry.logger.warn and console.warn', async () => {
    delete process.env.SENTRY_LOGS_ENABLED;
    const logger = await loadFreshLogger();

    logger.warn('cron.skip', { name: 'scheduler', reason: 'locked' });

    expect(sentryMocks.warn).toHaveBeenCalledWith('cron.skip', { name: 'scheduler', reason: 'locked' });
    expect(consoleWarn).toHaveBeenCalledWith('cron.skip', { name: 'scheduler', reason: 'locked' });
  });

  it('debug goes to Sentry.logger.debug and console.log', async () => {
    delete process.env.SENTRY_LOGS_ENABLED;
    const logger = await loadFreshLogger();

    logger.debug('worker.heartbeat');

    expect(sentryMocks.debug).toHaveBeenCalledWith('worker.heartbeat', undefined);
    expect(consoleLog).toHaveBeenCalledWith('worker.heartbeat');
  });

  it('when SENTRY_LOGS_ENABLED=false, skips the Sentry call but still writes to console', async () => {
    process.env.SENTRY_LOGS_ENABLED = 'false';
    const logger = await loadFreshLogger();

    logger.info('cron.summary', { processed: 7 });
    logger.error('brand.run_failed', { userId: 'u_1' });
    logger.warn('cron.skip', { name: 'reports' });

    expect(sentryMocks.info).not.toHaveBeenCalled();
    expect(sentryMocks.error).not.toHaveBeenCalled();
    expect(sentryMocks.warn).not.toHaveBeenCalled();

    // Console is unaffected by the kill switch - the point of the flag is
    // to stop Sentry-side forwarding without losing local visibility.
    expect(consoleLog).toHaveBeenCalledWith('cron.summary', { processed: 7 });
    expect(consoleError).toHaveBeenCalledWith('brand.run_failed', { userId: 'u_1' });
    expect(consoleWarn).toHaveBeenCalledWith('cron.skip', { name: 'reports' });
  });

  it('swallows errors thrown by the Sentry logger so callers never see a logging crash', async () => {
    delete process.env.SENTRY_LOGS_ENABLED;
    sentryMocks.error.mockImplementation(() => {
      throw new Error('sentry exploded');
    });
    const logger = await loadFreshLogger();

    expect(() => logger.error('something', { a: 1 })).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith('something', { a: 1 });
  });

  it('omits attrs from console output when undefined', async () => {
    delete process.env.SENTRY_LOGS_ENABLED;
    const logger = await loadFreshLogger();

    logger.info('worker.booted');

    expect(consoleLog).toHaveBeenCalledWith('worker.booted');
    expect(sentryMocks.info).toHaveBeenCalledWith('worker.booted', undefined);
  });
});
