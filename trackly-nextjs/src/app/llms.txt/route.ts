import { NextResponse } from 'next/server';
import { GEO_AUDIT_PLATFORMS } from '@/lib/geo-audits';

// llms.txt - discovery file for AI crawlers per https://llmstxt.org/
// Factual product description; per-plan limits intentionally omitted
// to prevent drift between this file and the live /pricing page.

const BASE_URL = process.env.APP_URL || 'https://livesov.com';

// Vendor names for each canonical platform. The Record key type is
// pinned to `GEO_AUDIT_PLATFORMS` so adding / renaming / removing a
// platform in src/lib/geo-audits.ts is a compile error here until
// VENDORS and DISPLAY_ORDER are updated to match.
const VENDORS: Record<typeof GEO_AUDIT_PLATFORMS[number], string> = {
  ChatGPT: 'OpenAI',
  Claude: 'Anthropic',
  Perplexity: 'Perplexity AI',
  Gemini: 'Google',
  Grok: 'xAI',
};

// Marketing-conventional display order. The source-of-truth set
// (GEO_AUDIT_PLATFORMS) uses a different internal order which is
// invisible to users / crawlers. See finding #17 (open).
const DISPLAY_ORDER: ReadonlyArray<typeof GEO_AUDIT_PLATFORMS[number]> = [
  'ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok',
];

const BODY = [
  '# Livesov',
  '',
  '> AI brand-visibility tracking across ChatGPT, Claude, Perplexity, Gemini, and Grok. Monitor share-of-voice, run GEO audits, and surface optimization recommendations from a single dashboard.',
  '',
  '## What it is',
  '',
  'Livesov is a SaaS platform that tracks how generative AI assistants reference brands. It runs scheduled prompts against five AI platforms, records mentions, computes share-of-voice against competitors, and produces GEO (generative engine optimization) audits with prioritized recommendations.',
  '',
  "## Who it's for",
  '',
  'Marketing teams, agencies, and in-house growth teams that need to monitor and improve brand visibility in AI-generated answers as user discovery shifts from traditional search to AI assistants.',
  '',
  '## AI platforms tracked',
  '',
  'All five platforms are queried for every tracked prompt and every GEO audit, regardless of plan tier.',
  '',
  ...DISPLAY_ORDER.map(name => `- ${name} (${VENDORS[name]})`),
  '',
  '## Pricing tiers',
  '',
  '- Free',
  '- Starter',
  '- Pro',
  '- Agency',
  '',
  'Per-plan limits (credits, brands, audits) are not listed here to prevent drift between this document and the live pricing page. See /pricing for current details.',
  '',
  '## Key URLs',
  '',
  `- ${BASE_URL}/ - Homepage`,
  `- ${BASE_URL}/pricing - Pricing`,
  `- ${BASE_URL}/how-it-works - How it works`,
  `- ${BASE_URL}/blog - Blog`,
  `- ${BASE_URL}/tools - Free tools hub`,
  `- ${BASE_URL}/geo-audit - Free GEO audit tool`,
  '',
].join('\n');

export const dynamic = 'force-static';
export const revalidate = 86400;

export async function GET() {
  return new NextResponse(BODY, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, must-revalidate',
    },
  });
}
