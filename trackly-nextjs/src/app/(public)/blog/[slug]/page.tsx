import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SeoLayout from '@/components/seo/SeoLayout';
import { blogPosts, getPostBySlug, formatDate } from '@/data/blog-posts';

export async function generateStaticParams() {
  return blogPosts.map(post => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: 'Post Not Found' };

  return {
    title: `${post.title} | Livesov Blog`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author.name],
      images: [{ url: post.image, alt: post.imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
    },
    alternates: { canonical: `/blog/${post.slug}` },
  };
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

  const escHtml = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const parseInline = (text: string) => {
    // Escape HTML first, then apply markdown formatting
    return escHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        const safeUrl = /^https?:\/\//.test(url) || url.startsWith('/') ? url : '#';
        return `<a href="${safeUrl}" class="blog-link">${label}</a>`;
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

    // Headings
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="blog-h3">{line.slice(4)}</h3>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="blog-h2" id={line.slice(3).toLowerCase().replace(/[^a-z0-9]+/g, '-')}>{line.slice(3)}</h2>);
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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    image: post.image,
    datePublished: post.date,
    author: { '@type': 'Person', name: post.author.name },
    publisher: { '@type': 'Organization', name: 'Livesov', url: 'https://livesov.com' },
  };

  return (
    <SeoLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

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
              <div className="blog-post-avatar">{post.author.initials}</div>
              <div>
                <div className="blog-post-author-name">{post.author.name}</div>
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
          {renderContent(post.content)}
        </div>

        {/* Bottom CTA */}
        <div className="blog-post-cta">
          <h3>Ready to track your AI visibility?</h3>
          <p>Monitor your brand across ChatGPT, Perplexity, Claude, Gemini & Grok.</p>
          <Link href="/signup" className="blog-cta-btn">Start Tracking &rarr;</Link>
        </div>
      </article>
    </SeoLayout>
  );
}
