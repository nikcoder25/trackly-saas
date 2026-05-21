/**
 * Admin-only AI proxy for the Backlink Article Generator tool.
 * POST /api/admin/backlink-generate
 *
 * Forwards a prompt to Claude or OpenAI using server-side API keys so the
 * keys never reach the browser. Access is gated on the 'admin' role via
 * the shared requireAdmin helper.
 */
import { requireAdmin } from '@/lib/admin-auth';
import { logError, serverError } from '@/lib/api-error';

export const maxDuration = 60;
export const runtime = 'nodejs';

type GenerateBody = {
  provider?: 'claude' | 'openai';
  model?: string;
  prompt?: string;
  maxTokens?: number;
};

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const provider = body.provider;
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const maxTokens = Math.max(256, Math.min(8000, Number(body.maxTokens) || 4000));

  if (!provider || !model || !prompt) {
    return Response.json({ error: 'Missing required fields: provider, model, prompt' }, { status: 400 });
  }
  if (prompt.length > 20000) {
    return Response.json({ error: 'Prompt too long (max 20000 chars)' }, { status: 400 });
  }

  try {
    if (provider === 'claude') return await callClaude(model, prompt, maxTokens);
    if (provider === 'openai') return await callOpenAI(model, prompt, maxTokens);
    return Response.json({ error: 'Invalid provider' }, { status: 400 });
  } catch (e) {
    logError('admin.backlink_generate.failed', e);
    return serverError({ message: 'Generation failed' });
  }
}

async function callClaude(model: string, prompt: string, maxTokens: number) {
  const apiKey =
    process.env.ANTHROPIC_API_KEY ||
    process.env.CLAUDE_API_KEY_1 ||
    process.env.CLAUDE_API_KEY_2 ||
    process.env.CLAUDE_API_KEY_3;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured on server' }, { status: 500 });
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message || `Claude API error ${res.status}`;
    return Response.json({ error: msg }, { status: res.status });
  }

  const blocks = Array.isArray((data as { content?: unknown }).content)
    ? ((data as { content: Array<{ type: string; text?: string }> }).content)
    : [];
  const content = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('\n');
  return Response.json({ content });
}

async function callOpenAI(model: string, prompt: string, maxTokens: number) {
  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY_1 ||
    process.env.OPENAI_API_KEY_2 ||
    process.env.OPENAI_API_KEY_3;
  if (!apiKey) {
    return Response.json({ error: 'OPENAI_API_KEY not configured on server' }, { status: 500 });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } })?.error?.message || `OpenAI API error ${res.status}`;
    return Response.json({ error: msg }, { status: res.status });
  }

  const content =
    (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || '';
  return Response.json({ content });
}
