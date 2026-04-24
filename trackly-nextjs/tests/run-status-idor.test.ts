/**
 * Regression test for Fix 1 (commit 792dbf9):
 *
 *   GET /api/brands/:id/run-status/:runId previously called
 *   reconcileStaleRuns() with URL-supplied params BEFORE the ownership
 *   check, allowing any authed user to mutate other tenants' run state.
 *
 * The fix reorders to: auth → shape-check → SELECT run → ownership check
 * → reconcile only if owner-verified and status='running'.
 *
 * This test mocks the route's three module dependencies so it stays
 * hermetic - no DB, no Next runtime - and asserts that the cross-tenant
 * 403 path NEVER calls reconcileStaleRuns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mocks above the route import (vi.mock auto-hoists, but we keep
// the spies addressable from the describe block via getter functions).
const mockRequireVerifiedAuth = vi.fn();
const mockReconcileStaleRuns = vi.fn();
const mockPoolQuery = vi.fn();

vi.mock('@/lib/db', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));
vi.mock('@/lib/auth', () => ({
  requireVerifiedAuth: (...args: unknown[]) => mockRequireVerifiedAuth(...args),
}));
vi.mock('@/lib/run-reconciler', () => ({
  reconcileStaleRuns: (...args: unknown[]) => mockReconcileStaleRuns(...args),
}));

// Import AFTER mocks so the route binds to the spies.
import { GET } from '../src/app/api/brands/[id]/run-status/[runId]/route';

function makeRequest(url: string): Request {
  return new Request(url, { method: 'GET' });
}

function makeParams(id: string, runId: string) {
  return { params: Promise.resolve({ id, runId }) };
}

describe('GET /api/brands/[id]/run-status/[runId] - IDOR regression', () => {
  beforeEach(() => {
    mockRequireVerifiedAuth.mockReset();
    mockReconcileStaleRuns.mockReset();
    mockPoolQuery.mockReset();
  });

  // Realistic id shapes (matches uid(): base36 timestamp + hex chars).
  const BRAND_A = 'brnd_aaaaaaaa';
  const BRAND_B = 'brnd_bbbbbbbb';
  const RUN_A = 'run_1234567890ab';

  it('returns 403 and does NOT call reconcileStaleRuns when the run belongs to another user', async () => {
    // Auth resolves as user-2.
    mockRequireVerifiedAuth.mockResolvedValueOnce({ id: 'user-2', email: 'two@example.com' });
    // The run row belongs to user-1.
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        id: RUN_A, brand_id: BRAND_A, user_id: 'user-1',
        status: 'running', total_expected: 10, received: 0, found_count: 0,
        error_count: 0, results: [], final_data: null, error: null,
        platforms: [], queries: [], started_at: new Date(),
        completed_at: null, updated_at: new Date(),
      }],
    });

    const res = await GET(
      makeRequest(`https://app.test/api/brands/${BRAND_A}/run-status/${RUN_A}`),
      makeParams(BRAND_A, RUN_A),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden' });
    // The whole point of the fix: the watchdog must NOT have run.
    expect(mockReconcileStaleRuns).not.toHaveBeenCalled();
    // Exactly one query: the SELECT for the ownership check.
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 403 and does NOT call reconcileStaleRuns when the run belongs to a different brand', async () => {
    mockRequireVerifiedAuth.mockResolvedValueOnce({ id: 'user-1', email: 'one@example.com' });
    // Same user but the run lives under brand-B while the URL says brand-A.
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        id: RUN_A, brand_id: BRAND_B, user_id: 'user-1',
        status: 'running', total_expected: 0, received: 0, found_count: 0,
        error_count: 0, results: [], final_data: null, error: null,
        platforms: [], queries: [], started_at: new Date(),
        completed_at: null, updated_at: new Date(),
      }],
    });

    const res = await GET(
      makeRequest(`https://app.test/api/brands/${BRAND_A}/run-status/${RUN_A}`),
      makeParams(BRAND_A, RUN_A),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Run does not belong to this brand' });
    expect(mockReconcileStaleRuns).not.toHaveBeenCalled();
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for malformed ids and does NOT touch DB or watchdog', async () => {
    mockRequireVerifiedAuth.mockResolvedValueOnce({ id: 'user-1', email: 'one@example.com' });

    const res = await GET(
      makeRequest('https://app.test/api/brands/$$$/run-status/!!!'),
      makeParams('$$$', '!!!'),
    );

    expect(res.status).toBe(400);
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(mockReconcileStaleRuns).not.toHaveBeenCalled();
  });

  it('returns 404 and does NOT call reconcileStaleRuns when the run id does not exist', async () => {
    mockRequireVerifiedAuth.mockResolvedValueOnce({ id: 'user-1', email: 'one@example.com' });
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await GET(
      makeRequest(`https://app.test/api/brands/${BRAND_A}/run-status/${RUN_A}`),
      makeParams(BRAND_A, RUN_A),
    );

    expect(res.status).toBe(404);
    expect(mockReconcileStaleRuns).not.toHaveBeenCalled();
  });

  it('does call reconcileStaleRuns on the happy path (own run, status=running)', async () => {
    mockRequireVerifiedAuth.mockResolvedValueOnce({ id: 'user-1', email: 'one@example.com' });
    // First SELECT: returns the running row that the user owns.
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        id: RUN_A, brand_id: BRAND_A, user_id: 'user-1',
        status: 'running', total_expected: 10, received: 3, found_count: 1,
        error_count: 0, results: [], final_data: null, error: null,
        platforms: ['ChatGPT'], queries: ['q1'], started_at: new Date(),
        completed_at: null, updated_at: new Date(),
      }],
    });
    mockReconcileStaleRuns.mockResolvedValueOnce({ count: 0, brandIds: [], runIds: [] });
    // Re-read after reconcile: row unchanged.
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        id: RUN_A, brand_id: BRAND_A, user_id: 'user-1',
        status: 'running', total_expected: 10, received: 3, found_count: 1,
        error_count: 0, results: [], final_data: null, error: null,
        platforms: ['ChatGPT'], queries: ['q1'], started_at: new Date(),
        completed_at: null, updated_at: new Date(),
      }],
    });

    const res = await GET(
      makeRequest(`https://app.test/api/brands/${BRAND_A}/run-status/${RUN_A}`),
      makeParams(BRAND_A, RUN_A),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('running');
    expect(mockReconcileStaleRuns).toHaveBeenCalledTimes(1);
    expect(mockReconcileStaleRuns).toHaveBeenCalledWith({ brandId: BRAND_A, runId: RUN_A });
  });

  it('does NOT call reconcileStaleRuns when the owned run is already terminal (done)', async () => {
    mockRequireVerifiedAuth.mockResolvedValueOnce({ id: 'user-1', email: 'one@example.com' });
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        id: RUN_A, brand_id: BRAND_A, user_id: 'user-1',
        status: 'done', total_expected: 10, received: 10, found_count: 4,
        error_count: 0, results: [], final_data: { sov: 40 }, error: null,
        platforms: ['ChatGPT'], queries: ['q1'], started_at: new Date(),
        completed_at: new Date(), updated_at: new Date(),
      }],
    });

    const res = await GET(
      makeRequest(`https://app.test/api/brands/${BRAND_A}/run-status/${RUN_A}`),
      makeParams(BRAND_A, RUN_A),
    );

    expect(res.status).toBe(200);
    expect(mockReconcileStaleRuns).not.toHaveBeenCalled();
    // Only one SELECT - no re-read because no reconcile.
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });
});
