import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  StatsBar,
  FaqSection,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'About Livesov | AI Visibility Platform for Brands',
  description:
    'Livesov is the AI visibility platform that tracks how ChatGPT, Perplexity, Claude, Gemini, and Grok mention and recommend your brand.',
  keywords:
    'about livesov, livesov company, ai visibility platform, ai brand tracking company, generative engine optimization platform, livesov team',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About Livesov — The AI Visibility Tracking Platform',
    description:
      'Livesov is building the analytics layer for AI visibility. Learn our mission, methodology, and approach.',
    url: 'https://livesov.com/about',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'About Livesov — The AI Visibility Tracking Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Livesov — The AI Visibility Tracking Platform',
    description:
      'Building the analytics layer for AI visibility — across ChatGPT, Claude, Gemini, Perplexity, and Grok.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const values = [
  {
    icon: '◎',
    title: 'Measurement over vibes',
    description:
      'Every metric in Livesov links to a raw, billable API response. No screenshots, no simulated data, no hand-waving — just defensible numbers.',
  },
  {
    icon: '⚙',
    title: 'Direct API access',
    description:
      'We call the official OpenAI, Anthropic, Google, Perplexity, and xAI APIs. No scraping, no proxies, no fragile UI automation.',
  },
  {
    icon: '⌁',
    title: 'Multi-run, not single-shot',
    description:
      'LLMs are non-deterministic. We run every prompt multiple times per cycle and aggregate — so one noisy run can&rsquo;t move your dashboard.',
  },
  {
    icon: '⟁',
    title: 'Citation transparency',
    description:
      'Every Perplexity, ChatGPT Search, and Gemini grounded answer comes with the full citation list — captured and surfaced for you.',
  },
  {
    icon: '⚠',
    title: 'Hallucination accountability',
    description:
      'AI invents brand facts confidently. We give you the tools to catch and correct that drift before it reaches a buyer.',
  },
  {
    icon: '⬢',
    title: 'Built for teams of all sizes',
    description:
      'Solo founders, in-house marketing teams, multi-brand agencies — Livesov scales from one brand on Free to dozens on Agency.',
  },
];

const stats = [
  { value: '5', label: 'AI platforms tracked' },
  { value: '15+', label: 'AI models monitored' },
  { value: '24/7', label: 'Continuous monitoring' },
  { value: '2024', label: 'Founded' },
];

const faqs = [
  {
    question: 'When was Livesov founded?',
    answer:
      'Livesov was founded in 2024 to build the analytics layer for AI brand visibility — a market segment that essentially didn&apos;t exist as a standalone discipline until ChatGPT, Perplexity, and Claude crossed mass-market scale.',
  },
  {
    question: 'Who is Livesov for?',
    answer:
      'Marketing teams, brand teams, PR teams, SEO professionals, and agencies whose work is increasingly shaped by what AI says about their brand. We support solo founders on the Free plan all the way through multi-brand agencies on the Agency plan.',
  },
  {
    question: 'How is Livesov different from a traditional SEO tool?',
    answer:
      'Traditional SEO tools measure Google search rankings. Livesov measures AI answers — what ChatGPT, Claude, Gemini, Perplexity, and Grok say about your brand. The disciplines are complementary; most customers run Livesov alongside Ahrefs or Semrush.',
  },
  {
    question: 'How is Livesov different from a ChatGPT mention checker?',
    answer:
      'Mention checkers run a single prompt once. Livesov runs hundreds of prompts on a recurring schedule, multi-run aggregates them, tracks rank and sentiment, monitors competitors, and detects hallucinations. It&apos;s a continuous brand monitoring system, not a spot-check tool.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes. All AI API calls run server-side over TLS, your prompts and responses are stored in your isolated workspace, and we never share data across tenants. Enterprise security details and SOC2 status are available on request via the /contact page.',
  },
  {
    question: 'Where can I learn more about AI visibility optimization?',
    answer:
      'Start with our /geo-optimization guide for the full framework, then explore our per-platform pages (ChatGPT, Claude, Gemini, Perplexity, Grok) for platform-specific tactics. Our /blog publishes new research and case studies regularly.',
  },
];

export default function AboutPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'About', url: '/about' }]} />

      <SeoHero
        title={
          <>
            About <span className="text-[var(--brand)]">Livesov</span>
          </>
        }
        subtitle="We're building the analytics layer for AI visibility — helping brands measure and improve how ChatGPT, Claude, Gemini, Perplexity, and Grok mention and recommend them."
        ctaText="Try Livesov free"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar stats={stats} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Our mission"
          title="Make AI visibility measurable, defensible, and actionable"
        />
        <LongForm>
          <p>
            For the last twenty years, the question every marketing team asked was &quot;how do
            we rank on Google?&quot; That question is being quietly replaced by a new one:{' '}
            <strong>&quot;what does AI say about us?&quot;</strong> ChatGPT alone has more than
            300 million weekly users asking for product recommendations, vendor comparisons,
            and category research. Perplexity, Claude, Gemini, and Grok add hundreds of millions
            more across consumer and enterprise surfaces.
          </p>
          <p>
            None of this is visible in traditional analytics. Your Google Search Console
            doesn&apos;t tell you whether ChatGPT calls you the leader in your category, lists a
            competitor first, or confidently misstates your pricing. Your SEO suite doesn&apos;t
            tell you which of your pages Perplexity actually cites — or which competitor pages
            are stealing your slot. <strong>That gap is the largest blind spot in modern brand
            marketing, and Livesov exists to close it.</strong>
          </p>
        </LongForm>
      </Section>

      <Section pad="80px 24px">
        <SectionHeader
          label="What we believe"
          title="Six principles that shape every decision we ship"
        />
        <FeatureGrid items={values} columns={3} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <LongForm>
          <h2>How Livesov works (in one paragraph)</h2>
          <p>
            Livesov queries the official APIs of ChatGPT, Claude, Gemini, Perplexity, and Grok
            with your tracked prompts on a recurring schedule. Each prompt is run multiple
            times per cycle to capture variance. Every response is parsed for mentions, rank,
            sentiment, competitor co-occurrence, citations, and hallucinations. Results stream
            into a unified dashboard with email alerts, webhook integrations, and exportable
            evidence. The full methodology is on the <a href="/how-it-works">How it works</a>
            {' '}page.
          </p>

          <h2>The market we serve</h2>
          <p>
            Livesov is used by SaaS founders measuring the day AI starts recommending them
            alongside the incumbent, marketing agencies adding AI visibility as a measurable
            client deliverable, e-commerce and DTC brands monitoring AI shopping assistants,
            enterprise marketing teams running governance and board-level reporting, PR teams
            tracking how stories propagate into AI answers, and SEO professionals extending
            their toolkit into AI search. See <a href="/use-cases">Use cases</a> for the full
            picture.
          </p>

          <h2>Why we&rsquo;re different</h2>
          <p>
            Most products in this space are either (1) one-off mention checkers wrapped around
            a single AI call, (2) screenshot tools that scrape the ChatGPT or Perplexity UI
            and break every time the platform ships a change, or (3) legacy SEO suites with an
            &quot;AI&quot; sticker on the box. Livesov is none of these. We built from the API
            up, for the AI era, as a continuous measurement loop — and we cover all five major
            AI platforms with the same depth.
          </p>

          <h2>Our roadmap</h2>
          <p>
            Public roadmap themes for the next year include: native Slack / Teams / HubSpot /
            Salesforce / Zapier integrations, automated content recommendations grounded in
            your specific citation gaps, prompt-cluster discovery (automatically finding the
            queries your category cares about), and expanded support for emerging AI platforms
            as they reach material scale. The <a href="/changelog">changelog</a> shows what
            shipped recently.
          </p>

          <h2>How to reach us</h2>
          <p>
            We are a small, focused team and read every message. Enterprise inquiries,
            partnership questions, custom plans, and security/SOC2 documentation requests all
            go through <a href="/contact">our contact form</a>. Agencies should also see the
            dedicated <a href="/partners">partners page</a> for the revenue-share program.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="About Livesov — FAQ" items={faqs} />

      <PillarLinks
        title="Get started or go deeper"
        links={[
          {
            href: '/how-it-works',
            label: 'How Livesov works',
            description: 'Methodology, parsing, and the data pipeline.',
          },
          {
            href: '/pricing',
            label: 'Pricing & plans',
            description: 'From Free through Agency, no card required.',
          },
          {
            href: '/use-cases',
            label: 'Use cases',
            description: 'How SaaS, agencies, e-comm, enterprise use Livesov.',
          },
          {
            href: '/integrations',
            label: 'Integrations',
            description: 'AI platforms, alerts, exports, and BYOK.',
          },
          {
            href: '/geo-optimization',
            label: 'GEO optimization guide',
            description: 'The framework for ranking in AI answers.',
          },
          {
            href: '/contact',
            label: 'Contact us',
            description: 'Enterprise, partnerships, security inquiries.',
          },
        ]}
      />
    </SeoLayout>
  );
}
