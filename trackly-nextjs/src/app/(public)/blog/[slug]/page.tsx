import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import SeoLayout from '@/components/seo/SeoLayout';
import { escapeHtml } from '@/lib/sanitize';
import { blogPosts, getPostBySlug, formatDate, ogImageFor } from '@/data/blog-posts';
import { authorPersonSchema } from '@/data/authors';

export async function generateStaticParams() {
  return blogPosts.map(post => ({ slug: post.slug }));
}

// Slugs are a closed set from the data module; reject unknown ones at the
// router level too. NOTE: the load-bearing soft-404 fix was removing the
// (public)/loading.tsx Suspense boundary - with it present, the 200 shell
// streamed before any notFound() could set a real 404 status.
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  // Guard in generateMetadata as well as the page body: if a Suspense
  // boundary (e.g. a route-group loading.tsx) is ever reintroduced above
  // this page, a body-only notFound() would stream a 200 shell (soft-404).
  if (!post) notFound();

  // Link previews get the rasterised PNG, not the on-page SVG: no major social
  // platform renders SVG in a card, so an SVG here ships every share as plain
  // text. See ogImageFor() in the data module.
  const ogImage = ogImageFor(post);

  return {
    title: `${post.title} | Livesov Blog`,
    description: post.description,
    keywords: [post.tag, 'AI visibility', 'brand tracking', 'GEO', 'AI SEO', 'Livesov'],
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author.name],
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [ogImage],
    },
    alternates: { canonical: `/blog/${post.slug}` },
  };
}

/* Heading slug used both by renderContent and the table of contents, so a
   TOC link can never point at an id the body did not emit. */
const headingId = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/* Pull the H2s out of the article body for the on-page table of contents.
   Code fences are skipped so a "## " inside a snippet never becomes a link. */
function extractHeadings(content: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  let inCode = false;
  for (const line of content.trim().split('\n')) {
    if (line.trim().startsWith('```')) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (line.startsWith('## ')) {
      const text = line.slice(3).trim();
      out.push({ id: headingId(text), text });
    }
  }
  return out;
}

/* Simple markdown-ish renderer */
function renderContent(content: string) {
  const lines = content.trim().split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let inTable = false;
  let tableRows: string[][] = [];
  let inCode = false;
  let codeLines: string[] = [];

  // Only let http(s) and site-relative URLs through, and re-escape the URL
  // before embedding it in an href attribute so a rogue URL can't break out
  // of the attribute and inject onclick/onerror.
  const sanitizeUrl = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return '#';
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/')) return '#';
    // Reject URLs containing attribute-breaking chars even after escaping
    if (/[\s"'<>`]/.test(trimmed)) return '#';
    return escapeHtml(trimmed);
  };
  const parseInline = (text: string) => {
    // Escape HTML first, then apply markdown formatting
    return escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        return `<a href="${sanitizeUrl(url)}" class="blog-link">${label}</a>`;
      })
      .replace(/`([^`]+)`/g, '<code class="blog-code">$1</code>');
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCode) {
        elements.push(<pre key={i} className="blog-pre"><code>{codeLines.join('\n')}</code></pre>);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      i++;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      i++;
      continue;
    }

    // Table
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (!inTable) { inTable = true; tableRows = []; }
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
      if (!cells.every(c => /^[-:]+$/.test(c))) {
        tableRows.push(cells);
      }
      i++;
      // Check if next line is not a table
      if (i >= lines.length || !lines[i].trim().startsWith('|')) {
        inTable = false;
        const [header, ...body] = tableRows;
        elements.push(
          <div key={`table-${i}`} className="blog-table-wrap">
            <table className="blog-table">
              <thead><tr>{header.map((h, j) => <th key={j} dangerouslySetInnerHTML={{ __html: parseInline(h) }} />)}</tr></thead>
              <tbody>{body.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} dangerouslySetInnerHTML={{ __html: parseInline(cell) }} />)}</tr>)}</tbody>
            </table>
          </div>
        );
        tableRows = [];
      }
      continue;
    }

    // Empty line
    if (!line.trim()) { i++; continue; }

    // Standalone figure: ![alt text](/blog/diagram.svg)
    // Only a line that is ENTIRELY an image becomes a figure; an inline image
    // inside a sentence falls through to the paragraph branch untouched.
    const figure = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (figure) {
      const [, alt, src] = figure;
      const safeSrc = sanitizeUrl(src);
      if (safeSrc !== '#') {
        elements.push(
          <figure key={i} className="blog-figure">
            <img src={safeSrc} alt={alt} className="blog-figure-img" loading="lazy" decoding="async" />
            {alt ? <figcaption className="blog-figure-cap">{alt}</figcaption> : null}
          </figure>
        );
        i++; continue;
      }
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="blog-h3">{line.slice(4)}</h3>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="blog-h2" id={headingId(line.slice(3).trim())}>{line.slice(3)}</h2>);
      i++; continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(<blockquote key={i} className="blog-quote" dangerouslySetInnerHTML={{ __html: quoteLines.map(parseInline).join('<br/>') }} />);
      continue;
    }

    // List items
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={i} className="blog-ul">
          {items.map((item, j) => <li key={j} dangerouslySetInnerHTML={{ __html: parseInline(item) }} />)}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={i} className="blog-ol">
          {items.map((item, j) => <li key={j} dangerouslySetInnerHTML={{ __html: parseInline(item) }} />)}
        </ol>
      );
      continue;
    }

    // Paragraph
    elements.push(<p key={i} className="blog-p" dangerouslySetInnerHTML={{ __html: parseInline(line) }} />);
    i++;
  }

  return elements;
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const headings = extractHeadings(post.content);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    image: ogImageFor(post),
    datePublished: post.date,
    // A full Person node (not just a name string) so the byline resolves to a
    // real, linkable identity with its own bio page and sameAs profiles.
    author: authorPersonSchema(post.author),
    publisher: { '@type': 'Organization', name: 'Livesov', url: 'https://livesov.com' },
  };

  return (
    <SeoLayout>
      <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="blog-post">
        {/* Header */}
        <header className="blog-post-header">
          <div className="blog-post-header-inner">
            <Link href="/blog" className="blog-back">&larr; Back to Blog</Link>
            <div className="blog-post-meta">
              <span className="blog-post-tag">{post.tag}</span>
              <span className="blog-post-date">{formatDate(post.date)}</span>
              <span className="blog-post-read">{post.readTime}</span>
            </div>
            <h1 className="blog-post-title">{post.title}</h1>
            <p className="blog-post-desc">{post.description}</p>
            <div className="blog-post-author">
              <img
                src={post.author.avatar}
                alt={post.author.avatarAlt}
                className="blog-post-avatar blog-post-avatar-img"
                width={44}
                height={44}
                loading="lazy"
              />
              <div>
                <div className="blog-post-author-name">
                  <Link href={`/author/${post.author.slug}`}>{post.author.name}</Link>
                </div>
                <div className="blog-post-author-role">{post.author.role}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Hero image */}
        <div className="blog-post-image-wrap">
          <img src={post.image} alt={post.imageAlt} className="blog-post-image" />
        </div>

        {/* Content */}
        <div className="blog-post-body">
          {headings.length >= 4 && (
            <nav className="blog-toc" aria-labelledby="toc-heading">
              <p className="blog-toc-title" id="toc-heading">What&rsquo;s in this article</p>
              <ol className="blog-toc-list">
                {headings.map((h) => (
                  <li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>
                ))}
              </ol>
            </nav>
          )}
          {renderContent(post.content)}
        </div>

        {/* Author bio. A named byline is only worth as much as the reader's
            ability to check who it belongs to - so the bio, the credentials,
            and the link to the full author page all sit with the article. */}
        <aside className="blog-author-box" aria-labelledby="about-the-author">
          <img
            src={post.author.avatar}
            alt={post.author.avatarAlt}
            className="blog-author-box-img"
            width={72}
            height={72}
            loading="lazy"
          />
          <div>
            <p className="blog-author-box-eyebrow" id="about-the-author">About the author</p>
            <p className="blog-author-box-name">
              <Link href={`/author/${post.author.slug}`}>{post.author.name}</Link>
              <span className="blog-author-box-role"> &middot; {post.author.role}</span>
            </p>
            <p className="blog-author-box-bio">{post.author.bio[0]}</p>
            <p className="blog-author-box-more">
              <Link href={`/author/${post.author.slug}`}>
                More articles by {post.author.name} &rarr;
              </Link>
            </p>
          </div>
        </aside>

      </article>
    </SeoLayout>
  );
}
