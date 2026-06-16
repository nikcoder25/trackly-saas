import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for POST /api/admin/reset-breaker.
 *
 * The route handler combines five concerns: admin auth, IP/user rate
 * limiting, query param validation, in-process breaker reset, and
 * Redis breaker DEL. We mock the leaf modules so each concern can be
 * exercised independently and we don't drag a real Postgres / Redis
 * into the test process.
 */

// ── Mocks ───────────────────────────────────────────────────────
const requireAdminMock = vi.fn();
vi.mock('../src/lib/admin-auth', () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

const checkUserIpRateLimitMock = vi.fn();
const rateLimitResponseMock = vi.fn(() => Response.json({ error: 'rate_limited' }, { status: 429 }));
vi.mock('../src/lib/rate-limit', () => ({
  checkUserIpRateLimit: (...args: unknown[]) => checkUserIpRateLimitMock(...args),
  getClientIp: () => '127.0.0.1',
  rateLimitResponse: (...args: unknown[]) => rateLimitResponseMock(...args),
}));

const resetPlatformBreakerMock = vi.fn();
vi.mock('../src/lib/ai-platforms', () => ({
  resetPlatformBreaker: (...args: unknown[]) => resetPlatformBreakerMock(...args),
}));

const clearBreakerMock = vi.fn();
vi.mock('../src/lib/redis-platform-state', () => ({
  clearBreaker: (...args: unknown[]) => clearBreakerMock(...args),
}));

vi.mock('../src/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

// Import AFTER the mocks so the route picks up the stubs.
import { POST } from '../src/app/api/admin/reset-breaker/route';

const ADMIN = { id: 'admin-1', role: 'admin' };

beforeEach(() => {
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(ADMIN);
  checkUserIpRateLimitMock.mockReset();
  checkUserIpRateLimitMock.mockResolvedValue({ allowed: true });
  resetPlatformBreakerMock.mockReset();
  clearBreakerMock.mockReset();
  clearBreakerMock.mockResolvedValue({ available: true, deleted: 2 });
  rateLimitResponseMock.mockClear();
});
afterEach(() => { vi.clearAllMocks(); });

function makeReq(qs: string): Request {
  return new Request(`http://localhost/api/admin/reset-breaker${qs}`, { method: 'POST' });
}

describe('POST /api/admin/reset-breaker', () => {
  describe('auth + rate limiting', () => {
    it('returns the requireAdmin response when caller is not admin', async () => {
      const denied = Response.json({ error: 'Not found' }, { status: 404 });
      requireAdminMock.mockResolvedValueOnce(denied);
      const res = await POST(makeReq('?platform=gemini'));
      expect(res.status).toBe(404);
      expect(resetPlatformBreakerMock).not.toHaveBeenCalled();
      expect(clearBreakerMock).not.toHaveBeenCalled();
    });

    it('returns rate-limit response when checkUserIpRateLimit denies', async () => {
      checkUserIpRateLimitMock.mockResolvedValueOnce({ allowed: false, retryAfter: 30 });
      const res = await POST(makeReq('?platform=gemini'));
      expect(res.status).toBe(429);
      expect(rateLimitResponseMock).toHaveBeenCalledWith(30);
      expect(resetPlatformBreakerMock).not.toHaveBeenCalled();
      expect(clearBreakerMock).not.toHaveBeenCalled();
    });

    it('uses the documented rate-limit bucket (10/hour/admin)', async () => {
      await POST(makeReq('?platform=gemini'));
      expect(checkUserIpRateLimitMock).toHaveBeenCalledWith(
        'admin_reset_breaker',
        ADMIN.id,
        '127.0.0.1',
        { user: { max: 10, windowMs: 60 * 60 * 1000 } },
      );
    });
  });

  describe('platform validation', () => {
    it('returns 400 when platform query param is missing', async () => {
      const res = await POST(makeReq(''));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/missing platform/i);
      expect(body.allowed).toEqual(['gemini', 'chatgpt', 'perplexity', 'claude', 'grok']);
      expect(resetPlatformBreakerMock).not.toHaveBeenCalled();
    });

    it('returns 400 for an unknown platform name', async () => {
      const res = await POST(makeReq('?platform=midjourney'));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/unknown platform/i);
      expect(body.allowed).toEqual(['gemini', 'chatgpt', 'perplexity', 'claude', 'grok']);
      expect(resetPlatformBreakerMock).not.toHaveBeenCalled();
    });

    it('rejects empty / whitespace platform values', async () => {
      const res = await POST(makeReq('?platform=%20%20%20'));
      expect(res.status).toBe(400);
      expect(resetPlatformBreakerMock).not.toHaveBeenCalled();
    });

    it.each([
      ['gemini', 'Gemini'],
      ['Gemini', 'Gemini'],
      ['GEMINI', 'Gemini'],
      ['  gemini  ', 'Gemini'],
      ['chatgpt', 'ChatGPT'],
      ['ChatGPT', 'ChatGPT'],
      ['perplexity', 'Perplexity'],
      ['claude', 'Claude'],
      ['grok', 'Grok'],
    ])('normalises %j → canonical %j', async (input, canonical) => {
      const res = await POST(makeReq(`?platform=${encodeURIComponent(input)}`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.platform).toBe(canonical);
      expect(resetPlatformBreakerMock).toHaveBeenCalledWith(canonical);
      expect(clearBreakerMock).toHaveBeenCalledWith(canonical);
    });
  });

  describe('happy path', () => {
    it('calls in-process reset and Redis DEL, returns success body', async () => {
      const res = await POST(makeReq('?platform=gemini'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        ok: true,
        platform: 'Gemini',
        in_process_reset: true,
        redis_available: true,
        redis_deleted: 2,
      });
      expect(typeof body.timestamp).toBe('string');
      expect(resetPlatformBreakerMock).toHaveBeenCalledWith('Gemini');
      expect(clearBreakerMock).toHaveBeenCalledWith('Gemini');
    });

    it('reports redis_deleted=0 when the breaker was not open', async () => {
      clearBreakerMock.mockResolvedValueOnce({ available: true, deleted: 0 });
      const res = await POST(makeReq('?platform=claude'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.redis_deleted).toBe(0);
      expect(body.redis_available).toBe(true);
    });

    it('returns redis_available=false when no Redis client is configured', async () => {
      clearBreakerMock.mockResolvedValueOnce({ available: false, deleted: 0 });
      const res = await POST(makeReq('?platform=grok'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.in_process_reset).toBe(true);
      expect(body.redis_available).toBe(false);
      expect(body.redis_deleted).toBe(0);
      // In-process reset still happened - that's the meaningful action
      // on this pod when distributed limiter is off.
      expect(resetPlatformBreakerMock).toHaveBeenCalledWith('Grok');
    });
  });

  describe('Redis DEL failure', () => {
    it('returns 500 with in_process_reset=true so operator sees partial state', async () => {
      clearBreakerMock.mockRejectedValueOnce(new Error('READONLY'));
      const res = await POST(makeReq('?platform=perplexity'));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toMatchObject({
        ok: false,
        platform: 'Perplexity',
        in_process_reset: true,
        error: 'redis_del_failed',
        details: 'READONLY',
      });
      // In-process reset MUST have happened before the redis attempt -
      // confirms the partial-state reporting is honest.
      expect(resetPlatformBreakerMock).toHaveBeenCalledWith('Perplexity');
    });
  });
});
