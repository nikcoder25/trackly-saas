/**
 * Shared bits for the /api/rank-tracking routes: who is asking, on which
 * plan, and JSON body parsing. The account is the signed-in user (the same
 * owner scoping brands use).
 */
import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getUserEffectivePlan } from '@/lib/helpers';
import { ensureRankSchema } from './schema';

export interface RankCaller { userId: string; accountId: string; email: string; plan: string }

export async function rankCaller(request: Request): Promise<RankCaller | Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  await ensureRankSchema();
  const plan = await getUserEffectivePlan(auth.id);
  return { userId: auth.id, accountId: auth.id, email: auth.email, plan };
}

export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const noStore = { headers: { 'Cache-Control': 'no-store' } };
export const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const strList = (v: unknown, max = 1000) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : []);
