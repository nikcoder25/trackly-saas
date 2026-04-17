import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getDefaultModel, MODEL_PRICING } from '@/lib/ai-platforms';

const PLATFORMS = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok', 'Google AI Overviews'];
const AVG_INPUT_TOKENS = 150;
const AVG_OUTPUT_TOKENS = 250;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireVerifiedAuth(request, pool);
  if (authResult instanceof Response) return authResult;
  const user = authResult;
  const { id } = await params;

  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const brand = access.brand;
  const queryCount = brand.queries?.length || 0;
  // Only estimate cost for the platforms the user has actually selected.
  // Fall back to all platforms if none saved yet (backwards compatibility).
  const selected: string[] = Array.isArray(brand.selected_platforms) && brand.selected_platforms.length > 0
    ? brand.selected_platforms.filter((p: string) => PLATFORMS.includes(p))
    : PLATFORMS;
  let totalCost = 0;
  const breakdown: Record<string, number> = {};

  for (const platform of selected) {
    const model = getDefaultModel(platform);
    const pricing = MODEL_PRICING[model];
    if (!pricing) continue;
    const cost = queryCount * ((AVG_INPUT_TOKENS * pricing.input + AVG_OUTPUT_TOKENS * pricing.output) / 1_000_000);
    breakdown[platform] = Math.round(cost * 10000) / 10000;
    totalCost += cost;
  }

  return Response.json({ queryCount, platforms: selected.length, estimatedCost: Math.round(totalCost * 10000) / 10000, breakdown });
}
