import type { MetadataRoute } from 'next';

const BASE_URL = process.env.APP_URL || 'https://livesov.com';

const DISALLOW = [
  '/dashboard/',
  '/admin-backend/',
  '/api/',
  '/login',
  '/signup',
  '/reset-password',
  // NOTE: /home is deliberately NOT disallowed. It is a permanent 301 to /
  // (see the redirects block in next.config.ts). Blocking it in robots.txt
  // stopped crawlers from ever fetching the URL, so they never saw the 301 -
  // Search Console kept serving /home as a URL-only result (216 impressions,
  // no title, no snippet) instead of consolidating it into /. Letting them
  // crawl it is what makes the redirect do its job.
  '/cdn-cgi/',   // Cloudflare internal paths (email-protection links 404 for crawlers)
];

// The crawlers behind the assistants we care about being cited by. They are
// already covered by the wildcard rule, but naming them makes the intent
// explicit: a future tightening of the `*` rule should be a deliberate
// decision about these agents, not an accident.
const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',      // OpenAI
  'ClaudeBot', 'Claude-Web', 'anthropic-ai',      // Anthropic
  'PerplexityBot', 'Perplexity-User',             // Perplexity
  'Google-Extended',                              // Gemini grounding
  'Applebot-Extended',
  'CCBot',                                        // Common Crawl
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      {
        userAgent: AI_CRAWLERS,
        // /offer is the redemption page for the offer published in
        // /llms.txt. It is intentionally absent from the sitemap and unlinked
        // from the site, so an allow entry is what tells these crawlers it is
        // fair game to fetch and cite once they follow the manifest link.
        allow: ['/', '/llms.txt', '/ai-offer.json', '/offer'],
        disallow: DISALLOW,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
