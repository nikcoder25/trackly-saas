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
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          margin: 32px 0 12px;
          line-height: 1.3;
        }
        .tool-article-prose h2:first-child {
          margin-top: 0;
        }
        .tool-article-prose h3 {
          font-size: 17px;
          font-weight: 700;
          color: #0f172a;
          margin: 24px 0 8px;
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
      `}</style>
    </article>
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
