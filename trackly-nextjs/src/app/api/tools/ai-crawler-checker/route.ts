import { NextRequest } from 'next/server';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { safeFetch, SSRFError } from '@/lib/safe-fetch';
import { logError, serverError } from '@/lib/api-error';

const AI_CRAWLERS = [
  { name: 'GPTBot', vendor: 'OpenAI', purpose: 'Trains ChatGPT and GPT-series models' },
  { name: 'OAI-SearchBot', vendor: 'OpenAI', purpose: 'Powers ChatGPT Search results' },
  { name: 'ChatGPT-User', vendor: 'OpenAI', purpose: 'Fetches pages live during a ChatGPT conversation' },
  { name: 'ClaudeBot', vendor: 'Anthropic', purpose: 'Trains Claude models' },
  { name: 'Claude-Web', vendor: 'Anthropic', purpose: 'Fetches pages for Claude search/citations' },
  { name: 'PerplexityBot', vendor: 'Perplexity', purpose: 'Indexes pages for Perplexity answers' },
  { name: 'Perplexity-User', vendor: 'Perplexity', purpose: 'Live fetches pages cited in answers' },
  { name: 'Google-Extended', vendor: 'Google', purpose: 'Trains Gemini and Vertex AI models' },
  { name: 'GoogleOther', vendor: 'Google', purpose: 'Research/development product crawler' },
  { name: 'CCBot', vendor: 'Common Crawl', purpose: 'Public corpus used by many AI labs' },
  { name: 'Bytespider', vendor: 'ByteDance', purpose: 'Trains ByteDance / TikTok AI models' },
  { name: 'Meta-ExternalAgent', vendor: 'Meta', purpose: 'Trains Llama models' },
  { name: 'Applebot-Extended', vendor: 'Apple', purpose: 'Trains Apple Intelligence models' },
];

interface RobotsRule {
  userAgents: string[];
  rules: Array<{ type: 'allow' | 'disallow'; path: string }>;
}

function parseRobotsTxt(text: string): RobotsRule[] {
  const groups: RobotsRule[] = [];
  let current: RobotsRule | null = null;
  let lastLineWasDirective = false;

  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (!current || lastLineWasDirective) {
        current = { userAgents: [value], rules: [] };
        groups.push(current);
        lastLineWasDirective = false;
      } else {
        current.userAgents.push(value);
      }
    } else if (field === 'allow' || field === 'disallow') {
      if (!current) {
        current = { userAgents: ['*'], rules: [] };
        groups.push(current);
      }
      current.rules.push({ type: field as 'allow' | 'disallow', path: value });
      lastLineWasDirective = true;
    }
  }
  return groups;
}

function findGroupForUserAgent(groups: RobotsRule[], ua: string): RobotsRule | null {
  const lower = ua.toLowerCase();
  let best: RobotsRule | null = null;
  let bestLen = -1;
  for (const g of groups) {
    for (const a of g.userAgents) {
      const al = a.toLowerCase();
      if (al === lower && al.length > bestLen) {
        best = g;
        bestLen = al.length;
      }
    }
  }
  if (best) return best;
  for (const g of groups) {
    if (g.userAgents.some((a) => a === '*')) return g;
  }
  return null;
}

function pathMatches(rulePath: string, target: string): boolean {
  if (!rulePath) return false;
  // Convert robots.txt pattern to regex (supports * and $).
  const escaped = rulePath.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const pattern = '^' + escaped.replace(/\*/g, '.*').replace(/\\\$$/, '$');
  try {
    return new RegExp(pattern).test(target);
  } catch {
    return target.startsWith(rulePath);
  }
}

function isAllowed(group: RobotsRule | null, target: string): { allowed: boolean; reason: string } {
  if (!group) return { allowed: true, reason: 'No matching rule. Default allow.' };
  let bestMatch: { type: 'allow' | 'disallow'; path: string } | null = null;
  for (const rule of group.rules) {
    if (rule.path === '' && rule.type === 'disallow') continue; // empty disallow = allow all
    if (pathMatches(rule.path, target)) {
      if (!bestMatch || rule.path.length > bestMatch.path.length) {
        bestMatch = rule;
      }
    }
  }
  if (!bestMatch) {
    const hasEmptyDisallow = group.rules.some((r) => r.type === 'disallow' && r.path === '');
    if (hasEmptyDisallow) return { allowed: true, reason: 'Disallow: (empty) - explicitly allows all.' };
    return { allowed: true, reason: 'No matching rule for this path. Default allow.' };
  }
  if (bestMatch.type === 'allow') {
    return { allowed: true, reason: `Allow: ${bestMatch.path}` };
  }
  return { allowed: false, reason: `Disallow: ${bestMatch.path}` };
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed, retryAfter } = await rateLimit(`ai-crawler-check:${ip}`, 60 * 60 * 1000, 30);
    if (!allowed) return rateLimitResponse(retryAfter);

    const body = await req.json().catch(() => ({}));
    const rawUrl = typeof body?.url === 'string' ? body.url : '';
    if (!rawUrl || rawUrl.length > 2000) {
      return Response.json({ error: 'URL is required (max 2000 chars).' }, { status: 400 });
    }

    let normalized = rawUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      return Response.json({ error: 'Invalid URL.' }, { status: 400 });
    }

    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
    let robotsText = '';
    let robotsStatus = 0;
    let robotsExists = false;

    try {
      const res = await safeFetch(robotsUrl, { timeoutMs: 8_000, maxBytes: 1 * 1024 * 1024 });
      robotsStatus = res.status;
      if (res.ok) {
        robotsText = await res.text();
        robotsExists = true;
      }
    } catch (err) {
      if (err instanceof SSRFError) {
        return Response.json({ error: 'That URL is not reachable from our servers.' }, { status: 400 });
      }
    }

    const groups = robotsExists ? parseRobotsTxt(robotsText) : [];
    const target = parsed.pathname + parsed.search;

    const results = AI_CRAWLERS.map((bot) => {
      const group = findGroupForUserAgent(groups, bot.name);
      const verdict = robotsExists ? isAllowed(group, target) : { allowed: true, reason: 'No robots.txt found. Default allow.' };
      return {
        name: bot.name,
        vendor: bot.vendor,
        purpose: bot.purpose,
        allowed: verdict.allowed,
        reason: verdict.reason,
        matchedUserAgent: group?.userAgents[0] || null,
      };
    });

    return Response.json({
      url: parsed.toString(),
      robotsUrl,
      robotsExists,
      robotsStatus,
      results,
    });
  } catch (error) {
    logError('tools.ai_crawler_checker.failed', error);
    return serverError({ message: 'Failed to check crawler access. Please try again.' });
  }
}
