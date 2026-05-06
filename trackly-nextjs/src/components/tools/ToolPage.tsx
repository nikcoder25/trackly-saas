'use client';

import Link from 'next/link';
import SeoLayout, { Breadcrumbs } from '@/components/seo/SeoLayout';
import { useNonce } from '@/components/NonceProvider';

interface ToolPageProps {
  title: React.ReactNode;
  subtitle: string;
  toolName: string;
  toolSlug: string;
  children: React.ReactNode;
  hideUpsell?: boolean;
}

export default function ToolPage({ title, subtitle, toolName, toolSlug, children, hideUpsell }: ToolPageProps) {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Free Tools', url: '/tools' }, { name: toolName, url: `/tools/${toolSlug}` }]} />
      <section
        className="land-hero"
        style={{ paddingTop: 80, paddingBottom: 32, textAlign: 'center' }}
      >
        <div style={{ marginBottom: 16, fontSize: 13, color: 'rgba(255,255,255,.55)' }}>
          <Link href="/tools" style={{ color: 'rgba(255,255,255,.55)', textDecoration: 'none' }}>
            Free Tools
          </Link>
          {' / '}
          <span>{toolName}</span>
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.2, marginBottom: 14 }}>{title}</h1>
        <p
          style={{
            fontSize: 17,
            color: 'rgba(255,255,255,.7)',
            maxWidth: 620,
            margin: '0 auto',
            paddingBottom: 8,
          }}
        >
          {subtitle}
        </p>
      </section>

      <section style={{ padding: '0 24px 64px', maxWidth: 760, margin: '0 auto' }}>{children}</section>

      {!hideUpsell && (
        <section style={{ padding: '0 24px 80px', maxWidth: 760, margin: '0 auto' }}>
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 32,
              boxShadow: '0 4px 24px rgba(0,0,0,.08)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                background: '#f5f3ff',
                borderRadius: 10,
                padding: 20,
                marginBottom: 20,
                border: '1px solid #e0e7ff',
              }}
            >
              <p style={{ fontSize: 14, color: '#1a1a2e', lineHeight: 1.6, margin: 0 }}>
                Want continuous tracking instead of a one-off check? Livesov monitors your AI visibility across
                ChatGPT, Perplexity, Claude, Gemini and Grok every day.
              </p>
            </div>
            <Link
              href="/signup"
              style={{
                display: 'inline-block',
                padding: '14px 32px',
                borderRadius: 10,
                background: 'var(--brand)',
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Start Tracking Free
            </Link>
          </div>
        </section>
      )}
    </SeoLayout>
  );
}

export const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 32,
  boxShadow: '0 4px 24px rgba(0,0,0,.08)',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: '1px solid #e0e0e0',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
};

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  fontSize: 14,
  color: '#1a1a2e',
  marginBottom: 6,
};

export function PrimaryButton({
  children,
  loading,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      style={{
        width: '100%',
        padding: '14px 24px',
        borderRadius: 10,
        border: 'none',
        background: loading || disabled ? '#ccc' : 'var(--brand)',
        color: '#fff',
        fontSize: 16,
        fontWeight: 700,
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
        ...(rest.style || {}),
      }}
    >
      {children}
    </button>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      style={{
        marginTop: 20,
        padding: '12px 16px',
        borderRadius: 10,
        background: '#fef2f2',
        color: '#dc2626',
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}

/**
 * Long-form prose section that sits below the tool card. Mirrors the
 * SeoContent voice + width so tool pages feel consistent with the
 * platform-tracking landing pages.
 */
export function ToolArticle({ children }: { children: React.ReactNode }) {
  return (
    <article
      style={{
        marginTop: 48,
        background: '#fff',
        borderRadius: 16,
        padding: '40px 36px',
        boxShadow: '0 4px 24px rgba(0,0,0,.06)',
        color: '#1f2937',
      }}
    >
      <div
        className="tool-article-prose"
        style={{
          fontSize: 16,
          lineHeight: 1.75,
        }}
      >
        {children}
      </div>
      <style jsx global>{`
        .tool-article-prose h2 {
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
          margin: 36px 0 14px;
          line-height: 1.3;
          scroll-margin-top: 80px;
        }
        .tool-article-prose h2:first-child {
          margin-top: 0;
        }
        .tool-article-prose h3 {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 26px 0 8px;
        }
        .tool-article-prose p {
          margin: 0 0 14px;
          color: #334155;
        }
        .tool-article-prose ul,
        .tool-article-prose ol {
          margin: 0 0 16px;
          padding-left: 22px;
          color: #334155;
        }
        .tool-article-prose li {
          margin-bottom: 6px;
        }
        .tool-article-prose a {
          color: var(--brand);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .tool-article-prose code {
          background: #f1f5f9;
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 0.92em;
        }
        .tool-article-prose blockquote {
          margin: 16px 0;
          padding: 12px 18px;
          background: #f8fafc;
          border-left: 3px solid var(--brand);
          border-radius: 6px;
          color: #475569;
          font-style: italic;
        }
        .tool-article-prose .callout {
          margin: 18px 0;
          padding: 14px 18px;
          background: #f5f3ff;
          border: 1px solid #e0e7ff;
          border-radius: 10px;
        }
        .tool-article-prose table {
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0 22px;
          font-size: 14.5px;
          background: #fff;
        }
        .tool-article-prose th,
        .tool-article-prose td {
          border: 1px solid #e5e7eb;
          padding: 10px 12px;
          text-align: left;
          vertical-align: top;
        }
        .tool-article-prose th {
          background: #f8fafc;
          font-weight: 700;
          color: #0f172a;
        }
        .tool-article-prose tbody tr:nth-child(even) td {
          background: #fafbfd;
        }
      `}</style>
    </article>
  );
}

/**
 * The "answer capsule" that sits at the top of every article - a 1-2
 * sentence direct answer to the page's primary question. AI engines
 * reward this pattern because they extract the capsule cleanly.
 */
export function AnswerCapsule({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      aria-label="Quick answer"
      style={{
        background: 'linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%)',
        border: '1px solid #e2e8f0',
        borderLeft: '4px solid var(--brand)',
        borderRadius: 10,
        padding: '16px 20px',
        margin: '0 0 24px',
        fontSize: 15.5,
        lineHeight: 1.7,
        color: '#1e293b',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
        Quick answer
      </div>
      {children}
    </div>
  );
}

/**
 * Highlighted key-takeaways box. Drop in after the intro paragraphs.
 */
export function KeyTakeaways({ items }: { items: string[] }) {
  return (
    <aside
      aria-label="Key takeaways"
      style={{
        background: '#fffbf2',
        border: '1px solid #fde68a',
        borderRadius: 12,
        padding: '18px 22px',
        margin: '20px 0 28px',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
        Key takeaways
      </div>
      <ul style={{ margin: 0, paddingLeft: 22 }}>
        {items.map((it, i) => (
          <li key={i} style={{ color: '#334155' }}>{it}</li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * Expert pull-quote. Adds an E-E-A-T signal and breaks up long copy.
 */
export function ExpertQuote({ quote, name, title }: { quote: string; name: string; title: string }) {
  return (
    <figure
      style={{
        margin: '24px 0',
        padding: '22px 26px',
        background: '#0f172a',
        borderRadius: 14,
        color: '#e2e8f0',
      }}
    >
      <div style={{ fontSize: 28, color: 'var(--brand)', lineHeight: 1, marginBottom: 8 }}>“</div>
      <blockquote style={{ margin: 0, padding: 0, background: 'transparent', border: 'none', fontStyle: 'normal', color: '#f1f5f9', fontSize: 16, lineHeight: 1.7 }}>
        {quote}
      </blockquote>
      <figcaption style={{ marginTop: 14, fontSize: 13, color: '#94a3b8' }}>
        <strong style={{ color: '#fff' }}>{name}</strong>
        <span style={{ marginLeft: 6 }}>· {title}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Article JSON-LD schema. Drop one per tool page so the article is
 * eligible for Article rich results.
 */
export function ArticleSchema({
  headline,
  description,
  url,
  datePublished,
  dateModified,
}: {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified: string;
}) {
  const nonce = useNonce();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    author: { '@type': 'Organization', name: 'Livesov', url: 'https://livesov.com/about' },
    publisher: {
      '@type': 'Organization',
      name: 'Livesov',
      logo: { '@type': 'ImageObject', url: 'https://livesov.com/og-image.png' },
    },
    datePublished,
    dateModified,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
  return (
    <script
      type="application/ld+json"
      nonce={nonce || undefined}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

interface Faq {
  q: string;
  a: string;
}

/**
 * Renders an FAQ section AND injects FAQPage JSON-LD so the answers can
 * be eligible for rich results.
 */
export function FaqSection({ heading = 'Frequently asked questions', items }: { heading?: string; items: Faq[] }) {
  const nonce = useNonce();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>{heading}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => (
          <details
            key={i}
            style={{
              background: '#f9fafb',
              borderRadius: 10,
              padding: '14px 18px',
              border: '1px solid #f0f0f0',
            }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{it.q}</summary>
            <div style={{ marginTop: 10, color: '#334155', fontSize: 15, lineHeight: 1.7 }}>{it.a}</div>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        nonce={nonce || undefined}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
    </section>
  );
}

/**
 * Compact related-tools block, expected at the bottom of every tool page.
 */
export function RelatedTools({ items }: { items: Array<{ slug: string; name: string; tagline: string }> }) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Related free tools</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {items.map((t) => (
          <Link
            key={t.slug}
            href={`/tools/${t.slug}`}
            style={{
              display: 'block',
              background: '#fff',
              borderRadius: 12,
              padding: 16,
              border: '1px solid #f0f0f0',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{t.name}</div>
            <div style={{ marginTop: 4, color: '#64748b', fontSize: 12, lineHeight: 1.55 }}>{t.tagline}</div>
            <div style={{ marginTop: 8, color: 'var(--brand)', fontSize: 12, fontWeight: 700 }}>Open →</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
