import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

const PATH = '/uses/ai-visibility-for-plumbers';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'AI Visibility for Plumbers | ChatGPT & Gemini | Livesov';
const DESCRIPTION =
  'AI visibility for plumbers: see if ChatGPT and Gemini recommend you for burst pipe, drain and water heater prompts in your city. Start free.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    'ai visibility for plumbers, plumber chatgpt visibility, plumbing ai search, emergency plumber near me ai, plumbing marketing agency ai visibility',
  alternates: { canonical: PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    siteName: 'Livesov',
    type: 'website',
    images: [
      {
        url: 'https://livesov.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'AI visibility for plumbers with Livesov',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['https://livesov.com/og-image.png'],
  },
};

const faqs = [
  {
    question: 'Which AI tools does Livesov check for plumbing prompts?',
    answer:
      'ChatGPT, Gemini, Perplexity, Claude and Grok. The Agency plan tracks all five. Lower plans track two or three.',
  },
  {
    question: 'Can I track emergency and planned jobs separately?',
    answer:
      'Yes. Write one prompt per job type, such as burst pipe repair tonight and water heater replacement quote, and compare the results.',
  },
  {
    question: 'How often are the prompts checked?',
    answer:
      'Pro and Agency plans run every day. Starter runs every two days. You can also run a check by hand at any time.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Visibility for Plumbers',
  url: PAGE_URL,
  description: DESCRIPTION,
  isPartOf: { '@type': 'WebSite', name: 'Livesov', url: 'https://livesov.com/' },
  about: {
    '@type': 'SoftwareApplication',
    name: 'Livesov',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
  },
};

export default function AiVisibilityForPlumbersPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Use Cases', url: '/uses' },
          { name: 'AI Visibility for Plumbers', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="AI Visibility for Plumbers"
        subtitle="See if ChatGPT and Gemini recommend your plumbing company when homeowners in your city have a leak, a clogged drain or no hot water."
        ctaText="Start free"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="AI visibility for plumbers dashboard"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 80px">
        <LongForm>
          <p>
            AI visibility for plumbers comes down to one moment: a pipe bursts, the homeowner asks
            ChatGPT who can come out tonight, and AI names two or three companies. If yours is not
            one of them, that job is gone. Livesov shows you whether you are in the answer.
          </p>

          <h2>Prompts homeowners really ask</h2>
          <p>
            People in a plumbing emergency ask full questions, like &ldquo;emergency plumber open
            now in Austin&rdquo; or &ldquo;who can fix a slab leak near me&rdquo;. Planned jobs
            sound different: &ldquo;tankless water heater installer in Tampa&rdquo; or
            &ldquo;how much to repipe a house&rdquo;. Livesov suggests prompts like these for your
            services and city, and you can add your own.
          </p>
          <p>
            Track drain cleaning, water heaters, sewer lines and leak detection as separate
            prompts. AI often names a different plumber for each one.
          </p>

          <h2>Who AI picks in your city</h2>
          <p>
            For every prompt, Livesov records which plumbing companies the AI named and in what
            order. You see if you were mentioned, who was picked instead, and how your share of
            voice moves week to week. Paid plans run the checks automatically, so one odd answer
            does not drive your plan.
          </p>
          <p>
            Add the plumbers you already see in the Google Maps pack as competitors. Then you can
            spot the exact prompts where they win and you do not.
          </p>

          <h2>Citations that move the needle</h2>
          <p>
            AI leans on review sites, home service directories, licensing boards and local news
            when it picks a plumber. Livesov captures the domains cited in each answer, so you know
            which listings count in your market. Check that your name, address and phone match everywhere with the free{' '}
            <Link href="/tools/nap-verification">NAP verification tool</Link>, and keep your Google
            Business Profile hours and services current, especially if you offer 24/7 service.
          </p>

          <h2>Built for plumbing marketing agencies</h2>
          <p>
            If you market several plumbing businesses, each one gets its own brand with
            separate prompts, competitors and history. Pro and Agency plans export a PDF report
            with share of voice, competitors and cited sources for the monthly call. See also{' '}
            <Link href="/uses/ai-visibility-for-local-businesses">AI visibility for local businesses</Link>{' '}
            and <Link href="/solutions/agencies">Livesov for agencies</Link>.
          </p>
          <p>
            <Link href="/signup">Start free</Link> and see your first plumbing prompts checked
            in a few minutes.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="AI visibility for plumbers: FAQ" items={faqs} />

      <Section pad="56px 24px 80px" width={820}>
        <div style={{ textAlign: 'center' }}>
          <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
            Check your plumbing AI visibility free
          </Link>
        </div>
      </Section>
    </SeoLayout>
  );
}
