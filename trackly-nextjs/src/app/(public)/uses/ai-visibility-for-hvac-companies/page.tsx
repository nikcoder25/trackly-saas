import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

const PATH = '/uses/ai-visibility-for-hvac-companies';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'AI Visibility for HVAC Companies | ChatGPT & Gemini | Livesov';
const DESCRIPTION =
  'AI visibility for HVAC companies: see if ChatGPT and Gemini recommend you for AC repair and furnace prompts in your city. Start free.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    'ai visibility for hvac companies, hvac chatgpt visibility, hvac ai search, ac repair near me ai, hvac marketing agency ai visibility',
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
        alt: 'AI visibility for HVAC companies with Livesov',
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
    question: 'Which AI tools does Livesov check for HVAC prompts?',
    answer:
      'ChatGPT, Gemini, Perplexity, Claude and Grok. The Agency plan tracks all five. Lower plans track two or three.',
  },
  {
    question: 'Can I track more than one city or service area?',
    answer:
      'Yes. Write a prompt for each city or service you care about, such as AC repair in one town and furnace install in the next.',
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
  name: 'AI Visibility for HVAC Companies',
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

export default function AiVisibilityForHvacCompaniesPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Use Cases', url: '/uses' },
          { name: 'AI Visibility for HVAC Companies', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="AI Visibility for HVAC Companies"
        subtitle="See if ChatGPT and Gemini recommend your HVAC company when homeowners in your city need AC repair or a new furnace."
        ctaText="Start free"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="AI visibility for HVAC companies dashboard"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 80px">
        <LongForm>
          <p>
            AI visibility for HVAC companies is about one question: when a homeowner asks ChatGPT
            who to call for a broken AC, is your company in the answer? Those jobs are urgent and
            the homeowner often calls the first name they see. Livesov shows you whether that name
            is yours.
          </p>

          <h2>Prompts homeowners really ask</h2>
          <p>
            Homeowners do not type keywords into AI. They ask full questions, like &ldquo;my AC is
            blowing warm air, who can fix it today in Phoenix&rdquo; or &ldquo;best furnace
            replacement company near me in Denver&rdquo;. Livesov suggests prompts like these
            for your services and city, and you can add your own for heat pumps, duct cleaning or
            maintenance plans.
          </p>
          <p>
            Mix emergency prompts (&ldquo;AC stopped working at night&rdquo;) with planned ones
            (&ldquo;how much is a new heat pump&rdquo;). They bring different jobs, and AI often
            recommends different companies for each.
          </p>

          <h2>Who AI picks in your city</h2>
          <p>
            For every prompt, Livesov records which HVAC companies the AI named and where. You see
            if you were mentioned, which competitors were picked instead, and how your share of
            voice changes over time. Paid plans run these checks automatically, so one odd answer
            does not decide your strategy.
          </p>
          <p>
            Add the HVAC shops you already compete with on Google Maps as competitors. Then you can
            see, prompt by prompt, where they are named and you are not.
          </p>

          <h2>Citations that move the needle</h2>
          <p>
            AI answers lean on sources such as review sites, directories, manufacturer dealer pages
            and local news. Livesov captures the domains cited in each answer, so you know which
            listings matter in your market. Start by making sure your name, address and phone
            match everywhere with the free{' '}
            <Link href="/tools/nap-verification">NAP verification tool</Link>, and keep your Google
            Business Profile complete and current.
          </p>

          <h2>Built for HVAC marketing agencies</h2>
          <p>
            If you run marketing for several HVAC contractors, each client gets its own brand with
            separate prompts, competitors and history. Pro and Agency plans export a PDF report
            with share of voice, competitors and cited sources, which you can bring to the monthly
            call. See more on{' '}
            <Link href="/uses/ai-visibility-for-local-businesses">AI visibility for local businesses</Link>{' '}
            and <Link href="/solutions/agencies">Livesov for agencies</Link>.
          </p>
          <p>
            <Link href="/signup">Start free</Link> and see your first HVAC prompts checked in a few
            minutes.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="AI visibility for HVAC companies: FAQ" items={faqs} />

      <Section pad="56px 24px 80px" width={820}>
        <div style={{ textAlign: 'center' }}>
          <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
            Check your HVAC AI visibility free
          </Link>
        </div>
      </Section>
    </SeoLayout>
  );
}
