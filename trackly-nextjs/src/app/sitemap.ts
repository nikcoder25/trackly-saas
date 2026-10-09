import type { MetadataRoute } from 'next';
import { blogPosts } from '@/data/blog-posts';
import { getAllCategorySlugs } from '@/data/best-categories';
import { getAllAlternativeSlugs } from '@/data/alternatives';
import { getAllRankTrackerSlugs } from '@/data/rank-trackers';
import { AUTHORS } from '@/data/authors';
import { getAllVsSlugs } from '@/data/vs-comparisons';

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
  //
  // No <lastmod> on these or on the static pages below: the previous
  // hard-coded dates were months behind the real edits, and an inaccurate
  // lastmod makes crawlers ignore the field for the whole sitemap. Blog posts
  // carry their real publish date.
  // Glossary term pages and case studies are noindex (thin templated
  // definitions; illustrative, not real, customer stories), so they are
  // deliberately left out of the sitemap. Only the /glossary hub is listed.
  const bestEntries: MetadataRoute.Sitemap = getAllCategorySlugs().map((slug) => ({
    url: `${BASE_URL}/best/${slug}-chatgpt-recommends`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));
  // Competitor "alternative" landing pages (commercial-intent programmatic SEO).
  const alternativeEntries: MetadataRoute.Sitemap = getAllAlternativeSlugs().map((slug) => ({
    url: `${BASE_URL}/${slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));
  // Data-driven /vs/ comparison pages (the newer cohort). The five bespoke
  // vs pages are listed inline below; these are generated from the data module.
  const vsDataEntries: MetadataRoute.Sitemap = getAllVsSlugs().map((slug) => ({
    url: `${BASE_URL}/vs/${slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));
  // Author bio pages - the identity target every article byline links to.
  const authorEntries: MetadataRoute.Sitemap = Object.keys(AUTHORS).map((slug) => ({
    url: `${BASE_URL}/author/${slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));
  // AI rank-tracker cluster pages (high-volume programmatic SEO).
  const rankTrackerEntries: MetadataRoute.Sitemap = getAllRankTrackerSlugs().map((slug) => ({
    url: `${BASE_URL}/${slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  return [
    // Core pages - highest priority
    { url: `${BASE_URL}/`, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/pricing`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/geo-audit`, changeFrequency: 'monthly', priority: 0.9 },

    // Free tools hub + individual tools
    { url: `${BASE_URL}/tools`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/tools/llms-txt-generator`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/tools/ai-crawler-checker`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/tools/chatgpt-mention-checker`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/tools/share-of-voice-calculator`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/tools/geo-score-checker`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/tools/ai-readiness-audit`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/tools/prompt-generator`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/tools/citation-finder`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/tools/competitor-finder`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/tools/nap-verification`, changeFrequency: 'monthly', priority: 0.7 },

    // Product & feature pages
    { url: `${BASE_URL}/how-it-works`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/use-cases`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/integrations`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/integrations/api`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/integrations/slack`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/integrations/zapier`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/integrations/wordpress`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/geo-optimization`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/generative-engine-optimization-tool`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/docs`, changeFrequency: 'monthly', priority: 0.6 },

    // Learn hub & pillar guides
    { url: `${BASE_URL}/learn`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/learn/llm-seo`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/learn/ai-search-optimization`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/learn/ai-overviews-optimization`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/learn/ai-visibility-score`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/learn/brand-visibility-in-llms`, changeFrequency: 'monthly', priority: 0.7 },

    // New BOFU pages for the local SEO agency positioning.
    // (Engine rank-tracker pages come from rankTrackerEntries below; the old
    // /x-brand-tracking pages 301 to them.)
    { url: `${BASE_URL}/uses`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/uses/ai-visibility-for-local-businesses`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/uses/ai-visibility-report-for-agencies`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/uses/ai-visibility-for-hvac-companies`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/uses/ai-visibility-for-plumbers`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/uses/ai-visibility-for-roofers`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/uses/ai-visibility-for-dentists`, changeFrequency: 'monthly', priority: 0.8 },

    // Comparison pages
    { url: `${BASE_URL}/vs/semrush`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/vs/ahrefs`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/vs/otterly`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/vs/profound`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/vs/peec-ai`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/best-ai-search-optimization-tools`, changeFrequency: 'monthly', priority: 0.8 },

    // Content pages
    { url: `${BASE_URL}/blog`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/changelog`, changeFrequency: 'monthly', priority: 0.5 },
    // NOTE: /offer is deliberately NOT listed here. It is the redemption
    // landing page for the AI-channel offer, reachable only via the link
    // published in /llms.txt and /ai-offer.json - the same way a podcast or
    // affiliate code has a landing page that is not part of site navigation.
    // Adding it to the sitemap would put it in search results and defeat the
    // point. See src/lib/promo-offer.ts.
    { url: `${BASE_URL}/glossary`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/best`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/resources`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/resources/ai-visibility-report-template`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/ai-search-statistics-2026`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/research/state-of-ai-search`, changeFrequency: 'weekly', priority: 0.8 },

    // Company pages
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/contact`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/partners`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/solutions/agencies`, changeFrequency: 'monthly', priority: 0.7 },

    // Legal (low priority but needed for trust)
    { url: `${BASE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/cookies`, changeFrequency: 'yearly', priority: 0.3 },

    // Blog posts
    ...blogEntries,

    // Programmatic SEO sections
    ...bestEntries,
    ...alternativeEntries,
    ...rankTrackerEntries,
    ...vsDataEntries,
    ...authorEntries,
  ];
}
