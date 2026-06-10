import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import {
  Section,
  SectionHeader,
  FeatureGrid,
  ProcessSteps,
  FaqSection,
  Callout,
  LongForm,
  PillarLinks,
} from '@/components/seo/SeoSections';

export const metadata: Metadata = {
  title: 'AI Visibility Report Template (Free Google Doc + Notion + PDF) | Livesov',
  description:
    'A board-ready monthly AI visibility report template - mention rate, citation share, sentiment, rank across ChatGPT, Claude, Gemini, Perplexity, and Grok. Free download.',
  keywords:
    'ai visibility report template, ai visibility template, geo report template, llm seo report template, chatgpt mention report, ai search report template',
  alternates: { canonical: '/resources/ai-visibility-report-template' },
  openGraph: {
    title: 'AI Visibility Report Template - Free Download',
    description:
      'Board-ready monthly report covering mention rate, citation share, sentiment, and rank across all five major LLMs.',
    url: 'https://livesov.com/resources/ai-visibility-report-template',
    siteName: 'Livesov',
    type: 'article',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI Visibility Report Template - Free Download',
      },
    ],
  },
};

const inside = [
  {
    icon: '◐',
    title: 'Executive summary',
    description: 'One-page leadership view: overall mention rate, biggest delta, the single number that defines this month\'s narrative.',
  },
  {
    icon: '◑',
    title: 'Mention rate per LLM',
    description: 'Per-platform mention rate trends for ChatGPT, Claude, Gemini, Perplexity, and Grok over the trailing 90 days.',
  },
  {
    icon: '◒',
    title: 'Share of voice vs. competitors',
    description: 'Your share against named competitors with a configurable competitor set.',
  },
  {
    icon: '◓',
    title: 'Citation share',
    description: 'On grounded surfaces, what percentage of cited sources came from your domain - and which competitors took the rest.',
  },
  {
    icon: '◔',
    title: 'Sentiment trend',
    description: 'Net sentiment over time, with drill-down on the prompts driving any negative shift.',
  },
  {
    icon: '◕',
    title: 'Action items',
    description: 'A prioritised list of the next 3 highest-leverage interventions based on the month\'s data.',
  },
];

const steps = [
  { title: 'Download the template', description: 'Pick Google Doc, Notion, or PDF - all three contain the same structure.' },
  { title: 'Fill the cover page', description: 'Brand, reporting period, scope (which LLMs, which competitor set, which prompt panel).' },
  { title: 'Paste in the numbers', description: 'If you use Livesov, every cell auto-fills via CSV export. Manual filling takes 30–45 minutes per month.' },
  { title: 'Write the executive summary', description: 'The single most important page. Headline number, biggest delta, what changed.' },
  { title: 'Distribute', description: 'Send to leadership monthly; archive in your reporting drive for trend analysis.' },
];

const faqs = [
  {
    question: 'Is the template really free?',
    answer:
      'Yes - Google Doc, Notion duplicate link, and a print-friendly PDF are all free. We ask for an email so we can notify you when the template is updated, but you can opt out.',
  },
  {
    question: 'Do I need Livesov to use the template?',
    answer:
      'No. The template is platform-agnostic. If you use Livesov, every cell auto-fills via export; if you use another tool or measure manually, the template still works - you fill it in by hand.',
  },
  {
    question: 'How often should I publish this report?',
    answer:
      'Monthly is the standard cadence for B2B SaaS, agencies, and mid-size brands. Larger orgs sometimes go bi-weekly during active campaigns. Quarterly is the minimum to spot meaningful trends.',
  },
  {
    question: 'Who should read this report?',
    answer:
      'CMOs, heads of marketing, growth leads, and SEO/content leads. The executive summary is built for leadership; the appendices are for the practitioner driving the work.',
  },
  {
    question: 'What if my brand is new and the numbers are tiny?',
    answer:
      'Report them anyway. The trajectory matters more than the absolute number - a brand growing from 4% to 18% mention rate in 90 days has a stronger story than a flat brand sitting at 70%.',
  },
];

export default function AiVisibilityReportTemplatePage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Resources', url: '/resources' },
          { name: 'AI Visibility Report Template', url: '/resources/ai-visibility-report-template' },
        ]}
      />

      <SeoHero
        title={
          <>
            AI Visibility Report{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand)] to-[#6366f1]">
              Template
            </span>
          </>
        }
        subtitle="A board-ready monthly report covering mention rate, citation share, sentiment, and rank across ChatGPT, Claude, Gemini, Perplexity, and Grok. Free Google Doc, Notion, and PDF."
        ctaText="Get the template"
        ctaHref="#download"
      />

      <Section pad="0 24px 56px">
        <div id="download" style={{ maxWidth: 620, margin: '0 auto' }}>
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--card-border, #e8e5e1)',
              borderRadius: 16,
              padding: 32,
            }}
          >
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary)' }}>
              Send me the template
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
              We&apos;ll email all three formats (Google Doc, Notion, PDF) and notify you when the
              template is updated. Unsubscribe anytime.
            </p>
            <form
              action="/api/newsletter"
              method="POST"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <input
                type="hidden"
                name="source"
                value="ai-visibility-report-template"
              />
              <input
                type="email"
                name="email"
                required
                placeholder="you@company.com"
                style={{
                  fontSize: 15,
                  padding: '14px 16px',
                  border: '1px solid var(--card-border, #e8e5e1)',
                  borderRadius: 10,
                  outline: 'none',
                  width: '100%',
                }}
              />
              <button
                type="submit"
                className="land-btn land-btn-primary"
                style={{ padding: '14px 24px', fontSize: 15 }}
              >
                Send the template
              </button>
            </form>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '14px 0 0', textAlign: 'center' }}>
              Already a Livesov user? Sign in - the template is in your{' '}
              <Link href="/dashboard/reports" style={{ color: 'var(--brand, #6366f1)' }}>
                Reports
              </Link>{' '}
              tab.
            </p>
          </div>
        </div>
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="72px 24px">
        <SectionHeader
          label="What's inside"
          title="Six sections, one page each"
          subtitle="Designed to fit a single screen per topic so leadership can scan, not read."
        />
        <FeatureGrid items={inside} columns={3} />
      </Section>

      <Section pad="72px 24px">
        <SectionHeader
          label="How to use it"
          title="From download to first published report"
        />
        <ProcessSteps steps={steps} />
      </Section>

      <Section background="var(--bg-section, #f7f5f1)" pad="64px 24px">
        <LongForm>
          <h2>Why this exists</h2>
          <p>
            We talked to dozens of marketing leaders running AI visibility programs and almost
            none of them had a standard report. Some were copy-pasting Livesov screenshots into
            decks; others were writing Notion docs from scratch every month. None of them had a
            board-ready single view.
          </p>
          <p>
            This template is what we wish we had - six pages, plain English, numbers-first.
            Tweak it, fork it, brand it, ship it.
          </p>

          <Callout title="Pair the template with continuous tracking" variant="tip">
            The template is data-agnostic, but it sings when you back it with continuous,
            multi-platform measurement. <a href="/signup">Start Livesov free</a> - every cell in
            the template auto-fills from your account.
          </Callout>
        </LongForm>
      </Section>

      <FaqSection
        title="Template FAQ"
        items={faqs}
      />

      <PillarLinks
        title="Adjacent resources"
        links={[
          { href: '/resources', label: 'All resources', description: 'Templates, calculators, and playbooks.' },
          { href: '/learn/llm-seo', label: 'LLM SEO playbook', description: 'The full operating model the report measures against.' },
          { href: '/case-studies', label: 'Case studies', description: 'Real teams using these reports to drive programs.' },
          { href: '/ai-search-statistics-2026', label: 'AI search statistics 2026', description: 'Numbers to contextualise your own report.' },
        ]}
      />
    </SeoLayout>
  );
}
