import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { blogPosts } from '@/data/blog-posts';
import { AUTHORS, NIK, authorPersonSchema } from '@/data/authors';
import sitemap from '@/app/sitemap';

// Ranking review/comparison content is judged partly on whether a real,
// identifiable person stands behind it. Every article used to be bylined
// "Livesov Team" - an anonymous corporate byline the reader cannot check.
// These tests pin the replacement so it cannot regress.

describe('every article carries a named human byline', () => {
  it('has articles to check', () => {
    expect(blogPosts.length).toBeGreaterThan(0);
  });

  for (const post of blogPosts) {
    describe(post.slug, () => {
      it('is not bylined to a faceless team account', () => {
        expect(post.author.name).not.toMatch(/team/i);
        expect(post.author.role).not.toMatch(/team/i);
      });

      it('resolves to a real author entry', () => {
        expect(AUTHORS[post.author.slug]).toBeDefined();
        expect(AUTHORS[post.author.slug].name).toBe(post.author.name);
      });

      it('has a portrait, a bio, and credentials', () => {
        expect(post.author.avatar).toMatch(/^\/authors\//);
        expect(post.author.avatarAlt.length).toBeGreaterThan(5);
        expect(post.author.bio.length).toBeGreaterThan(0);
        expect(post.author.credentials.length).toBeGreaterThan(0);
      });
    });
  }

  it('no blog data still references the old byline', () => {
    const src = readFileSync(join(process.cwd(), 'src/data/blog-posts.ts'), 'utf8');
    expect(src).not.toMatch(/Livesov Team/);
  });
});

describe('author record', () => {
  it('uses the name Nik', () => {
    expect(NIK.name).toBe('Nik');
    expect(NIK.slug).toBe('nik');
  });

  it('avoids unfalsifiable self-awards in the role line', () => {
    // "AI Visibility Experts" was the old role string. A role should say what
    // the person does, not award them a title no reader can verify.
    expect(NIK.role).not.toMatch(/expert/i);
    expect(NIK.role).not.toMatch(/guru|ninja|rockstar/i);
  });

  it('ships a portrait file that actually exists on disk', () => {
    // A byline photo that 404s is worse than no photo. Whether the avatar is
    // still the committed placeholder or the real headshot, the file must
    // resolve under public/.
    const abs = join(process.cwd(), 'public', NIK.avatar.replace(/^\//, ''));
    expect(existsSync(abs), `${NIK.avatar} missing from public/`).toBe(true);
  });

  it('has a bio substantial enough to be worth reading', () => {
    expect(NIK.bio.join(' ').length).toBeGreaterThan(200);
  });
});

describe('Person schema', () => {
  const schema = authorPersonSchema(NIK) as Record<string, unknown>;

  it('is a Person with a stable @id and a resolvable url', () => {
    expect(schema['@type']).toBe('Person');
    expect(schema['@id']).toBe('https://livesov.com/author/nik#person');
    expect(schema.url).toBe('https://livesov.com/author/nik');
  });

  it('carries an absolute image URL', () => {
    expect(String(schema.image)).toMatch(/^https:\/\/livesov\.com\/authors\//);
  });

  it('includes sameAs profiles for identity resolution', () => {
    expect(Array.isArray(schema.sameAs)).toBe(true);
    expect((schema.sameAs as string[]).length).toBeGreaterThan(0);
  });
});

describe('author page is discoverable', () => {
  const urls = new Set(sitemap().map((e) => new URL(e.url).pathname));

  it('lists every author bio page in the sitemap', () => {
    for (const slug of Object.keys(AUTHORS)) {
      expect(urls, `/author/${slug} missing from sitemap`).toContain(`/author/${slug}`);
    }
  });

  it('links the byline to the author page from the article template', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/(public)/blog/[slug]/page.tsx'),
      'utf8',
    );
    expect(src).toMatch(/\/author\/\$\{post\.author\.slug\}|author\/\$\{post\.author\.slug\}/);
    // and renders the portrait rather than a monogram
    expect(src).toMatch(/post\.author\.avatar/);
  });
});
