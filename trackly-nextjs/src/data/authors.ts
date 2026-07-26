// ─────────────────────────────────────────────────────────────────────────────
// Named authors.
//
// Every article on the site carries a real, named human byline that links to a
// bio page. This replaced the previous "Livesov Team" byline: an anonymous
// corporate byline gives a reader no way to judge who is behind a claim, and
// review/comparison content is exactly where that judgement matters most.
//
// The bio must stay truthful and specific. "AI Visibility Experts" was the old
// role string and it is precisely the kind of unfalsifiable self-award that
// earns no trust - state what the person actually built and does instead.
// ─────────────────────────────────────────────────────────────────────────────

export interface Author {
  /** URL slug -> /author/{slug} */
  slug: string;
  /** Display name used in the byline. */
  name: string;
  /** Short role line shown under the name. */
  role: string;
  /** Fallback monogram, used anywhere the portrait is not rendered. */
  initials: string;
  /**
   * Portrait shown next to the byline and on the bio page.
   *
   * TO SWAP IN THE REAL HEADSHOT: drop the photo at
   * `public/authors/nik.jpg` and change this to '/authors/nik.jpg'. Nothing
   * else needs to change - every byline and the Person schema read this field.
   * The committed SVG monogram is a deliberate placeholder so no page ships
   * with a broken image while the photo is pending.
   */
  avatar: string;
  /** Alt text for the portrait. */
  avatarAlt: string;
  /** One-sentence summary used in Person schema and article bylines. */
  summary: string;
  /** Full bio paragraphs for the author page and the end-of-article box. */
  bio: string[];
  /** Concrete, checkable credentials. No unfalsifiable self-awards. */
  credentials: string[];
  /** Profiles used for schema.org sameAs identity resolution. */
  sameAs: string[];
  /** Public contact address. */
  email?: string;
}

export const NIK: Author = {
  slug: 'nik',
  name: 'Nik',
  role: 'Founder, Livesov',
  initials: 'N',
  avatar: '/authors/nik.svg',
  avatarAlt: 'Nik, founder of Livesov',
  summary:
    'Nik is the founder of Livesov, an AI visibility tracker that measures how ChatGPT, Claude, Gemini, Perplexity, and Grok mention, rank, and cite brands.',
  bio: [
    'Nik is the founder of Livesov. He built the product after running into the same problem repeatedly on client work: rankings looked healthy in Google, but buyers were arriving having already asked an AI assistant which tool to use - and there was no way to see what those assistants were saying.',
    'Livesov now runs buyer-intent prompts against ChatGPT, Claude, Gemini, Perplexity, and Grok on a schedule, stores the full response as evidence, captures the ranked citation list where the engine exposes one, and flags answers that contradict a brand\'s verified facts. Every comparison and pricing claim published on this site is one he can reproduce inside the product.',
    'He writes here about AI search, generative engine optimization, and the measurement problems that come with both - including the parts the category tends to oversell.',
  ],
  credentials: [
    'Founder and builder of Livesov, an AI visibility tracker covering five LLMs',
    'Works hands-on in the product daily - every Livesov capability cited in these articles is reproducible on a free trial',
    'Publishes the methodology behind every competitor comparison, including where rivals are the better choice',
  ],
  sameAs: [
    'https://twitter.com/livesov',
    'https://linkedin.com/company/livesov',
  ],
  email: 'hello@livesov.com',
};

export const AUTHORS: Record<string, Author> = {
  nik: NIK,
};

export const DEFAULT_AUTHOR = NIK;

export function getAuthor(slug: string): Author | undefined {
  return AUTHORS[slug];
}

/** schema.org Person node for an author, used by article and bio pages. */
export function authorPersonSchema(a: Author): Record<string, unknown> {
  return {
    '@type': 'Person',
    '@id': `https://livesov.com/author/${a.slug}#person`,
    name: a.name,
    url: `https://livesov.com/author/${a.slug}`,
    image: `https://livesov.com${a.avatar}`,
    jobTitle: a.role,
    description: a.summary,
    knowsAbout: [
      'Generative engine optimization',
      'AI search visibility',
      'Answer engine optimization',
      'Large language model brand monitoring',
    ],
    worksFor: {
      '@type': 'Organization',
      name: 'Livesov',
      url: 'https://livesov.com',
    },
    sameAs: a.sameAs,
  };
}
