import type { MetadataRoute } from 'next';
import { blogPosts } from '@/data/blog-posts';

const BASE_URL = process.env.APP_URL || 'https://livesov.com';

export default function sitemap(): MetadataRoute.Sitemap {
  // Generate blog post entries dynamically
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map(post => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [
    // Core pages - highest priority
    { url: `${BASE_URL}/`, lastModified: new Date('2026-04-01'), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/pricing`, lastModified: new Date('2026-04-01'), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/geo-audit`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.9 },

    // Product & feature pages
    { url: `${BASE_URL}/how-it-works`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/use-cases`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/integrations`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/geo-optimization`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },

    // Platform-specific tracking pages (programmatic SEO)
    { url: `${BASE_URL}/chatgpt-brand-tracking`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/perplexity-brand-tracking`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/gemini-brand-tracking`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/claude-brand-tracking`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/grok-brand-tracking`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },

    // Comparison pages
    { url: `${BASE_URL}/vs/semrush`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/vs/ahrefs`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.7 },

    // Content pages
    { url: `${BASE_URL}/blog`, lastModified: new Date('2026-04-01'), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/changelog`, lastModified: new Date('2026-04-01'), changeFrequency: 'weekly', priority: 0.5 },

    // Company pages
    { url: `${BASE_URL}/about`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/partners`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.6 },

    // Legal (low priority but needed for trust)
    { url: `${BASE_URL}/privacy`, lastModified: new Date('2026-04-01'), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: new Date('2026-04-01'), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/cookies`, lastModified: new Date('2026-04-01'), changeFrequency: 'yearly', priority: 0.3 },

    // Blog posts
    ...blogEntries,
  ];
}
