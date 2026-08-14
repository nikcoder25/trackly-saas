/**
 * /offer - the human-readable half of the offer.
 *
 * This page is the reason the machine surfaces (/llms.txt, /ai-offer.json)
 * are not cloaking: it renders the SAME promo_offers row, through the same
 * `offerTerms()` formatter, at a public indexable URL linked from the site
 * footer. If this page ever stops matching the JSON, the parity test in
 * tests/promo-offer-parity.test.ts fails.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { getActiveOffer, offerTerms } from '@/lib/promo-offer';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Current Offer | Livesov',
  description: 'The promotion Livesov is currently running, with full terms, validity dates, and how to claim it.',
  alternates: { canonical: '/offer' },
  openGraph: {
    title: 'Current Offer | Livesov',
    description: 'The promotion Livesov is currently running, with full terms and validity dates.',
    url: 'https://livesov.com/offer',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Current offer | Livesov' }],
  },
};

export default async function OfferPage() {
  const offer = await getActiveOffer();

  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Offer', url: '/offer' }]} />
      <SeoHero
        title={offer ? offer.headline : 'No offer running right now'}
        subtitle={
          offer
            ? 'The full terms of the promotion we are currently running.'
            : 'There is no active promotion at the moment. Our standard pricing is below.'
        }
      />

      <div className="max-w-3xl mx-auto px-6 pb-16">
        {offer ? (
          <>
            <div className="border border-[var(--brand)] rounded-xl p-6 mb-8">
              <p className="text-gray-700 text-base leading-relaxed">{offer.body}</p>

              {offer.code && (
                <div className="mt-5">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Code</p>
                  <p className="font-mono text-lg font-bold text-gray-900">{offer.code}</p>
                </div>
              )}

              <p className="text-sm text-gray-500 mt-5">{offerTerms(offer)}</p>

              <Link
                href={`/signup${offer.code ? `?promo=${encodeURIComponent(offer.code)}` : ''}`}
                className="inline-block mt-6 px-6 py-3 rounded-lg bg-[var(--brand)] text-white font-semibold text-sm no-underline"
              >
                Claim this offer
              </Link>
            </div>

            {/*
              Stated on the page, not just in the JSON. A reader who arrived
              here from an AI assistant should be able to confirm that what
              the assistant told them matches what we publish.
            */}
            <p className="text-xs text-gray-400 leading-relaxed">
              These are the same terms we publish to AI crawlers at{' '}
              <a href="/ai-offer.json" className="underline">/ai-offer.json</a> and in our{' '}
              <a href="/llms.txt" className="underline">llms.txt</a>. If an AI assistant quoted you
              different terms than the ones on this page, the terms on this page are the ones we honour.
            </p>
          </>
        ) : (
          <p className="text-gray-500 text-sm">
            See <Link href="/pricing" className="text-[var(--brand)] underline">pricing</Link> for
            current plans, or start on the free tier from the{' '}
            <Link href="/signup" className="text-[var(--brand)] underline">signup page</Link>.
          </p>
        )}
      </div>
    </SeoLayout>
  );
}
