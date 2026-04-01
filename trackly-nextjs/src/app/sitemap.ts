import type { MetadataRoute } from 'next';

const BASE_URL = process.env.APP_URL || 'https://livesov.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    '/',
    '/pricing',
    '/about',
    '/contact',
    '/how-it-works',
    '/use-cases',
    '/integrations',
    '/blog',
    '/changelog',
    '/chatgpt-brand-tracking',
    '/perplexity-brand-tracking',
    '/gemini-brand-tracking',
    '/claude-brand-tracking',
    '/grok-brand-tracking',
    '/geo-optimization',
    '/vs/semrush',
    '/vs/ahrefs',
    '/partners',
    '/privacy',
    '/terms',
    '/cookies',
    '/home',
    '/free-check',
  ];

  return pages.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date('2026-04-01'),
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path === '/pricing' ? 0.9 : 0.7,
  }));
}
