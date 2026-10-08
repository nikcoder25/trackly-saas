import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

const PATH = '/uses/ai-visibility-for-roofers';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'AI Visibility for Roofers | ChatGPT & Gemini | Livesov';
const DESCRIPTION =
  'AI visibility for roofers: see if ChatGPT and Gemini recommend you for roof repair, storm damage and replacement prompts in your city. Start free.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    'ai visibility for roofers, roofing company chatgpt visibility, roofing ai search, roof repair near me ai, roofing marketing agency ai visibility',
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
        alt: 'AI visibility for roofers with Livesov',
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
    question: 'Which AI tools does Livesov check for roofing prompts?',
    answer:
      'ChatGPT, Gemini, Perplexity, Claude and Grok. The Agency plan tracks all five. Lower plans track two or three.',
  },
  {
    question: 'Can I track storm season prompts?',
    answer:
      'Yes. Add prompts such as hail damage roof inspection in your city before storm season, then watch who AI names as demand spikes.',
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
  name: 'AI Visibility for Roofers',
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

export default function AiVisibilityForRoofersPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Use Cases', url: '/uses' },
          { name: 'AI Visibility for Roofers', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="AI Visibility for Roofers"
        subtitle="See if ChatGPT and Gemini recommend your roofing company when homeowners in your city need a leak fixed, storm damage checked or a new roof."
        ctaText="Start free"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="AI visibility for roofers dashboard"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 80px">
        <LongForm>
          <p>
            AI visibility for roofers matters because a roof is a big, rare purchase. Homeowners
            now ask ChatGPT which roofing companies to trust before they ask for quotes, and the
            two or three names it gives become the shortlist. Livesov shows you if you are on it.
          </p>

          <h2>Prompts homeowners really ask</h2>
          <p>
            Roofing prompts are long and specific, like &ldquo;roof leaking after the storm, who can
            tarp it today in Dallas&rdquo; or &ldquo;trusted metal roof installer near me in
            Nashville&rdquo;. Insurance shows up too: &ldquo;roofers who work with insurance claims
            for hail damage&rdquo;. Livesov suggests prompts like these for your services and city,
            and you can add your own.
          </p>
          <p>
            Split repair, replacement, inspection and commercial roofing into separate prompts. AI
            often trusts different companies for each.
          </p>

          <h2>Who AI picks in your city</h2>
          <p>
            For every prompt, Livesov records which roofing companies the AI named and in what
            order. You see if you were mentioned, who was picked instead, and how your share of
            voice changes after a storm or a review push. Paid plans run the checks automatically.
          </p>
          <p>
            Add the roofers you lose bids to as competitors. Then you can see, prompt by prompt,
            where AI already favors them.
          </p>

          <h2>Citations that move the needle</h2>
          <p>
            AI answers about roofers lean on review sites, shingle brand installer directories,
            the BBB and local news. Livesov captures the domains cited in each answer, so you know
            which listings to fix first. Check that your name, address and phone match everywhere with the free{' '}
            <Link href="/tools/nap-verification">NAP verification tool</Link>, and keep your Google
            Business Profile photos and services current.
          </p>

          <h2>Built for roofing marketing agencies</h2>
          <p>
            If you market several roofing businesses, each one gets its own brand with
            separate prompts, competitors and history. Pro and Agency plans export a PDF report
            with share of voice, competitors and cited sources for the monthly call. See also{' '}
            <Link href="/uses/ai-visibility-for-local-businesses">AI visibility for local businesses</Link>{' '}
            and <Link href="/solutions/agencies">Livesov for agencies</Link>.
          </p>
          <p>
            <Link href="/signup">Start free</Link> and see your first roofing prompts checked
            in a few minutes.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="AI visibility for roofers: FAQ" items={faqs} />

      <Section pad="56px 24px 80px" width={820}>
        <div style={{ textAlign: 'center' }}>
          <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
            Check your roofing AI visibility free
          </Link>
        </div>
      </Section>
    </SeoLayout>
  );
}
