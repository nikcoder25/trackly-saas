/**
 * Admin-only AI proxy for the Backlink Article Generator tool.
 * POST /api/admin/backlink-generate
 *
 * Forwards a prompt to Claude or OpenAI using server-side API keys so the
 * keys never reach the browser. Access is gated on the 'admin' role via
 * the shared requireAdmin helper.
 *
 * Keys are read via getServerKeys() so we share parsing (trimming,
 * numbered suffixes, dedupe) with the rest of the codebase. On
 * 401/403 from the upstream API we transparently fall through to the
 * next configured key, which protects against a single stale value
 * silently breaking generation when other valid keys are present.
 */
import { requireAdmin } from '@/lib/admin-auth';
import { logError, serverError } from '@/lib/api-error';
import {
  enforcePlatformDailyCap,
  estimateAnthropicCostUsd,
  PlatformDailyCapExceededError,
  recordCall,
} from '@/lib/cost-tracker';
import { checkUserIpRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getServerKeys } from '@/lib/server-keys';

export const maxDuration = 60;
export const runtime = 'nodejs';

type GenerateBody = {
  provider?: 'claude' | 'openai';
  model?: string;
  prompt?: string;
  maxTokens?: number;
};

// Server-side allowlist. The model id used to be taken verbatim from the
// browser, so a stale saved preference (earlier builds defaulted to
// Sonnet) or a hand-edited request could point bulk article generation
// at a $10/$50-per-million model. Anything not listed here is refused;
// extend via BACKLINK_GENERATE_EXTRA_MODELS (comma-separated) rather than
// by editing the request.
const ALLOWED_MODELS: Record<'claude' | 'openai', Set<string>> = {
  claude: new Set(['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7']),
  openai: new Set(['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-5.4-nano', 'gpt-5.4-mini']),
};

function modelAllowed(provider: 'claude' | 'openai', model: string): boolean {
  if (ALLOWED_MODELS[provider].has(model)) return true;
  const extra = (process.env.BACKLINK_GENERATE_EXTRA_MODELS || '')
    .split(',').map(m => m.trim()).filter(Boolean);
  return extra.includes(model);
}

// Bulk generation runs with client-side concurrency, so this is sized
// for a real batch (a few hundred articles an hour) while still bounding
// a runaway tab or script.
const PER_ADMIN_HOURLY_LIMIT = 300;

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
  if (provider !== 'claude' && provider !== 'openai') {
    return Response.json({ error: 'Invalid provider' }, { status: 400 });
  }
  if (!modelAllowed(provider, model)) {
    return Response.json(
      { error: `Model "${model}" is not enabled for article generation. Pick Haiku 4.5 (recommended) or another listed model.` },
      { status: 400 },
    );
  }
  if (prompt.length > 20000) {
    return Response.json({ error: 'Prompt too long (max 20000 chars)' }, { status: 400 });
  }

  const rl = await checkUserIpRateLimit('admin_backlink_generate', admin.id, getClientIp(request), {
    user: { max: PER_ADMIN_HOURLY_LIMIT, windowMs: 60 * 60 * 1000 },
  });
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter);

  try {
    // Same global daily brake every other AI path gets. This route calls
    // the providers directly, so it has to opt in explicitly.
    await enforcePlatformDailyCap(provider === 'claude' ? 'Claude' : 'ChatGPT');
    if (provider === 'claude') return await callClaude(model, prompt, maxTokens);
    return await callOpenAI(model, prompt, maxTokens);
  } catch (e) {
    if (e instanceof PlatformDailyCapExceededError) {
      return Response.json({ error: e.message, code: 'platform_daily_cap' }, { status: 429 });
    }
    logError('admin.backlink_generate.failed', e);
    return serverError({ message: 'Generation failed' });
  }
}

function getClaudeKeys(): string[] {
  const keys = getServerKeys().claude;
  // Also accept ANTHROPIC_API_KEY as a last-resort alias (some deploys
  // use Anthropic's official env name). Trim and dedupe.
  const anthropic = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (anthropic && !keys.includes(anthropic)) keys.push(anthropic);
  return keys;
}

async function callClaude(model: string, prompt: string, maxTokens: number) {
  const keys = getClaudeKeys();
  if (keys.length === 0) {
    return Response.json(
      { error: 'No Claude API key configured. Set CLAUDE_API_KEY (or CLAUDE_API_KEY_1) on the server.' },
      { status: 500 },
    );
  }

  let lastStatus = 500;
  let lastError = 'Claude API error';
  for (const apiKey of keys) {
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
    if (res.ok) {
      const blocks = Array.isArray((data as { content?: unknown }).content)
        ? ((data as { content: Array<{ type: string; text?: string }> }).content)
        : [];
      const content = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('\n');
      const usage = (data as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      const served = (data as { model?: string }).model || model;
      await recordCall({
        platform: 'Claude',
        model: served,
        tokensIn: usage?.input_tokens || 0,
        tokensOut: usage?.output_tokens || 0,
        costUsd: estimateAnthropicCostUsd(served, usage) ?? undefined,
      });
      return Response.json({ content });
    }

    lastStatus = res.status;
    lastError = (data as { error?: { message?: string } })?.error?.message || `Claude API error ${res.status}`;
    // Only fall through to the next key on auth errors; other errors
    // (rate limit, bad request) won't be helped by trying another key.
    if (res.status !== 401 && res.status !== 403) break;
  }

  return Response.json({ error: lastError }, { status: lastStatus });
}

async function callOpenAI(model: string, prompt: string, maxTokens: number) {
  const keys = getServerKeys().openai;
  if (keys.length === 0) {
    return Response.json(
      { error: 'No OpenAI API key configured. Set OPENAI_API_KEY (or OPENAI_API_KEY_1) on the server.' },
      { status: 500 },
    );
  }

  let lastStatus = 500;
  let lastError = 'OpenAI API error';
  for (const apiKey of keys) {
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
    if (res.ok) {
      const content =
        (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || '';
      const usage = (data as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
      await recordCall({
        platform: 'ChatGPT',
        model: (data as { model?: string }).model || model,
        tokensIn: usage?.prompt_tokens || 0,
        tokensOut: usage?.completion_tokens || 0,
      });
      return Response.json({ content });
    }

    lastStatus = res.status;
    lastError = (data as { error?: { message?: string } })?.error?.message || `OpenAI API error ${res.status}`;
    if (res.status !== 401 && res.status !== 403) break;
  }

  return Response.json({ error: lastError }, { status: lastStatus });
}
