import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { Section, FaqSection, LongForm, JsonLd } from '@/components/seo/SeoSections';

const PATH = '/uses/ai-visibility-for-local-businesses';
const PAGE_URL = `https://livesov.com${PATH}`;
const TITLE = 'AI Visibility for Local Businesses | Track ChatGPT & Gemini | Livesov';
const DESCRIPTION =
  'AI visibility for local businesses starts with knowing if ChatGPT, Gemini and Perplexity recommend you. Livesov checks it daily. Start free.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords:
    'ai visibility for local businesses, local business chatgpt visibility, near me prompts ai, local seo ai search, nap consistency ai, google business profile ai',
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
        alt: 'AI visibility for local businesses with Livesov',
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
    question: 'What is AI visibility for a local business?',
    answer:
      'It is how often AI assistants like ChatGPT, Gemini and Perplexity name your business when someone asks for a service in your city. Livesov runs those prompts on a schedule and records who gets named.',
  },
  {
    question: 'Can I track near me prompts for one city?',
    answer:
      'Yes. You add your service and city, and Livesov suggests local prompts such as "best plumber near me in Austin". You can edit the list and add your own.',
  },
  {
    question: 'Does NAP consistency affect AI answers?',
    answer:
      'AI tools pull from the same directories and listings that local SEO relies on. When your name, address and phone differ across those sources, the AI has less reason to trust you. The free NAP verification tool shows where they differ.',
  },
];

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'AI Visibility for Local Businesses',
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

export default function AiVisibilityForLocalBusinessesPage() {
  return (
    <SeoLayout>
      <Breadcrumbs
        items={[
          { name: 'Use Cases', url: '/uses' },
          { name: 'AI Visibility for Local Businesses', url: PATH },
        ]}
      />
      <JsonLd data={webPageSchema} />

      <SeoHero
        title="AI Visibility for Local Businesses"
        subtitle="Find out if ChatGPT, Gemini and Perplexity recommend your business when people in your city ask for your service. Built for local SEO agencies and the owners they work with."
        ctaText="Start free"
        ctaHref="/signup"
      />

      <Section pad="0 24px 56px" width={1000}>
        <Image
          src="/dashboard-shot.png"
          alt="AI visibility for local businesses dashboard"
          width={924}
          height={540}
          priority
          style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--card-border, #e8e5e1)' }}
        />
      </Section>

      <Section pad="24px 24px 80px">
        <LongForm>
          <p>
            AI visibility for local businesses means one thing: when someone asks ChatGPT or Gemini
            for a plumber, dentist or roofer in their town, does your name come up? More people now
            ask an AI assistant before they open Google Maps. If the AI names three competitors and
            not you, that lead is gone before your Google Business Profile ever loads.
          </p>
          <p>
            Livesov tracks this for you. It asks ChatGPT, Gemini, Perplexity, Claude and Grok the
            same local questions your customers ask, on a schedule, and shows you the answers.
          </p>

          <h2>See if AI recommends you in your city</h2>
          <p>
            Start with your service and your city. Livesov suggests near me prompts and city
            prompts, like &ldquo;best emergency electrician near me in Tampa&rdquo; or &ldquo;who
            does same day AC repair in Mesa&rdquo;. You can keep them, edit them or write your own.
          </p>
          <p>
            Each run records whether your business was named, where it showed up in the answer,
            and what the AI said about you. Paid plans run automatically, up to once a day, so
            you see a trend and not one lucky (or unlucky) answer.
          </p>

          <h2>Who AI recommends instead</h2>
          <p>
            When you are missing, someone else is being named. Livesov lists the other businesses
            that show up in the same answers and how often. Add your known local competitors and
            you can compare share of voice side by side, prompt by prompt.
          </p>
          <p>
            This is often the most useful view for an owner. It turns &ldquo;AI does not mention
            us&rdquo; into &ldquo;AI names these two shops for this service in this part of
            town&rdquo;, which is something you can act on.
          </p>

          <h2>Fix the citations AI trusts (NAP)</h2>
          <p>
            AI answers often cite the sources behind them: directories, review sites, local news
            and your own site. Livesov captures those cited domains so you can see which sources
            the AI leans on for your category and city.
          </p>
          <p>
            Many of those sources are the same citations local SEO has always cared about. If your
            name, address and phone (NAP) do not match across them, the AI has mixed signals about
            who you are. Check your listings with the free{' '}
            <Link href="/tools/nap-verification">NAP verification tool</Link>, then make sure your
            Google Business Profile, website and main directories all say the same thing.
          </p>

          <h2>Reports you can send to the owner</h2>
          <p>
            Agencies need proof they can share. On Pro and above, Livesov exports a PDF report with
            share of voice, the platform breakdown, top prompts, competitors, cited sources and
            suggested next steps. You can also schedule a fresh PDF weekly or monthly so it is
            ready before every client call.
          </p>
          <p>
            Each client gets their own brand in your account, with their own prompts, competitors
            and history, so nothing gets mixed up.
          </p>
          <p>
            <Link href="/signup">Start free</Link> and run your first local prompts in a few
            minutes. No card needed for the trial.
          </p>
        </LongForm>
      </Section>

      <FaqSection title="AI visibility for local businesses: FAQ" items={faqs} />

      <Section pad="56px 24px 80px" width={820}>
        <div style={{ textAlign: 'center' }}>
          <Link href="/signup" className="land-btn land-btn-primary" style={{ padding: '14px 36px', fontSize: 16 }}>
            Check your local AI visibility free
          </Link>
        </div>
      </Section>
    </SeoLayout>
  );
}
