import type { MetadataRoute } from 'next';
import { blogPosts } from '@/data/blog-posts';
import { getAllTermSlugs } from '@/data/glossary';
import { getAllCategorySlugs } from '@/data/best-categories';
import { getAllCaseStudySlugs } from '@/data/case-studies';
import { getAllAlternativeSlugs } from '@/data/alternatives';
import { getAllRankTrackerSlugs } from '@/data/rank-trackers';

const BASE_URL = process.env.APP_URL || 'https://livesov.com';

export default function sitemap(): MetadataRoute.Sitemap {
  // Generate blog post entries dynamically
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map(post => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  // Programmatic SEO sections - generated from the same data modules the
  // pages render from, so new entries can never be missing from the sitemap.
  const glossaryEntries: MetadataRoute.Sitemap = getAllTermSlugs().map((term) => ({
    url: `${BASE_URL}/glossary/${term}`,
    lastModified: new Date('2026-06-01'),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));
  const bestEntries: MetadataRoute.Sitemap = getAllCategorySlugs().map((slug) => ({
    url: `${BASE_URL}/best/${slug}-chatgpt-recommends`,
    lastModified: new Date('2026-06-01'),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));
  const caseStudyEntries: MetadataRoute.Sitemap = getAllCaseStudySlugs().map((brand) => ({
    url: `${BASE_URL}/case-studies/${brand}`,
    lastModified: new Date('2026-06-01'),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));
  // Competitor "alternative" landing pages (commercial-intent programmatic SEO).
  const alternativeEntries: MetadataRoute.Sitemap = getAllAlternativeSlugs().map((slug) => ({
    url: `${BASE_URL}/${slug}`,
    lastModified: new Date('2026-07-17'),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));
  // AI rank-tracker cluster pages (high-volume programmatic SEO).
  const rankTrackerEntries: MetadataRoute.Sitemap = getAllRankTrackerSlugs().map((slug) => ({
    url: `${BASE_URL}/${slug}`,
    lastModified: new Date('2026-07-17'),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  return [
    // Core pages - highest priority
    { url: `${BASE_URL}/`, lastModified: new Date('2026-04-01'), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/pricing`, lastModified: new Date('2026-04-01'), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/geo-audit`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.9 },

    // Free tools hub + individual tools
    { url: `${BASE_URL}/tools`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/tools/llms-txt-generator`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/tools/ai-crawler-checker`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/tools/chatgpt-mention-checker`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/tools/share-of-voice-calculator`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/tools/geo-score-checker`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/tools/ai-readiness-audit`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/tools/prompt-generator`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/tools/citation-finder`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/tools/competitor-finder`, lastModified: new Date('2026-05-01'), changeFrequency: 'monthly', priority: 0.7 },

    // Product & feature pages
    { url: `${BASE_URL}/how-it-works`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/use-cases`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/integrations`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/integrations/api`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/integrations/slack`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/integrations/zapier`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/geo-optimization`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/generative-engine-optimization-tool`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/docs`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.6 },

    // Learn hub & pillar guides
    { url: `${BASE_URL}/learn`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/learn/llm-seo`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/learn/ai-search-optimization`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/learn/ai-overviews-optimization`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/learn/ai-visibility-score`, lastModified: new Date('2026-06-15'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/learn/brand-visibility-in-llms`, lastModified: new Date('2026-06-15'), changeFrequency: 'monthly', priority: 0.7 },

    // Platform-specific tracking pages (programmatic SEO)
    { url: `${BASE_URL}/chatgpt-brand-tracking`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/perplexity-brand-tracking`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/gemini-brand-tracking`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/claude-brand-tracking`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/grok-brand-tracking`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.8 },

    // Comparison pages
    { url: `${BASE_URL}/vs/semrush`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/vs/ahrefs`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/vs/otterly`, lastModified: new Date('2026-06-10'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/vs/profound`, lastModified: new Date('2026-06-10'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/vs/peec-ai`, lastModified: new Date('2026-06-10'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/best-ai-search-optimization-tools`, lastModified: new Date('2026-06-15'), changeFrequency: 'monthly', priority: 0.8 },

    // Content pages
    { url: `${BASE_URL}/blog`, lastModified: new Date('2026-04-01'), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/changelog`, lastModified: new Date('2026-04-01'), changeFrequency: 'weekly', priority: 0.5 },
    { url: `${BASE_URL}/glossary`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/best`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/case-studies`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/resources`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/resources/ai-visibility-report-template`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/ai-search-statistics-2026`, lastModified: new Date('2026-06-01'), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/research/state-of-ai-search`, lastModified: new Date('2026-06-10'), changeFrequency: 'weekly', priority: 0.8 },

    // Company pages
    { url: `${BASE_URL}/about`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/contact`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/partners`, lastModified: new Date('2026-04-01'), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/solutions/agencies`, lastModified: new Date('2026-06-15'), changeFrequency: 'monthly', priority: 0.7 },

    // Legal (low priority but needed for trust)
    { url: `${BASE_URL}/privacy`, lastModified: new Date('2026-04-01'), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: new Date('2026-04-01'), changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/cookies`, lastModified: new Date('2026-04-01'), changeFrequency: 'yearly', priority: 0.3 },

    // Blog posts
    ...blogEntries,

    // Programmatic SEO sections (glossary terms, best-of lists, case studies)
    ...glossaryEntries,
    ...bestEntries,
    ...caseStudyEntries,
    ...alternativeEntries,
    ...rankTrackerEntries,
  ];
}
