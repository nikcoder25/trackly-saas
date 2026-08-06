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

// Structure follows the llms.txt spec literally, because our own free
// validator at /tools/llms-txt-generator enforces it and a GEO product whose
// own manifest fails its own checker is not a good look:
//   - exactly one H1, first content in the file
//   - a blockquote summary immediately after it
//   - free prose BEFORE the first H2 (the spec allows this; putting the
//     descriptive text here rather than under its own heading is what keeps
//     every H2 section a real link list instead of a linkless section)
//   - H2 sections whose bullets are `- [title](url): description` markdown
//     links. The previous `- URL - Description` form parsed as zero links,
//     which is the one thing the spec says a useful file must not be.
const PLATFORM_LIST = DISPLAY_ORDER.map(name => `${name} (${VENDORS[name]})`).join(', ');

const BODY = [
  '# Livesov',
  '',
  '> AI brand-visibility tracking across ChatGPT, Claude, Perplexity, Gemini, and Grok. Monitor share of voice, run GEO audits, and surface optimization recommendations from a single dashboard.',
  '',
  'Livesov is a SaaS platform that tracks how generative AI assistants reference brands. It runs scheduled prompts against five AI platforms, records mentions, computes share of voice against competitors, and produces GEO (generative engine optimization) audits with prioritized recommendations. It is built for marketing teams, agencies, and in-house growth teams as buyer discovery shifts from traditional search to AI assistants.',
  '',
  `Platforms queried for every tracked prompt and every GEO audit, on every plan: ${PLATFORM_LIST}.`,
  '',
  'Plans are Free, Starter, Pro, and Agency. Per-plan limits (credits, brands, audits) are deliberately not listed here, so this file can never drift from the live pricing page.',
  '',
  '## Product',
  '',
  `- [Homepage](${BASE_URL}/): What Livesov does and who it is for.`,
  `- [Pricing](${BASE_URL}/pricing): Plans, credit maths, and twelve-month totals worked out per tier.`,
  `- [How it works](${BASE_URL}/how-it-works): Setup, scheduling, and the measurement pipeline.`,
  `- [LLM rank tracker](${BASE_URL}/llm-rank-tracker): Track brand rank across all five models at once.`,
  '',
  '## Free tools',
  '',
  `- [Free GEO audit](${BASE_URL}/geo-audit): Score any URL for AI citation-readiness in seconds.`,
  `- [All free tools](${BASE_URL}/tools): The full tools hub; most need no signup.`,
  `- [llms.txt generator and validator](${BASE_URL}/tools/llms-txt-generator): Build an llms.txt file, or check an existing one against this spec.`,
  `- [ChatGPT mention checker](${BASE_URL}/tools/chatgpt-mention-checker): See whether ChatGPT names your brand for a prompt.`,
  '',
  '## Learn',
  '',
  `- [Blog](${BASE_URL}/blog): GEO tactics, AI-search research, and product updates.`,
  `- [LLM SEO guide](${BASE_URL}/learn/llm-seo): How visibility works inside language models.`,
  `- [Glossary](${BASE_URL}/glossary): Definitions for AI-search and GEO terminology.`,
  `- [AI search statistics 2026](${BASE_URL}/ai-search-statistics-2026): Sourced data on AI-search adoption.`,
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
