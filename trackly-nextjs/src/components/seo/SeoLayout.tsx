import Link from 'next/link';
import SiteShell from '@/components/site/SiteShell';

interface SeoLayoutProps {
  children: React.ReactNode;
}

/* Frame for the long-tail public pages (guides, tools, alternatives,
   legal...). Same header, footer and tokens as the redesigned pages via
   SiteShell; `ls-seo` remaps the legacy CSS variables those pages still
   use (--brand, --text-primary...) to the new palette. Nav links live in
   SiteHeader / SiteFooter (MARKETING_NAV_LINKS). */
export default function SeoLayout({ children }: SeoLayoutProps) {
  return (
    <SiteShell id="landing-page" className="ls-seo">
      {children}
      <section className="ls-wrap" style={{ paddingTop: 40, paddingBottom: 112 }}>
        <div className="ls-cta-band center">
          <h2 className="ls-h2" style={{ fontSize: 'clamp(34px, 5vw, 56px)', maxWidth: 820 }}>
            See what AI says about your brand <span className="ls-em">in 90 seconds.</span>
          </h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, maxWidth: 600 }}>
            Track ChatGPT, Perplexity, Claude, Gemini and Grok. 7 day free trial, no credit card.
          </p>
          <div className="ls-cta-row">
            <Link href="/signup" className="ls-btn ls-btn-dark ls-btn-lg">Start free trial</Link>
            <Link href="/geo-audit" className="ls-btn ls-btn-light ls-btn-lg">Run a free audit</Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

export function SeoHero({ title, subtitle, ctaText, ctaHref, hideCta }: { title: React.ReactNode; subtitle: string; ctaText?: string; ctaHref?: string; hideCta?: boolean }) {
  return (
    <section className="ls-wrap ls-hero-c ls-seo-hero">
      <h1 className="ls-h1">{title}</h1>
      <p className="ls-lead xl">{subtitle}</p>
      {!hideCta && (
        <div className="ls-cta-row">
          <Link href={ctaHref || '/signup'} className="ls-btn ls-btn-pri ls-btn-lg">{ctaText || 'Start Tracking'}</Link>
        </div>
      )}
    </section>
  );
}

export function SeoContent({ children }: { children: React.ReactNode }) {
  return (
    <article className="ls-wrap ls-seo-prose" style={{ paddingBottom: 72 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {children}
      </div>
    </article>
  );
}

/**
 * Breadcrumb JSON-LD structured data for sub-pages.
 * Usage: <Breadcrumbs items={[{ name: 'Pricing', url: '/pricing' }]} />
 */
export function Breadcrumbs({ items }: { items: Array<{ name: string; url: string }> }) {
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://livesov.com/' },
      ...items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: item.name,
        item: `https://livesov.com${item.url}`,
      })),
    ],
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
  );
}
