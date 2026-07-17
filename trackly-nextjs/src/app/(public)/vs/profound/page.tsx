import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  StatsBar,
  FaqSection,
  ComparisonTable,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'Livesov vs Profound | Self-Serve AI Visibility vs Enterprise (2026)',
  description:
    'Compare Livesov and Profound: platforms covered, pricing, self-serve vs sales-led, and who each tool is really for. An honest Profound alternative comparison.',
  keywords:
    'livesov vs profound, profound alternative, tryprofound review, profound pricing, ai visibility tool comparison, aeo tool, geo tool for smb',
  alternates: { canonical: '/vs/profound' },
  openGraph: {
    title: 'Livesov vs Profound | Self-Serve AI Visibility vs Enterprise (2026)',
    description:
      'Compare Livesov and Profound: platforms covered, pricing, self-serve vs sales-led, and who each tool is really for.',
    url: 'https://livesov.com/vs/profound',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Livesov vs Profound - AI Visibility Tools Compared',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Livesov vs Profound | Self-Serve AI Visibility vs Enterprise (2026)',
    description:
      'Compare Livesov and Profound: platforms covered, pricing, self-serve vs sales-led, and who each tool is really for.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const livesovStrengths = [
  {
    icon: '⚡',
    title: 'Self-serve from minute one',
    description:
      'Sign up, add your brand, see your AI visibility today. No demo call, no procurement cycle, no annual contract.',
  },
  {
    icon: '$',
    title: 'SMB-honest pricing',
    description:
      'Plans from $9-$89/mo with a 7-day no-card trial. Profound&rsquo;s entry plan lists at $99/mo (ChatGPT-only) and its multi-engine plan at $399/mo as of June 2026.',
  },
  {
    icon: '⚙',
    title: 'All 5 LLMs at every price',
    description:
      'ChatGPT, Claude, Gemini, Perplexity, and Grok included on every plan - the entry tier is not locked to a single engine.',
  },
  {
    icon: '⚠',
    title: 'Hallucination detection',
    description:
      'Canonical facts store flags AI answers that contradict your verified brand facts, with the evidence attached.',
  },
  {
    icon: '◎',
    title: 'Evidence-first reporting',
    description:
      'Full AI responses stored per run, so every metric traces back to the actual answer a buyer would have seen.',
  },
  {
    icon: '⟁',
    title: 'Free GEO audit + free tools',
    description:
      'Eleven free tools and a URL-level GEO audit let you act on findings without buying anything.',
  },
];

const profoundStrengths = [
  {
    icon: '🏢',
    title: 'Enterprise depth',
    description:
      '700+ enterprise customers including Fortune 500 brands; built for security reviews, SSO, and procurement.',
  },
  {
    icon: '📝',
    title: 'Content generation loop',
    description:
      'Growth plans bundle optimized article production and CMS publishing (WordPress, Sanity, Contentful).',
  },
  {
    icon: '🤖',
    title: 'GEO Agents',
    description:
      'Drag-and-drop agent builder for automated optimization workflows on top of the monitoring data.',
  },
  {
    icon: '📊',
    title: 'Best-funded vendor',
    description:
      '$96M Series C at a $1B valuation (Feb 2026) - deep resources for R&D and platform coverage.',
  },
  {
    icon: '🧠',
    title: 'Original research',
    description:
      'Publishes widely-cited citation research (e.g. most-cited domains by platform) from its dataset.',
  },
  {
    icon: '🛡',
    title: 'Managed onboarding',
    description: 'White-glove onboarding and CS for large brand and agency teams.',
  },
];

const comparisonRows = [
  ['Self-serve signup (no sales call)', '✓', '✗ Demo-led'],
  ['Free trial without a credit card', '✓ 7 days', '✗ No self-serve trial'],
  ['Entry price', '$9/mo', '$99/mo (ChatGPT-only)'],
  ['All major LLMs on entry plan', '✓ All 5', '✗ Single engine'],
  ['Multi-engine plan price', '$29-$89/mo', '$399/mo (Growth)'],
  ['Hallucination / fact-drift detection', '✓', '✗ Not advertised'],
  ['Full AI response stored as evidence', '✓', 'Partial'],
  ['Content generation / CMS publishing', '✗', '✓ Growth plan'],
  ['Automation agents', '✗', '✓ GEO Agents'],
  ['Enterprise SSO / procurement support', 'Contact us', '✓ Core motion'],
  ['Contract', 'Monthly or annual, cancel anytime', 'Sales-negotiated'],
];

const faqs = [
  {
    question: 'Is Livesov a good Profound alternative?',
    answer:
      'For SMBs, startups, and agencies that want self-serve AI visibility tracking across all five major LLMs without a demo call or a $399+/mo commitment, yes. For Fortune 500 teams that need bundled content production, automation agents, SSO, and managed onboarding, Profound is built for that buyer and Livesov is not.',
  },
  {
    question: 'How does pricing compare between Livesov and Profound?',
    answer:
      'Livesov: $9 (Starter), $29 (Pro), $89 (Agency) per month, each with a 7-day free trial, no credit card. Profound: public reporting as of June 2026 lists Starter at $99/mo limited to ChatGPT, Growth at $399/mo for multi-engine coverage, and custom enterprise pricing, with no self-serve trial. Verify current pricing on tryprofound.com.',
  },
  {
    question: 'Why is Profound so much more expensive?',
    answer:
      'Profound sells an enterprise platform: monitoring plus content generation, automation agents, CMS integrations, and managed service. If you need those, the price can be justified. If you primarily need accurate multi-LLM visibility measurement with evidence, that is the part Livesov delivers at a fraction of the cost.',
  },
  {
    question: 'Can a small team get value from Profound?',
    answer:
      'Profound&rsquo;s entry plan is ChatGPT-only and sales-led, which makes it a heavy lift for small teams. Most SMBs in this category start with a self-serve tool (Livesov, Otterly, Trakkr and similar) and graduate to enterprise platforms if procurement, SSO, or managed service become requirements.',
  },
  {
    question: 'Does Livesov offer enterprise features?',
    answer:
      'Livesov has an Enterprise plan with custom credit limits, dedicated support, and custom integrations - reach out via the contact page. The difference is the default motion: Livesov is self-serve first; Profound is enterprise-sales first.',
  },
];

export default function VsProfoundPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'vs Profound', url: '/vs/profound' }]} />

      <SeoHero
        title={
          <>
            Livesov vs <span className="text-[var(--brand)]">Profound</span>
          </>
        }
        subtitle="Profound is the best-funded enterprise platform in AI visibility. Livesov is the self-serve tool that gives you the same core measurement - all five LLMs, citations, sentiment, evidence - starting free, without a sales call."
        ctaText="Try Livesov free - no card"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar
          stats={[
            { value: '$9', label: 'Livesov entry price /mo' },
            { value: '$99', label: 'Profound entry price /mo' },
            { value: '5', label: 'LLMs on every Livesov plan' },
            { value: '0', label: 'Sales calls needed to start' },
          ]}
        />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="Side-by-side comparison"
          title="What each platform actually offers"
          subtitle="Honest comparison from public materials as of June 2026 - including the real enterprise capabilities where Profound is far ahead."
        />
        <ComparisonTable
          headers={['Capability', 'Livesov', 'Profound']}
          rows={comparisonRows}
          highlightColumn={1}
        />
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 12 }}>
          Competitor details from Profound&rsquo;s public site and third-party pricing reports,
          June 2026. Verify on tryprofound.com before deciding.
        </p>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader label="Where Livesov leads" title="Why self-serve teams pick Livesov" />
        <FeatureGrid items={livesovStrengths} columns={3} />
      </Section>

      <Section pad="80px 24px">
        <SectionHeader label="Where Profound leads" title="What the enterprise platform buys you" />
        <FeatureGrid items={profoundStrengths} columns={3} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>The honest segmentation</h2>
          <p>
            This category has split into two motions. Enterprise platforms (Profound, BrandLight,
            Evertune) sell six-figure-lifetime contracts with content production and managed
            service attached. Self-serve tools (Livesov, Otterly, Trakkr, Peec) let a marketer
            start measuring today for the price of a lunch.
          </p>
          <p>
            The measurement core - does ChatGPT mention you, who does Perplexity cite, what does
            Claude actually say - is remarkably similar across both motions. What you pay for at
            the enterprise tier is everything around the measurement: content factories,
            automation, procurement compatibility, and a CSM.
          </p>
          <Callout title="A practical path" variant="note">
            Many teams start self-serve to prove the channel (does AI visibility move pipeline?),
            then take that evidence into an enterprise procurement cycle if they outgrow
            self-serve. Starting at $399+/mo to answer &quot;do we even have an AI visibility
            problem?&quot; is backwards - measure first, commit later.
          </Callout>
        </LongForm>
      </Section>

      <FaqSection title="Livesov vs Profound - FAQ" items={faqs} />

      <PillarLinks
        title="Continue evaluating"
        links={[
          { href: '/profound-alternative', label: 'Profound alternative', description: 'Why self-serve teams switch from Profound to Livesov.' },
          { href: '/vs/otterly', label: 'Livesov vs Otterly', description: 'Two self-serve tools compared surface by surface.' },
          { href: '/vs/peec-ai', label: 'Livesov vs Peec AI', description: 'Add-on pricing vs all-platforms-included.' },
          { href: '/pricing', label: 'Pricing & plans', description: 'Start free, scale to agency multi-brand.' },
          { href: '/how-it-works', label: 'How Livesov works', description: 'Methodology and data pipeline explained.' },
          { href: '/case-studies', label: 'Case studies', description: 'How teams move their share of AI answers.' },
          { href: '/geo-audit', label: 'Free GEO audit', description: 'Score any URL for AI citation-readiness.' },
        ]}
      />
    </SeoLayout>
  );
}
