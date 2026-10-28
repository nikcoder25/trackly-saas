'use client';

import Link from 'next/link';
import SeoLayout, { Breadcrumbs } from '@/components/seo/SeoLayout';
import '@/styles/site-tools.css';

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
      <section className="ls-wrap ls-tool-hero">
        <nav aria-label="Breadcrumb" className="ls-crumbs">
          <Link href="/tools">Free Tools</Link>
          <span aria-hidden="true">/</span>
          <span>{toolName}</span>
        </nav>
        <h1 className="ls-h1">{title}</h1>
        <p className="ls-lead">{subtitle}</p>
      </section>

      <section className="ls-wrap ls-tool-body">{children}</section>

      {!hideUpsell && (
        <section className="ls-wrap ls-tool-body" style={{ paddingBottom: 96 }}>
          <div className="ls-cta-band row dark" style={{ padding: '40px 36px' }}>
            <div className="ls-stack ls-gap-10" style={{ maxWidth: 440 }}>
              <h2 className="ls-h2 sm" style={{ fontSize: 'clamp(26px, 3vw, 32px)' }}>
                Want this <span className="ls-em lime">every day?</span>
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ls-on-dark-2)' }}>
                Want continuous tracking instead of a one-off check? Livesov monitors your AI visibility across
                ChatGPT, Perplexity, Claude, Gemini and Grok every day.
              </p>
            </div>
            <Link href="/signup" className="ls-btn ls-btn-pri ls-btn-lg">Start Tracking Free</Link>
          </div>
        </section>
      )}
    </SeoLayout>
  );
}

export const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 20,
  padding: 32,
  border: '1px solid #E4E4DE',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid #D6D6CF',
  fontSize: 16,
  fontFamily: 'inherit',
  color: '#0B0C14',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
};

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 500,
  fontSize: 14,
  color: '#0B0C14',
  marginBottom: 8,
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
        minHeight: 48,
        padding: '15px 24px',
        borderRadius: 12,
        border: 'none',
        background: loading || disabled ? '#A5A3F0' : '#4F46E5',
        color: '#fff',
        fontFamily: 'inherit',
        fontSize: 16,
        fontWeight: 600,
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
    <div className="ls-alert err" role="alert" style={{ marginTop: 20 }}>
      {message}
    </div>
  );
}

/**
 * Long-form prose section that sits below the tool card. Mirrors the
 * SeoContent voice + width so tool pages feel consistent with the
 * platform-tracking landing pages. Prose styles live in site-tools.css.
 */
export function ToolArticle({ children }: { children: React.ReactNode }) {
  return (
    <article className="ls-card ls-tool-article">
      <div className="tool-article-prose">{children}</div>
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
    <div role="note" aria-label="Quick answer" className="ls-capsule">
      <div className="ls-eyebrow" style={{ fontSize: 12, marginBottom: 8 }}>Quick answer</div>
      {children}
    </div>
  );
}

/**
 * Highlighted key-takeaways box. Drop in after the intro paragraphs.
 */
export function KeyTakeaways({ items }: { items: string[] }) {
  return (
    <aside aria-label="Key takeaways" className="ls-takeaways">
      <div className="ls-mono" style={{ fontSize: 12, color: 'var(--ls-lime-ink)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Key takeaways
      </div>
      <ul>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
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
    <figure className="ls-quote">
      <blockquote>{quote}</blockquote>
      <figcaption>
        <strong>{name}</strong>
        <span> · {title}</span>
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
    <section className="ls-tool-sec">
      <h2 className="ls-h2 sm" style={{ fontSize: 'clamp(26px, 3vw, 32px)' }}>{heading}</h2>
      <div className="ls-faq">
        {items.map((it, i) => (
          <details key={i}>
            <summary><span>{it.q}</span><span className="pm" aria-hidden="true">+</span></summary>
            <p>{it.a}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
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
    <section className="ls-tool-sec">
      <h2 className="ls-h2 sm" style={{ fontSize: 'clamp(26px, 3vw, 32px)' }}>Related <span className="ls-em">free tools.</span></h2>
      <div className="ls-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
        {items.map((t) => (
          <Link key={t.slug} href={`/tools/${t.slug}`} className="ls-tool-card">
            <span className="t">{t.name}</span>
            <span className="d">{t.tagline}</span>
            <span className="go">Open →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
