// Server-renderable: these sections hold no state or handlers, so pages that
// are server components keep their copy out of the RSC payload.
//
// Styled to the Livesov site design system (src/styles/livesov-site.css);
// component-specific rules live in src/styles/site-sections.css under `.ls`.

import Link from 'next/link';
import '@/styles/site-sections.css';

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
  // The old beige `--bg-section` band becomes a white band with hairline
  // borders; any other explicit background is passed through untouched.
  const band = !!background && background.includes('--bg-section');
  // 1080 was the old default container; the new site container is 1200.
  const maxWidth = width === 1080 ? 1200 : width;
  return (
    <section
      className={'ls-s' + (band ? ' ls-s-band' : '')}
      style={{ background: band ? undefined : background || undefined, padding: pad }}
    >
      <div className="ls-s-in" style={{ maxWidth }}>{children}</div>
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
    <div className="ls-s-head">
      {label && <div className="ls-eyebrow">{label}</div>}
      <h2 className="ls-s-title">{title}</h2>
      {subtitle && <p className="ls-s-sub">{subtitle}</p>}
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
    <div className={`ls-s-feats cols-${columns}`}>
      {items.map((f) => (
        <div key={f.title} className="ls-s-feat">
          {f.icon && <div className="ls-s-feat-ic" aria-hidden="true">{f.icon}</div>}
          <h3>{f.title}</h3>
          <p>{f.description}</p>
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
    <div className="ls-s-stats">
      {stats.map((s) => (
        <div key={s.label} className="ls-s-stat">
          <div className="v">{s.value}</div>
          <div className="l">{s.label}</div>
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
    <ol className="ls-s-steps">
      {steps.map((s, i) => (
        <li key={s.title} className="ls-s-step">
          <span className="ls-kicker" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
          <h3>{s.title}</h3>
          <p>{s.description}</p>
        </li>
      ))}
    </ol>
  );
}

/* ───────────────────────── Generic JSON-LD emitter ───────────────────────── */

/**
 * Renders an arbitrary schema.org object as a JSON-LD script.
 * Usage: <JsonLd data={softwareApplicationSchema} />
 *
 * No CSP nonce on purpose: `application/ld+json` is a data block the browser
 * never executes, so script-src does not apply. Stamping the nonce from a
 * client component also broke hydration on every public page - the browser
 * hides nonce attribute values once CSP is active, so React saw "" in the
 * DOM against the real nonce in props and re-rendered the subtree.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
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
    <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px" width={1200}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="ls-s-faq">
        <div className="ls-s-faq-head">
          <h2 className="ls-s-title">{title}</h2>
          {subtitle && <p className="ls-s-sub">{subtitle}</p>}
        </div>
        <div className="ls-faq">
          {items.map((f) => (
            <details key={f.question}>
              <summary><span>{f.question}</span><span className="pm" aria-hidden="true">+</span></summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
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
    <div className="ls-table-box">
      <table className="ls-table ls-s-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={h} scope="col" className={i === highlightColumn ? 'hl-dark' : i === 0 ? 'lbl' : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className={ci === 0 ? 'k' : ci === highlightColumn ? 'hl' : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  return (
    <div className={`ls-s-callout ${variant}`}>
      <div className="ls-s-callout-t">{title}</div>
      <div className="ls-s-callout-b">{children}</div>
    </div>
  );
}

/* ───────────────────────── Long-form prose container ───────────────────────── */

export function LongForm({ children }: { children: React.ReactNode }) {
  return <article className="seo-longform ls-s-prose">{children}</article>;
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
      <h2 className="ls-s-title" style={{ marginBottom: 24 }}>{title}</h2>
      <div className="ls-s-pillars">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="ls-linkcard pillar-link">
            <span>
              <strong>{l.label}</strong>
              <small>{l.description}</small>
            </span>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
          </Link>
        ))}
      </div>
    </Section>
  );
}
