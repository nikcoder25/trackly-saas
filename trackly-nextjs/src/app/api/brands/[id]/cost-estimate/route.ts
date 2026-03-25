import { verifyRequestAuth } from '@/lib/auth';
import { getBrandWithAccess } from '@/lib/helpers';
import { getDefaultModel, MODEL_PRICING } from '@/lib/ai-platforms';

const PLATFORMS = ['ChatGPT', 'Perplexity', 'Claude', 'Gemini', 'Grok'];
const AVG_INPUT_TOKENS = 150;
const AVG_OUTPUT_TOKENS = 250;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  const { id } = await params;

  const access = await getBrandWithAccess(id, user.id);
  if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });

  const brand = access.brand;
  const queryCount = brand.queries?.length || 0;
  let totalCost = 0;
  const breakdown: Record<string, number> = {};

  for (const platform of PLATFORMS) {
    const model = getDefaultModel(platform);
    const pricing = MODEL_PRICING[model];
    if (!pricing) continue;
    const cost = queryCount * ((AVG_INPUT_TOKENS * pricing.input + AVG_OUTPUT_TOKENS * pricing.output) / 1_000_000);
    breakdown[platform] = Math.round(cost * 10000) / 10000;
    totalCost += cost;
  }

  return Response.json({ queryCount, platforms: PLATFORMS.length, estimatedCost: Math.round(totalCost * 10000) / 10000, breakdown });
}
