import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { activeRuns } from '@/lib/run-state';

export async function GET(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  const { id, runId } = await params;
  const runState = activeRuns.get(runId);

  if (!runState) {
    // Run not in memory — check if it completed and was saved to DB
    const access = await getBrandWithAccess(id, user.id);
    const brand = access?.brand;
    if (brand) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const run = (brand.runs || []).find((r: any) => r.id === runId);
      if (run) {
        return Response.json({
          status: 'done',
          received: run.totalQ || 0,
          totalExpected: run.totalQ || 0,
          foundCount: run.totalM || 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          errorCount: (run.allResults || []).filter((r: any) => r.error).length,
          results: run.allResults || [],
          finalData: {
            result: {
              totalQ: run.totalQ, totalM: run.totalM, sov: run.sov,
              newMentions: (run.mentions || []).length,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              errorCount: (run.allResults || []).filter((r: any) => r.error).length,
            },
          },
        });
      }
    }
    return Response.json({ error: 'Run not found' }, { status: 404 });
  }

  // Verify ownership
  if (runState.userId !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const resp: Record<string, unknown> = {
    status: runState.status,
    runId: runState.runId,
    received: runState.received,
    totalExpected: runState.totalExpected,
    foundCount: runState.foundCount,
    errorCount: runState.errorCount,
    platforms: runState.platforms,
    results: runState.results,
    startedAt: runState.startedAt,
  };
  if (runState.status === 'done') resp.finalData = runState.finalData;
  if (runState.status === 'error') resp.error = runState.error;

  return Response.json(resp);
}
