import { describe, it, expect } from 'vitest';
import sitemap from '@/app/sitemap';
import { blogPosts } from '@/data/blog-posts';
import { getAllTermSlugs } from '@/data/glossary';
import { getAllCategorySlugs } from '@/data/best-categories';
import { getAllCaseStudySlugs } from '@/data/case-studies';

// Regression test for sitemap coverage: the sitemap used to be a hardcoded
// list that silently fell out of sync as sections shipped (~45 live pages
// missing). Programmatic sections must be generated from the same data
// modules the pages render from.

const urls = new Set(sitemap().map((e) => new URL(e.url).pathname));

describe('sitemap.xml coverage', () => {
  it('contains every blog post', () => {
    for (const post of blogPosts) {
      expect(urls, `/blog/${post.slug} missing from sitemap`).toContain(`/blog/${post.slug}`);
    }
  });

  it('contains every glossary term plus the hub', () => {
    expect(urls).toContain('/glossary');
    for (const term of getAllTermSlugs()) {
      expect(urls, `/glossary/${term} missing from sitemap`).toContain(`/glossary/${term}`);
    }
  });

  it('contains every best-of category plus the hub', () => {
    expect(urls).toContain('/best');
    for (const slug of getAllCategorySlugs()) {
      const path = `/best/${slug}-chatgpt-recommends`;
      expect(urls, `${path} missing from sitemap`).toContain(path);
    }
  });

  it('contains every case study plus the hub', () => {
    expect(urls).toContain('/case-studies');
    for (const brand of getAllCaseStudySlugs()) {
      expect(urls, `/case-studies/${brand} missing from sitemap`).toContain(`/case-studies/${brand}`);
    }
  });

  it('contains the standalone pages that were previously missing', () => {
    for (const path of [
      '/docs',
      '/resources',
      '/resources/ai-visibility-report-template',
      '/integrations/api',
      '/integrations/slack',
      '/integrations/zapier',
      '/ai-search-statistics-2026',
    ]) {
      expect(urls, `${path} missing from sitemap`).toContain(path);
    }
  });

  it('has no duplicate URLs', () => {
    const all = sitemap().map((e) => e.url);
    expect(new Set(all).size).toBe(all.length);
  });
});
