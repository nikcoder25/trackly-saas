import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
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
