import { PLATFORM_MODELS, MODEL_PRICING } from '@/lib/ai-platforms';
import { verifyRequestAuth } from '@/lib/auth';

export async function GET(request: Request) {
  const user = verifyRequestAuth(request);
  if (!user) return Response.json({ error: 'No token' }, { status: 401 });
  return Response.json({ models: PLATFORM_MODELS, pricing: MODEL_PRICING });
}
