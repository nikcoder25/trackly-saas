import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, SectionHeader, StatsBar, LongForm, PillarLinks } from '@/components/seo/SeoSections';
import { CASE_STUDIES } from '@/data/case-studies';

export const metadata: Metadata = {
  title: 'Livesov Case Studies: AI Visibility Playbooks Across SaaS, E-commerce, Agency & More',
  description:
    'Illustrative playbooks for growing ChatGPT mention rates, capturing AI Overviews citations, and recovering revenue lost to AI search - with the diagnostic, approach, and numbers.',
  keywords:
    'livesov case studies, ai visibility case study, chatgpt seo case study, geo case study, ai overviews case study, llm seo wins',
  alternates: { canonical: '/case-studies' },
  openGraph: {
    title: 'Livesov Case Studies: AI Visibility Playbooks',
    description:
      'Illustrative playbooks showing how teams move their share of AI answers and recover revenue.',
    url: 'https://livesov.com/case-studies',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov Case Studies: AI Visibility Wins',
      },
    ],
  },
};

export default function CaseStudiesIndexPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Case Studies', url: '/case-studies' }]} />

      <SeoHero
        title={
          <>
            The playbooks.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              The numbers.
            </span>
          </>
        }
        subtitle="Walkthroughs of how teams use Livesov to move their share of AI answers, recover traffic lost to AI Overviews, and become the brand ChatGPT recommends in their category."
        ctaText="Start your own program"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: `${CASE_STUDIES.length}`, label: 'Published playbooks' },
            { value: '+47pp', label: 'Mention-rate lift modeled in 90 days' },
            { value: '11 weeks', label: 'Modeled time to first material gain' },
            { value: '5', label: 'AI platforms measured throughout' },
          ]}
        />
        <p style={{ fontSize: 13, color: '#6b7280', maxWidth: 760, margin: '16px auto 0', textAlign: 'center' }}>
          These case studies are illustrative scenarios: the brand names are fictional and the
          figures model typical programs run on Livesov - they are not audited results from named
          customers. We&apos;ll publish named customer studies as logos and quotes are approved.
        </p>
      </Section>

      <Section pad="40px 24px 80px" width={1080}>
        <SectionHeader
          label="Browse"
          title="Pick a story closest to yours"
          subtitle="Each study includes the diagnostic, the approach, the numbers, and an editable playbook you can apply this quarter."
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 18,
          }}
        >
          {CASE_STUDIES.map((c) => (
            <Link
              key={c.slug}
              href={`/case-studies/${c.slug}`}
              style={{
                background: '#fff',
                border: '1px solid var(--card-border, #e8e5e1)',
                borderRadius: 16,
                padding: 26,
                textDecoration: 'none',
                transition: 'all .15s',
                display: 'flex',
                flexDirection: 'column',
              }}
              className="pillar-link"
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: 'var(--brand, #6366f1)',
                  marginBottom: 10,
                }}
              >
                {c.segment} · {c.industry}
              </div>
              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  margin: '0 0 8px',
                }}
              >
                {c.brand} <span style={{ color: 'var(--brand, #6366f1)' }}>→</span>
              </h3>
              <p
                style={{
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.65,
                  margin: '0 0 18px',
                }}
              >
                {c.summary}
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 'auto',
                  paddingTop: 14,
                  borderTop: '1px solid var(--card-border, #e8e5e1)',
                }}
              >
                {c.outcomes.slice(0, 2).map((o) => (
                  <div
                    key={o.label}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--brand, #6366f1)',
                      background: 'rgba(99,102,241,.06)',
                      padding: '6px 10px',
                      borderRadius: 6,
                    }}
                  >
                    {o.value} · {o.label}
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <h2>Where these numbers come from</h2>
          <p>
            Every case study on this page tracks live, panel-measured metrics - mention rate,
            citation share, branded search lift, and revenue impact - across ChatGPT, Claude,
            Gemini, Perplexity, and Grok. Where brand names appear with permission, we say so.
            Where customers asked to stay private, we generalise the brand and keep the methodology
            verbatim.
          </p>
          <p>
            If you would like to see your own program tracked the same way,{' '}
            <a href="/signup">start free</a> - most teams baseline in under an hour.
          </p>
        </LongForm>
      </Section>

      <PillarLinks
        title="Continue exploring"
        links={[
          { href: '/learn/llm-seo', label: 'LLM SEO: the 2026 guide', description: 'The playbook every case study above is built on.' },
          { href: '/ai-search-statistics-2026', label: 'AI search statistics 2026', description: '120+ data points that contextualise the numbers above.' },
          { href: '/generative-engine-optimization-tool', label: 'GEO tool', description: 'The measurement engine behind every study.' },
          { href: '/pricing', label: 'Pricing', description: 'Plans that scale from one brand to multi-brand programs.' },
        ]}
      />
    </SeoLayout>
  );
}
