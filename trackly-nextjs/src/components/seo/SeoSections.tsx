'use client';

import Link from 'next/link';
import { useNonce } from '@/components/NonceProvider';

/* ───────────────────────── Section wrapper ───────────────────────── */

export function Section({
  children,
  background,
  width = 1080,
  pad = '80px 24px',
}: {
  children: React.ReactNode;
  background?: string;
  width?: number;
  pad?: string;
}) {
  return (
    <section style={{ background: background || 'transparent', padding: pad }}>
      <div style={{ maxWidth: width, margin: '0 auto' }}>{children}</div>
    </section>
  );
}

export function SectionHeader({
  label,
  title,
  subtitle,
}: {
  label?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 44 }}>
      {label && (
        <div
          style={{
            display: 'inline-block',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: 'var(--brand, #6366f1)',
            background: 'rgba(99,102,241,.08)',
            border: '1px solid rgba(99,102,241,.18)',
            padding: '5px 14px',
            borderRadius: 100,
            marginBottom: 16,
          }}
        >
          {label}
        </div>
      )}
      <h2
        style={{
          fontSize: 'clamp(26px, 3.6vw, 38px)',
          fontWeight: 800,
          letterSpacing: -1,
          color: 'var(--text-primary)',
          margin: '0 0 14px',
          lineHeight: 1.18,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: 16,
            maxWidth: 640,
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* ───────────────────────── Feature / Benefit grid ───────────────────────── */

export interface FeatureItem {
  icon?: React.ReactNode;
  title: string;
  description: string;
}

export function FeatureGrid({
  items,
  columns = 3,
}: {
  items: FeatureItem[];
  columns?: 2 | 3 | 4;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${columns === 2 ? 280 : 240}px, 1fr))`,
        gap: 20,
      }}
    >
      {items.map((f) => (
        <div
          key={f.title}
          style={{
            background: '#fff',
            border: '1px solid var(--card-border, #e8e5e1)',
            borderRadius: 14,
            padding: 26,
            transition: 'transform .2s, box-shadow .2s',
          }}
        >
          {f.icon && (
            <div
              style={{
                fontSize: 22,
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(99,102,241,.08)',
                borderRadius: 10,
                marginBottom: 14,
              }}
              aria-hidden="true"
            >
              {f.icon}
            </div>
          )}
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 8px',
            }}
          >
            {f.title}
          </h3>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            {f.description}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Stat bar ───────────────────────── */

export function StatsBar({
  stats,
}: {
  stats: Array<{ value: string; label: string }>;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))`,
        gap: 12,
        background: '#fff',
        border: '1px solid var(--card-border, #e8e5e1)',
        borderRadius: 16,
        padding: '28px 16px',
      }}
    >
      {stats.map((s) => (
        <div key={s.label} style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: 'var(--brand, #6366f1)',
              letterSpacing: -1,
              lineHeight: 1.1,
            }}
          >
            {s.value}
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginTop: 4,
              lineHeight: 1.4,
            }}
          >
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Steps ───────────────────────── */

export function ProcessSteps({
  steps,
}: {
  steps: Array<{ title: string; description: string }>;
}) {
  return (
    <ol
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`,
        gap: 20,
        counterReset: 'process',
      }}
    >
      {steps.map((s, i) => (
        <li
          key={s.title}
          style={{
            background: '#fff',
            border: '1px solid var(--card-border, #e8e5e1)',
            borderRadius: 14,
            padding: 24,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--brand, #6366f1)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
            aria-hidden="true"
          >
            {i + 1}
          </div>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: '0 0 8px',
            }}
          >
            {s.title}
          </h3>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              margin: 0,
            }}
          >
            {s.description}
          </p>
        </li>
      ))}
    </ol>
  );
}

/* ───────────────────────── Generic JSON-LD emitter ───────────────────────── */

/**
 * Renders an arbitrary schema.org object as a nonce-safe JSON-LD script.
 * Usage: <JsonLd data={softwareApplicationSchema} />
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const nonce = useNonce();
  return (
    <script
      type="application/ld+json"
      nonce={nonce || undefined}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/* ───────────────────────── FAQ with JSON-LD schema ───────────────────────── */

export interface FaqItem {
  question: string;
  answer: string;
}

export function FaqSection({
  items,
  title = 'Frequently Asked Questions',
  subtitle,
}: {
  items: FaqItem[];
  title?: string;
  subtitle?: string;
}) {
  const nonce = useNonce();
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  };

  return (
    <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px" width={820}>
      <script
        type="application/ld+json"
        nonce={nonce || undefined}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <SectionHeader title={title} subtitle={subtitle} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((f) => (
          <details
            key={f.question}
            className="lp-faq-item"
            style={{
              background: '#fff',
              borderRadius: 12,
              border: '1px solid var(--card-border, #e8e5e1)',
              padding: '18px 22px',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                listStyle: 'none',
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--text-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span>{f.question}</span>
              <span
                aria-hidden="true"
                className="lp-faq-icon"
                style={{
                  flexShrink: 0,
                  color: 'var(--brand, #6366f1)',
                  fontSize: 22,
                  lineHeight: 1,
                  transition: 'transform .2s',
                }}
              >
                +
              </span>
            </summary>
            <p
              style={{
                margin: '12px 0 0',
                fontSize: 14,
                lineHeight: 1.75,
                color: 'var(--text-secondary)',
              }}
            >
              {f.answer}
            </p>
          </details>
        ))}
      </div>
      <style>{`
        .lp-faq-item summary::-webkit-details-marker { display: none; }
        .lp-faq-item[open] .lp-faq-icon { transform: rotate(45deg); }
        .lp-faq-item:hover { border-color: rgba(99,102,241,.4); }
      `}</style>
    </Section>
  );
}

/* ───────────────────────── Comparison table ───────────────────────── */

export function ComparisonTable({
  headers,
  rows,
  highlightColumn = 1,
}: {
  headers: string[];
  rows: Array<Array<string | React.ReactNode>>;
  highlightColumn?: number;
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid var(--card-border, #e8e5e1)',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 540 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--card-border, #e8e5e1)' }}>
              {headers.map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: '18px 20px',
                    textAlign: 'left',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    color: i === highlightColumn ? 'var(--brand, #6366f1)' : 'var(--text-secondary)',
                    background: i === highlightColumn ? 'rgba(99,102,241,.05)' : 'transparent',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                style={{
                  borderBottom:
                    ri < rows.length - 1 ? '1px solid var(--card-border, #e8e5e1)' : 'none',
                }}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: '14px 20px',
                      fontWeight: ci === 0 ? 600 : ci === highlightColumn ? 700 : 500,
                      color:
                        ci === 0
                          ? 'var(--text-primary)'
                          : ci === highlightColumn
                            ? 'var(--brand, #6366f1)'
                            : 'var(--text-secondary)',
                      background: ci === highlightColumn ? 'rgba(99,102,241,.04)' : 'transparent',
                      verticalAlign: 'top',
                      lineHeight: 1.55,
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── Callout box ───────────────────────── */

export function Callout({
  title,
  children,
  variant = 'info',
}: {
  title: string;
  children: React.ReactNode;
  variant?: 'info' | 'tip' | 'note';
}) {
  const colors = {
    info: { bg: 'rgba(99,102,241,.06)', border: 'rgba(99,102,241,.2)', accent: '#6366f1' },
    tip: { bg: 'rgba(16,185,129,.06)', border: 'rgba(16,185,129,.2)', accent: '#10b981' },
    note: { bg: 'rgba(245,158,11,.06)', border: 'rgba(245,158,11,.2)', accent: '#f59e0b' },
  }[variant];
  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${colors.accent}`,
        borderRadius: 12,
        padding: '20px 24px',
        margin: '24px 0',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: colors.accent,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--text-primary)' }}>{children}</div>
    </div>
  );
}

/* ───────────────────────── Long-form prose container ───────────────────────── */

export function LongForm({ children }: { children: React.ReactNode }) {
  return (
    <article
      style={{
        maxWidth: 740,
        margin: '0 auto',
        padding: '0 24px',
        fontSize: 16,
        lineHeight: 1.85,
        color: 'var(--text-secondary)',
      }}
      className="seo-longform"
    >
      <style>{`
        .seo-longform h2 {
          font-size: 26px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 56px 0 16px;
          letter-spacing: -0.5px;
          line-height: 1.25;
        }
        .seo-longform h2:first-child { margin-top: 0; }
        .seo-longform h3 {
          font-size: 19px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 32px 0 12px;
        }
        .seo-longform p { margin: 0 0 18px; }
        .seo-longform ul, .seo-longform ol {
          padding-left: 22px;
          margin: 0 0 22px;
        }
        .seo-longform li { margin-bottom: 10px; line-height: 1.75; }
        .seo-longform li strong { color: var(--text-primary); }
        .seo-longform a {
          color: var(--brand, #6366f1);
          font-weight: 500;
          text-decoration: underline;
          text-decoration-color: rgba(99,102,241,.3);
          text-underline-offset: 3px;
        }
        .seo-longform a:hover { text-decoration-color: var(--brand, #6366f1); }
        .seo-longform blockquote {
          border-left: 3px solid var(--brand, #6366f1);
          padding: 4px 0 4px 20px;
          margin: 24px 0;
          font-style: italic;
          color: var(--text-primary);
        }
        .seo-longform code {
          background: rgba(99,102,241,.08);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 13.5px;
          color: var(--brand, #6366f1);
        }
      `}</style>
      {children}
    </article>
  );
}

/* ───────────────────────── Pillar links / inter-link grid ───────────────────────── */

export function PillarLinks({
  title = 'Continue exploring',
  links,
}: {
  title?: string;
  links: Array<{ href: string; label: string; description: string }>;
}) {
  return (
    <Section pad="64px 24px" width={1080}>
      <h2
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: 'var(--text-primary)',
          margin: '0 0 24px',
          letterSpacing: -0.4,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(240px, 1fr))`,
          gap: 14,
        }}
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              display: 'block',
              padding: '20px 22px',
              background: '#fff',
              border: '1px solid var(--card-border, #e8e5e1)',
              borderRadius: 12,
              textDecoration: 'none',
              transition: 'all .15s',
            }}
            className="pillar-link"
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 4,
              }}
            >
              {l.label} <span style={{ color: 'var(--brand, #6366f1)' }}>→</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {l.description}
            </div>
          </Link>
        ))}
      </div>
      <style>{`
        .pillar-link:hover {
          border-color: var(--brand, #6366f1) !important;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(99,102,241,.1);
        }
      `}</style>
    </Section>
  );
}
