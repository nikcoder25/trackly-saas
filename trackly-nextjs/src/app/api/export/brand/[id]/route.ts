import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;

  // Export payloads include every historical run - large JSON responses,
  // so cap at 10/hr per user to stop bandwidth/CPU abuse.
  const rl = await checkUserIpRateLimit('export_brand', user.id, getClientIp(request), {
    user: { max: 10, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  const { id } = await params;
  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  return Response.json({ brand: access.brand }, {
    headers: {
      'Content-Disposition': `attachment; filename="brand-${id}.json"`,
      'Content-Type': 'application/json',
    },
  });
}
