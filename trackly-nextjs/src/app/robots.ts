import type { MetadataRoute } from 'next';

const BASE_URL = process.env.APP_URL || 'https://livesov.com';

const DISALLOW = [
  '/dashboard/',
  '/admin-backend/',
  '/api/',
  '/login',
  '/signup',
  '/reset-password',
  '/home',       // duplicate of /, prevent indexing
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
