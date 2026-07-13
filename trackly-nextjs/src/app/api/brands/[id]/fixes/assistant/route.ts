/**
 * POST /api/brands/[id]/fixes/assistant
 *
 * The "Ask for a fix" agent. The user describes, in plain language, anything
 * they want to improve on their site; we classify it into one fix capability,
 * extract its inputs (page URL, keyword, pasted passage, styling preference),
 * and create the task — or ask ONE clarifying question when something required
 * is missing.
 *
 * Body: { request: string, url?: string }
 * Returns either:
 *   { ok: true, clarify: string }                          — need more info / unsupported
 *   { ok: true, fix, taskSummary, moduleKey }              — task created (client generates the draft)
 */

import { pool } from '@/lib/db';
import { requireVerifiedAuth } from '@/lib/auth';
import { getBrandWithAccess, getUserEffectivePlan } from '@/lib/helpers';
import { logger } from '@/lib/logger';
import { getFix } from '@/lib/fix-engine/schema';
import { getModule, meetsPlan } from '@/lib/fix-engine/registry';
import { buildContext } from '@/lib/fix-engine/engine';
import { generateJson } from '@/lib/fix-engine/generate';
import { createTargetedFix, TARGETED_MODULES, isTargetedModule } from '@/lib/fix-engine/targeted';

interface Body { request?: unknown; url?: unknown }

interface Classified {
  moduleKey?: string;
  url?: string;
  keyword?: string;
  passage?: string;
  instruction?: string;
  taskSummary?: string;
  clarify?: string;
}

const ASSISTANT_SYSTEM = `You are the routing brain for a website fix assistant. The user describes, in plain language, something they want to improve on their website. Map the request to EXACTLY ONE capability and extract its inputs. Return ONLY a JSON object — no prose.

Capabilities (moduleKey → what it does):
${TARGETED_MODULES.map((m) => `- "${m.key}": ${m.purpose}`).join('\n')}

Return this JSON shape:
{
  "moduleKey": one of the keys above, or "unknown",
  "url": "the page URL the request is about (use the provided page URL if given), or empty string",
  "keyword": "the target keyword, only for keyword-opportunities, else empty",
  "passage": "the EXACT paragraph text the user pasted, only for passage-rewrite, else empty",
  "instruction": "a short, specific restatement of what the user wants (tone, angle, which anchor/target, etc.) to steer the fix",
  "taskSummary": "one friendly sentence describing the task you'll create, e.g. 'Rewrite the title on /pricing to be punchier'",
  "clarify": "if you cannot proceed, ONE short question; else empty string"
}

Rules:
- Every capability needs a page URL. If no URL is provided or present in the request, set clarify to ask which page (and leave moduleKey your best guess).
- keyword-opportunities REQUIRES a keyword — if none is given, set clarify asking for it.
- passage-rewrite is only when the user pasted the actual paragraph. If they want the page's content improved for AI/SEO generally, use geo-page-rewrite instead.
- Pick internal-linking for anything about interlinking, internal links, or anchor text between pages.
- If the request is off-topic or none of the capabilities fit, set moduleKey "unknown" and use clarify to briefly say what you CAN help with (titles, meta descriptions, passages, internal links/anchors, keyword targeting, FAQ schema, or optimising a page for AI answers).
- Never invent a URL that wasn't given.`;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireVerifiedAuth(request, pool);
  if (auth instanceof Response) return auth;
  const user = auth;
  try {
    const { id } = await params;
    const access = await getBrandWithAccess(id, user.id);
    if (!access) return Response.json({ error: 'Brand not found' }, { status: 404 });
    if (access.role === 'viewer') return Response.json({ error: 'Viewers cannot create fixes.' }, { status: 403 });

    let body: Body;
    try { body = (await request.json()) as Body; } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
    const reqText = typeof body.request === 'string' ? body.request.trim() : '';
    const providedUrl = typeof body.url === 'string' ? body.url.trim() : '';
    if (reqText.length < 3) return Response.json({ error: 'Tell me what you’d like to fix.' }, { status: 400 });

    const ctx = await buildContext(id);
    if (!ctx) return Response.json({ error: 'Brand not found' }, { status: 404 });

    // Classify the request into a capability + inputs.
    let cls: Classified;
    try {
      const { data } = await generateJson<Classified>({
        ctx,
        system: ASSISTANT_SYSTEM,
        user: `Provided page URL: ${providedUrl || '(none given)'}\n\nUser request:\n"""\n${reqText.slice(0, 2000)}\n"""`,
        maxTokens: 500,
      });
      cls = data || {};
    } catch (e) {
      logger.warn('fix_engine.assistant_classify_failed', { err: (e as Error).message });
      return Response.json({ ok: true, clarify: 'I couldn’t read that just now — try rephrasing what you’d like to fix and include the page URL.' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const moduleKey = (cls.moduleKey || '').trim();
    const url = (cls.url || '').trim() || providedUrl;

    // Not routable → surface the assistant's clarifying question.
    if (!isTargetedModule(moduleKey)) {
      return Response.json({ ok: true, clarify: cls.clarify || 'I can help with titles, meta descriptions, rewriting a paragraph, internal links & anchor text, targeting a keyword, adding FAQ schema, or optimising a page for AI answers. Which of those — and on which page?' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const mod = getModule(moduleKey)!;
    const ownerId = access.brand.userId || user.id;
    const plan = await getUserEffectivePlan(ownerId);
    if (!meetsPlan(plan, mod.minPlan)) {
      return Response.json({ ok: true, clarify: `That would use “${mod.title}”, which isn’t on your current plan. Upgrade to unlock it, or ask for something else.` }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Missing a required input, or the LLM asked something → clarify.
    if (cls.clarify && (!url || (moduleKey === 'keyword-opportunities' && !cls.keyword) || (moduleKey === 'passage-rewrite' && !cls.passage))) {
      return Response.json({ ok: true, clarify: cls.clarify }, { headers: { 'Cache-Control': 'no-store' } });
    }

    try {
      const { fixId } = await createTargetedFix({
        brandId: id,
        ownerId,
        website: access.brand.website,
        moduleKey,
        url,
        keyword: cls.keyword,
        passage: cls.passage,
        instruction: cls.instruction,
        brandQueries: ctx.brand.queries,
      });
      const fix = await getFix(fixId, id);
      return Response.json(
        { ok: true, fix, moduleKey, taskSummary: cls.taskSummary || mod.title },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (e) {
      // Missing/invalid input from createTargetedFix → turn into a clarifying ask.
      return Response.json({ ok: true, clarify: (e as Error).message }, { headers: { 'Cache-Control': 'no-store' } });
    }
  } catch (e) {
    logger.error('fix_engine.assistant_failed', { err: (e as Error).message });
    return Response.json({ error: 'Failed to process that request', message: (e as Error).message }, { status: 500 });
  }
}
