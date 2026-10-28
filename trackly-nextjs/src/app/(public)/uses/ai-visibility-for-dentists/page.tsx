import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

const PATH = '/uses/ai-visibility-for-dentists';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'AI Visibility for Dentists | ChatGPT & Gemini | Livesov';
const DESCRIPTION =
  'AI visibility for dentists: see if ChatGPT and Gemini recommend your practice for emergency, implant and family dental prompts in your city. Start free.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    'ai visibility for dentists, dental practice chatgpt visibility, dentist ai search, dentist near me ai, dental marketing agency ai visibility',
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
        alt: 'AI visibility for dentists with Livesov',
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
    question: 'Which AI tools does Livesov check for dental prompts?',
    answer:
      'ChatGPT, Gemini, Perplexity, Claude and Grok. The Agency plan tracks all five. Lower plans track two or three.',
  },
  {
    question: 'Can I track each location of a multi-location practice?',
    answer:
      'Yes. Add each location as its own brand, or write city-specific prompts for one brand, and compare where AI names you.',
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
  name: 'AI Visibility for Dentists',
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

export default function AiVisibilityForDentistsPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Use Cases', url: '/uses' },
          { name: 'AI Visibility for Dentists', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="AI Visibility for Dentists"
        subtitle="See if ChatGPT and Gemini recommend your dental practice when patients in your city look for a new dentist, an emergency visit or implants."
        ctaText="Start free"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="AI visibility for dentists dashboard"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 80px">
        <LongForm>
          <p>
            AI visibility for dentists is about being the practice ChatGPT names when someone asks
            for a dentist they can trust. Patients now ask AI before they read reviews, and a new
            patient can be worth years of visits. Livesov shows you whether your practice is in
            the answer.
          </p>

          <h2>Prompts patients really ask</h2>
          <p>
            Patients ask in plain words, like &ldquo;emergency dentist open Saturday in
            Charlotte&rdquo;, &ldquo;gentle dentist for anxious patients near me&rdquo; or
            &ldquo;dental implants cost and clinics in San Diego&rdquo;. Insurance comes up often
            too: &ldquo;dentist that takes Delta Dental near me&rdquo;. Livesov suggests prompts
            like these for your services and city, and you can add your own.
          </p>
          <p>
            Track family dentistry, emergencies, implants, Invisalign and cosmetic work as separate
            prompts. AI often recommends a different practice for each.
          </p>

          <h2>Who AI picks in your city</h2>
          <p>
            For every prompt, Livesov records which practices the AI named and in what order. You
            see if you were mentioned, who was picked instead, and how your share of voice moves
            over time. Paid plans run the checks automatically, so one odd answer does not decide
            your marketing.
          </p>
          <p>
            Add the nearby practices you compete with as competitors. Then you can see the exact
            prompts where they are recommended and you are not.
          </p>

          <h2>Citations that move the needle</h2>
          <p>
            AI answers about dentists lean on review sites, health directories, insurance provider
            lists and local news. Livesov captures the domains cited in each answer, so you know
            which profiles matter in your area. Check that your name, address and phone match everywhere with the free{' '}
            <Link href="/tools/nap-verification">NAP verification tool</Link>, and keep your Google
            Business Profile hours, services and accepted insurance current.
          </p>

          <h2>Built for dental marketing agencies</h2>
          <p>
            If you market several dental businesses, each one gets its own brand with
            separate prompts, competitors and history. Pro and Agency plans export a PDF report
            with share of voice, competitors and cited sources for the monthly call. See also{' '}
            <Link href="/uses/ai-visibility-for-local-businesses">AI visibility for local businesses</Link>{' '}
            and <Link href="/solutions/agencies">Livesov for agencies</Link>.
          </p>
          <p>
            <Link href="/signup">Start free</Link> and see your first dental prompts checked
            in a few minutes.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="AI visibility for dentists: FAQ" items={faqs} />

      <Section pad="56px 24px 80px" width={820}>
        <div style={{ textAlign: 'center' }}>
          <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
            Check your practice AI visibility free
          </Link>
        </div>
      </Section>
    </SeoLayout>
  );
}
