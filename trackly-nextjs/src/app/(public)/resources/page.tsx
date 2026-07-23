import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, SectionHeader, LongForm, PillarLinks } from '@/components/seo/SeoSections';
import EmailOff from '@/components/EmailOff';

export const metadata: Metadata = {
  title: 'AI Visibility Resources, Templates & Free Downloads | Livesov',
  description:
    'Free templates, calculators, and downloadable playbooks for running an AI visibility program - from board-ready reports to prompt panels and the GEO maturity model.',
  keywords:
    'ai visibility report template, geo report template, llm seo template, ai visibility playbook, free seo templates, ai search resources',
  alternates: { canonical: '/resources' },
  openGraph: {
    title: 'AI Visibility Resources & Templates',
    description:
      'Free templates, calculators, and playbooks for running an AI visibility program.',
    url: 'https://livesov.com/resources',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI Visibility Resources & Templates',
      },
    ],
  },
};

const RESOURCES = [
  {
    href: '/resources/ai-visibility-report-template',
    title: 'AI Visibility Report Template',
    description:
      'A board-ready monthly report template covering mention rate, citation share, sentiment, and rank across all five major LLMs. Free Google Doc + Notion + PDF.',
    badge: 'Most popular',
  },
  {
    href: '/tools/share-of-voice-calculator',
    title: 'AI Share of Voice Calculator',
    description: 'Calculate your AI share of voice against any competitor set, in 30 seconds.',
    badge: 'Calculator',
  },
  {
    href: '/tools/prompt-generator',
    title: 'Buyer-Intent Prompt Generator',
    description: 'Generate the 40+ prompts ChatGPT and Perplexity buyers in your category actually ask.',
    badge: 'Generator',
  },
  {
    href: '/tools/llms-txt-generator',
    title: 'llms.txt Generator',
    description: 'Create a valid llms.txt file for your domain in under a minute.',
    badge: 'Generator',
  },
  {
    href: '/tools/ai-readiness-audit',
    title: 'AI Readiness Audit',
    description: 'Score any URL against the six LLM ranking signals - extractability, schema, crawler access, and more.',
    badge: 'Audit',
  },
  {
    href: '/tools/ai-crawler-checker',
    title: 'AI Crawler Checker',
    description: 'Confirm GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, and Google-Extended can all reach your site.',
    badge: 'Checker',
  },
  {
    href: '/learn/llm-seo',
    title: 'LLM SEO Playbook (2026)',
    description: 'The complete 50-page playbook for ranking inside ChatGPT, Claude, Gemini, Perplexity, and Grok.',
    badge: 'Guide',
  },
  {
    href: '/ai-search-statistics-2026',
    title: 'AI Search Statistics 2026',
    description: '120+ cite-ready data points on AI search adoption, market share, citations, and revenue impact.',
    badge: 'Stats',
  },
];

export default function ResourcesPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Resources', url: '/resources' }]} />

      <SeoHero
        title={
          <>
            Resources &amp;{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              free templates
            </span>
          </>
        }
        subtitle="Every template, calculator, and playbook we use internally and with clients - open-sourced. No email gate on the free tools, email-gated downloads for the report templates."
        ctaText="Start your program"
      />

      <Section pad="40px 24px 80px" width={1080}>
        <SectionHeader
          label={`${RESOURCES.length} resources`}
          title="Take what you need"
          subtitle="Mostly free. The downloadable templates ask for an email so we can notify you when they are updated."
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {RESOURCES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              style={{
                background: '#fff',
                border: '1px solid var(--card-border, #e8e5e1)',
                borderRadius: 14,
                padding: 24,
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
                {r.badge}
              </div>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: '0 0 8px',
                }}
              >
                {r.title} <span style={{ color: 'var(--brand, #6366f1)' }}>→</span>
              </h3>
              <p
                style={{
                  fontSize: 14,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {r.description}
              </p>
            </Link>
          ))}
        </div>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <h2>Why we open-source this</h2>
          <p>
            The category is new and the playbook is still being written. The fastest way to
            move the field forward is to ship every template, prompt set, and calculator we use
            so teams can adopt - and improve - them.
          </p>
          <p>
            If you build something on top of one of these resources, tell us - we&apos;ll add it
            to the next refresh: <EmailOff><a href="mailto:hello@livesov.com">hello@livesov.com</a></EmailOff>.
          </p>
        </LongForm>
      </Section>

      <PillarLinks
        title="Apply what you download"
        links={[
          { href: '/learn/llm-seo', label: 'LLM SEO playbook', description: 'The full operating model these templates plug into.' },
          { href: '/case-studies', label: 'Case studies', description: 'See how teams used these resources to grow mention rate.' },
          { href: '/generative-engine-optimization-tool', label: 'GEO tool', description: 'Continuous AI visibility measurement.' },
          { href: '/pricing', label: 'Pricing', description: 'Plans from one brand to multi-brand agency programs.' },
        ]}
      />
    </SeoLayout>
  );
}
