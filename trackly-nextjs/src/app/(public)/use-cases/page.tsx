import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  StatsBar,
  FaqSection,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'AI Visibility Tracker Use Cases | Livesov',
  description:
    'How agencies, SaaS, e-commerce, and local businesses use Livesov\'s AI visibility tracker to grow brand mentions across the 5 major AI engines.',
  keywords:
    'ai visibility use cases, brand tracking for saas, ai monitoring for agencies, ecommerce ai tracking, enterprise ai visibility, pr ai monitoring, seo ai tools',
  alternates: { canonical: '/use-cases' },
  openGraph: {
    title: 'Use Cases — How Teams Use Livesov for AI Visibility | Livesov',
    description:
      'Real-world use cases for AI visibility tracking across SaaS, agencies, e-commerce, enterprise, PR, and SEO teams.',
    url: 'https://livesov.com/use-cases',
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Use Cases — How Teams Use Livesov for AI Visibility | Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Use Cases — How Teams Use Livesov for AI Visibility | Livesov',
    description:
      'See how SaaS, agencies, e-commerce, enterprise, PR, and SEO teams use Livesov to track AI visibility.',
    images: ['https://livesov.com/og-image.png'],
  },
};

const personaFeatures = [
  {
    icon: '⬢',
    title: 'SaaS founders & product marketers',
    description:
      'Know the day AI starts recommending your product alongside the incumbent — a leading indicator of category entry, weeks before pipeline catches up.',
  },
  {
    icon: '◑',
    title: 'Digital marketing agencies',
    description:
      'Add AI visibility tracking to client engagements. White-label reports, multi-brand dashboards, and a new measurable deliverable for retainers.',
  },
  {
    icon: '✸',
    title: 'E-commerce & DTC brands',
    description:
      'Monitor how AI shopping assistants recommend your products, catch sentiment shifts post-launch, and ensure product facts stay accurate as catalogs change.',
  },
  {
    icon: '✺',
    title: 'Enterprise marketing teams',
    description:
      'Protect brand reputation across AI surfaces. Catch hallucinations early, benchmark against named competitors, deliver board-ready visibility reports.',
  },
  {
    icon: '⟁',
    title: 'PR & communications teams',
    description:
      'Detect when stories propagate into AI answers, monitor crisis spread inside Grok in real-time, and map analyst coverage to AI citations.',
  },
  {
    icon: '◭',
    title: 'SEO & content professionals',
    description:
      'Extend the SEO toolkit into AI search. Measure whether your content earns Perplexity citations, Gemini AI Overviews inclusion, and ChatGPT mentions.',
  },
];

const stats = [
  { value: '5', label: 'AI platforms covered' },
  { value: '20', label: 'Competitors benchmarked' },
  { value: '24/7', label: 'Automated monitoring' },
  { value: '7-day', label: 'Free trial, no card' },
];

const faqs = [
  {
    question: 'Does Livesov work for B2B and B2C brands equally well?',
    answer:
      'Yes. The metrics — mention rate, share of voice, rank, sentiment, citations, hallucinations — are universal. B2B brands typically weight Claude, Perplexity, and ChatGPT (research-heavy buyers); consumer brands weight Gemini (AI Overviews) and Grok (social signal) more heavily. Livesov tracks all five for both.',
  },
  {
    question: 'Is Livesov agency-friendly?',
    answer:
      'Yes. The Agency plan supports multi-brand tracking under one workspace, white-labeled PDF reports for client deliverables, team seats with role-based access, and a partner program with 20–30% recurring commissions. See our /partners page for details.',
  },
  {
    question: 'Can a single person manage this, or do I need a team?',
    answer:
      'Single operator is the most common pattern. Setup is ~5 minutes per brand and Livesov runs automatically after that. Most teams check the dashboard 1–2× per week and respond to email alerts as they come in.',
  },
  {
    question: 'How does Livesov fit alongside Ahrefs / Semrush / Google Analytics?',
    answer:
      'Livesov is the missing AI layer, not a replacement. Ahrefs and Semrush cover backlinks and Google rankings; GA covers on-site analytics. Livesov covers what AI platforms say about you — a measurement none of those tools can produce. Most customers use all three.',
  },
  {
    question: 'How is Livesov priced for agencies managing multiple brands?',
    answer:
      'The Agency plan includes multiple brands, multiple seats, white-label reports, and higher monthly credits. For unusual scale or custom integrations, the contact page connects you with a tailored plan.',
  },
  {
    question: 'What does a typical first-month workflow look like?',
    answer:
      'Week 1: set up brand, approve prompts, launch monitoring. Week 2: review baseline visibility across all 5 platforms, identify the biggest gaps. Weeks 3–4: ship targeted content/PR/citation improvements. Week 5 onwards: measure impact and iterate. Most teams see meaningful visibility shifts within 4–8 weeks.',
  },
];

export default function UseCasesPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Use Cases', url: '/use-cases' }]} />

      <SeoHero
        title={
          <>
            Who uses <span className="text-[var(--brand)]">Livesov</span>?
          </>
        }
        subtitle="From early-stage SaaS founders to enterprise brand teams, marketing agencies, PR firms, and SEO consultants — every team responsible for AI-era brand visibility uses Livesov as the measurement layer."
        ctaText="Start free — no card"
      />

      <Section pad="0 24px 56px" width={1000}>
        <StatsBar stats={stats} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="80px 24px">
        <SectionHeader
          label="Personas"
          title="Six teams, one shared problem"
          subtitle="AI answers now shape buying decisions — and they&rsquo;re invisible without a tool like Livesov. Here&rsquo;s how each persona uses it."
        />
        <FeatureGrid items={personaFeatures} columns={3} />
      </Section>

      <Section pad="80px 24px">
        <LongForm>
          <h2>SaaS companies: measuring AI as a growth channel</h2>
          <p>
            Modern SaaS buyers ask ChatGPT, Claude, and Perplexity for vendor recommendations
            before they ever land on a comparison site. For early-stage SaaS, the day AI
            starts naming you alongside the incumbent is a leading indicator that
            category-entry pipeline is coming — usually 4–8 weeks ahead of demo requests.
          </p>
          <p>
            For mature SaaS, Livesov is the early-warning system for share-of-voice erosion.
            When a fast-growing competitor starts winning &quot;X vs Y&quot; prompts on Claude,
            you see it weeks before your win-rate tells you the same story. The Pricing,
            Comparison, and &quot;best for [persona]&quot; prompt families are usually the
            highest-signal places to monitor.
          </p>

          <h2>Marketing agencies: a new measurable deliverable</h2>
          <p>
            Agencies live or die on measurable outcomes. AI visibility tracking is the rare
            new deliverable that&apos;s both novel (most clients have no idea what it is) and
            measurable (mention rate, share of voice, rank, citations). It slots cleanly into
            content, SEO, and PR retainers — and gives the agency a defensible &quot;why we
            shipped this&quot; data point in every monthly review.
          </p>
          <p>
            Livesov&apos;s Agency plan was built for this: multi-brand workspaces, white-label
            PDF reports for client delivery, team seats with role-based access, and a partner
            program that pays recurring commissions on referrals. Many agencies run Livesov
            as a packaged add-on (&quot;AI visibility tier&quot;) at a fixed monthly markup.
          </p>

          <h2>E-commerce & DTC: surviving AI shopping assistants</h2>
          <p>
            AI shopping is already here. ChatGPT, Gemini, and Perplexity all recommend
            specific products in response to category queries. The brands that show up
            consistently in those answers are the ones whose product data is structured,
            well-attributed, and reflected across the third-party sources AI trusts (reviews,
            roundups, comparison sites).
          </p>
          <p>
            Livesov tells you which categories you win, which you lose, what competitor
            products AI surfaces alongside yours, and where AI fabricates pricing, SKUs, or
            specs that could damage trust. The hallucination detector is especially valuable
            here: catalogs change constantly, and AI is months behind unless you push
            corrections out.
          </p>

          <h2>Enterprise: governance, reputation, board reporting</h2>
          <p>
            Enterprise marketing teams need three things from AI visibility: continuous
            measurement, defensible reporting, and the ability to act on regressions before
            they appear in earnings calls. Livesov delivers all three — with audit-grade
            evidence on every metric, board-ready PDF reports, and email alerts when share-
            of-voice swings outside configured bands.
          </p>
          <p>
            The hallucination detector is the killer feature for regulated industries. A
            financial-services brand whose pricing is misstated by ChatGPT, or a healthcare
            brand whose indications are inverted by Gemini, has a real compliance exposure.
            Livesov catches it before a customer does.
          </p>

          <h2>PR & communications: AI as a propagation channel</h2>
          <p>
            Modern PR cycles end inside AI answers. A favorable press hit or a damaging story
            propagates into ChatGPT, Claude, Gemini, and especially Grok within days. PR
            teams use Livesov to confirm whether a placement actually moved AI sentiment, to
            detect when a crisis is metastasising inside AI outputs, and to attribute AI
            visibility shifts back to specific media moments.
          </p>
          <p>
            Grok tracking is especially useful here because of the live-X-data grounding —
            it&apos;s the fastest AI to absorb a viral moment and the most diagnostic of which
            social posts drove which AI answers.
          </p>

          <h2>SEO professionals: the new SERP is an AI answer</h2>
          <p>
            Traditional SEO measured 10 blue links. The new SERP is one AI Overview at the
            top, then 10 links, then a second AI block. The SEO professionals who win in the
            next five years are the ones who treat AI answers as a first-class ranking
            target — and that requires a measurement system tracking AI directly, not a
            backlink tool retrofitted with an AI sidebar.
          </p>
          <p>
            Livesov sits next to Ahrefs and Semrush in the modern SEO stack. The two together
            give you full coverage: traditional rankings + AI answers, plus the citation
            data that explains why AI surfaces specific URLs over others.
          </p>

          <Callout title="The common pattern" variant="info">
            Every persona above runs the same loop: <strong>measure baseline → identify
            biggest gap → ship targeted improvement → re-measure in next cycle</strong>.
            Livesov is the measurement layer. Your team is the action layer. The brands that
            move fastest are the ones that close the loop weekly.
          </Callout>
        </LongForm>
      </Section>

      <FaqSection
        title="Use cases — FAQ"
        subtitle="Common questions from teams evaluating Livesov for their specific role."
        items={faqs}
      />

      <PillarLinks
        title="Get started for your team"
        links={[
          {
            href: '/pricing',
            label: 'See plans & pricing',
            description: 'From solo founders to multi-brand agencies.',
          },
          {
            href: '/partners',
            label: 'Agency partner program',
            description: 'Recurring commissions, white-label, dedicated support.',
          },
          {
            href: '/chatgpt-brand-tracking',
            label: 'ChatGPT brand tracking',
            description: 'Methodology for ChatGPT specifically.',
          },
          {
            href: '/geo-optimization',
            label: 'GEO optimization guide',
            description: 'The framework for actually improving AI visibility.',
          },
          {
            href: '/geo-audit',
            label: 'Free GEO audit',
            description: 'Score any URL for AI citation-readiness.',
          },
          {
            href: '/contact',
            label: 'Talk to us',
            description: 'Custom plans, enterprise, and partner inquiries.',
          },
        ]}
      />
    </SeoLayout>
  );
}
