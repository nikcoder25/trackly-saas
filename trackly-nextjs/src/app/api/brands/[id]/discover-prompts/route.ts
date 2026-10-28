/**
 * Staged prompt discovery.
 *
 *   POST   - start a discovery job and return immediately with its id
 *   GET    - poll a job's stage-by-stage progress (`?job=<id>`, or the
 *            brand's most recent unconsumed job when omitted)
 *   DELETE - mark a job dealt with (`?job=<id>`), so a reopened tab stops
 *            rejoining it. Sent when the user accepts or dismisses the
 *            result; the row is kept for history.
 *
 * The work runs in after(), so the response does not wait on it and the
 * user can close the page without cancelling anything.
 */

import { after } from 'next/server';
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getPlanLimits, getEffectivePlan } from '@/lib/constants';
import { countTrackedPromptsForOwnerExcluding } from '@/lib/prompt-quota';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logError, serverError } from '@/lib/api-error';
import {
  consumeDiscoveryJob,
  createDiscoveryJob,
  getDiscoveryJob,
  getLatestDiscoveryJob,
  runDiscovery,
} from '@/lib/prompt-discovery';

interface BrandShape {
  id: string;
  userId?: string;
  name?: string;
  industry?: string;
  city?: string;
  website?: string;
  queries?: unknown;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    const user = authResult;
    const { id } = await params;

    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') {
      return Response.json({ error: 'Viewers cannot discover prompts' }, { status: 403 });
    }
    const brand = access.brand as BrandShape;

    if (!brand.industry) {
      return Response.json(
        { error: 'Set this brand’s industry first - discovery needs it to know what to ask.' },
        { status: 400 },
      );
    }

    // Several LLM calls per job, so this is capped tighter than most routes.
    const rl = await rateLimit(`discover:${user.id}`, 15 * 60 * 1000, 6);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

    // Never discover more prompts than the owner's plan can hold - offering
    // 40 to an account with room for 5 just produces a rejected save later.
    const ownerId = brand.userId || user.id;
    const planRow = await pool.query('SELECT plan, trial_ends_at FROM users WHERE id = $1', [ownerId]);
    const plan = getEffectivePlan(planRow.rows[0]?.plan, planRow.rows[0]?.trial_ends_at);
    const limits = getPlanLimits(plan);
    const existing = Array.isArray(brand.queries)
      ? (brand.queries as unknown[]).filter((q): q is string => typeof q === 'string')
      : [];

    let maxPrompts = 25;
    if (limits.trackedPromptsPerAccount < 9999) {
      const used = await countTrackedPromptsForOwnerExcluding(ownerId, id);
      const room = limits.trackedPromptsPerAccount - used - existing.length;
      if (room <= 0) {
        return Response.json({
          error: `Your ${plan} plan allows ${limits.trackedPromptsPerAccount} tracked prompts and they are all in use. Remove some or upgrade first.`,
          planLimit: true,
        }, { status: 403 });
      }
      maxPrompts = Math.min(maxPrompts, room);
    }

    const job = await createDiscoveryJob(id, user.id);

    after(async () => {
      await runDiscovery({
        jobId: job.id,
        brandId: id,
        tenantId: ownerId,
        brandName: brand.name || 'the brand',
        industry: brand.industry,
        city: brand.city,
        website: brand.website,
        existing,
        maxPrompts,
      });
    });

    return Response.json({ job });
  } catch (e) {
    logError('discover_prompts.start_failed', e);
    return serverError({ message: 'Failed to start prompt discovery' });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    const user = authResult;
    const { id } = await params;

    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

    const jobId = new URL(request.url).searchParams.get('job');
    const job = jobId ? await getDiscoveryJob(jobId) : await getLatestDiscoveryJob(id);
    if (!job) return Response.json({ job: null });
    // A job id is guessable enough that it must not be a capability on its
    // own - confirm it belongs to the brand the caller has access to.
    if (job.brandId !== id) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    return Response.json({ job });
  } catch (e) {
    logError('discover_prompts.status_failed', e);
    return serverError({ message: 'Failed to read discovery status' });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireVerifiedAuth(request, pool);
    if (authResult instanceof Response) return authResult;
    const user = authResult;
    const { id } = await params;

    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') {
      return Response.json({ error: 'Viewers cannot change discovery jobs' }, { status: 403 });
    }

    const jobId = new URL(request.url).searchParams.get('job');
    if (!jobId) return Response.json({ error: 'job is required' }, { status: 400 });
    const job = await getDiscoveryJob(jobId);
    // Same ownership check as GET: a job id must not be a capability.
    if (!job || job.brandId !== id) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    await consumeDiscoveryJob(jobId, id);
    return Response.json({ ok: true });
  } catch (e) {
    logError('discover_prompts.dismiss_failed', e);
    return serverError({ message: 'Failed to dismiss the discovery job' });
  }
}
