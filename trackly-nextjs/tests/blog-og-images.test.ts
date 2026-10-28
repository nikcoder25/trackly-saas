import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { blogPosts, ogImageFor } from '@/data/blog-posts';

/**
 * Blog covers are authored as SVG. Every major social platform - X, LinkedIn,
 * Facebook, Slack, iMessage - refuses to render SVG in a link preview, so an
 * SVG og:image ships every share as a bare text card with no image at all.
 *
 * scripts/build-blog-og-images.mjs rasterises each 1200x630 cover to a PNG
 * beside it and ogImageFor() points the metadata at that file. These tests are
 * what stops a new post shipping with a preview nobody notices is broken,
 * because the failure is invisible from the site itself.
 */

const PUBLIC = join(process.cwd(), 'public');

describe('blog social preview images', () => {
  it('has posts to check', () => {
    expect(blogPosts.length).toBeGreaterThan(0);
  });

  for (const post of blogPosts) {
    describe(post.slug, () => {
      it('ships the on-page cover', () => {
        expect(existsSync(join(PUBLIC, post.image)), `missing ${post.image}`).toBe(true);
      });

      it('ships a rasterised PNG for link previews', () => {
        const png = post.image.replace(/\.svg$/i, '.png');
        expect(
          existsSync(join(PUBLIC, png)),
          `missing ${png} - run: node scripts/build-blog-og-images.mjs`,
        ).toBe(true);
      });

      it('points og:image at an absolute PNG url', () => {
        const url = ogImageFor(post);
        expect(url.startsWith('https://livesov.com/blog/')).toBe(true);
        expect(url.endsWith('.png')).toBe(true);
      });

      it('has a non-empty PNG', () => {
        const png = join(PUBLIC, post.image.replace(/\.svg$/i, '.png'));
        if (!existsSync(png)) return; // already reported above
        expect(statSync(png).size).toBeGreaterThan(1000);
      });
    });
  }
});

describe('in-body article figures', () => {
  // Every ![alt](/blog/x.svg) in an article renders as a <figure> with the alt
  // as its caption. A missing file is a silent broken image on a live page.
  const FIGURE = /!\[([^\]]*)\]\((\/blog\/[^)]+)\)/g;

  it('references only files that exist, each with alt text', () => {
    const problems: string[] = [];
    for (const post of blogPosts) {
      for (const [, alt, src] of post.content.matchAll(FIGURE)) {
        if (!existsSync(join(PUBLIC, src))) problems.push(`${post.slug}: missing ${src}`);
        if (alt.trim().length < 10) problems.push(`${post.slug}: ${src} needs real alt text`);
      }
    }
    expect(problems).toEqual([]);
  });
});
