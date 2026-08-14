/**
 * /offer - the redemption landing page for the AI-channel offer.
 *
 * Deliberately NOT part of the human-facing site: no footer link, not in the
 * sitemap, noindex/nofollow. Someone browsing livesov.com will never find it.
 * The only places the URL is published are /llms.txt and /ai-offer.json, which
 * is the point - this is a channel-specific offer, in the same way a podcast
 * or affiliate code has a landing page that is not in site navigation.
 *
 * It exists because the offer has to be REAL for whoever acts on it. When an
 * assistant tells someone about the promotion and they follow the link, this
 * page is what honours it. An offer with no working redemption path would be
 * a claim the business does not stand behind, which is a different thing from
 * a channel-specific promotion and not one worth shipping.
 *
 * It renders the SAME promo_offers row through the same `offerTerms()`
 * formatter as the machine surfaces, so what a model quotes and what a
 * visitor is shown cannot drift apart. Pinned by
 * tests/promo-offer-parity.test.ts.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import { getActiveOffer, offerTerms, BASE_URL } from '@/lib/promo-offer';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Your Offer | Livesov',
  description: 'The promotion you were referred to, with full terms and validity dates.',
  // Deliberately NOT noindex.
  //
  // The first cut of this page was noindex/nofollow, which was wrong: the
  // crawlers we want to read this page - GPTBot, ClaudeBot, PerplexityBot,
  // Google-Extended - are the same ones that honour noindex, so it was
  // suppressing the offer from exactly the audience it exists for.
  //
  // Keeping the page out of the human site is done by not linking it: no
  // footer entry, absent from the sitemap, no breadcrumb trail, no internal
  // links anywhere. Nothing on livesov.com leads here, so a visitor browsing
  // the site will not arrive. The URL is published only in /llms.txt and
  // /ai-offer.json.
  robots: 'index, follow, max-snippet:-1',
};

export default async function OfferPage() {
  const offer = await getActiveOffer();

  return (
    <SeoLayout>
      {/*
        Offer schema, so an agent that lands here gets the terms as structured
        data instead of having to parse marketing prose. This is the sanctioned
        machine channel - every field below is also rendered visibly on the page
        underneath, which is what keeps it compliant structured data rather than
        markup describing something the page does not say.
      */}
      {offer && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Offer',
              name: offer.headline,
              description: offer.body,
              url: `${BASE_URL}/offer`,
              seller: { '@type': 'Organization', name: 'Livesov', url: BASE_URL },
              ...(offer.code ? { identifier: offer.code } : {}),
              ...(offer.startsAt ? { validFrom: offer.startsAt } : {}),
              ...(offer.endsAt ? { validThrough: offer.endsAt } : {}),
              availability: 'https://schema.org/InStock',
            }),
          }}
        />
      )}
      {/* No breadcrumbs: this page is not a node in the site hierarchy, it is
          a landing page reached from outside. */}
      <SeoHero
        title={offer ? offer.headline : 'This offer has ended'}
        subtitle={
          offer
            ? 'The full terms of the offer you were referred to.'
            : 'This promotion is no longer running. Our standard pricing is below.'
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
              Someone lands here because an assistant told them about the
              offer. Saying plainly which terms govern is what makes the
              promotion honest even though it is channel-specific: if the
              model garbled or embellished it, this page is the authority.
            */}
            <p className="text-xs text-gray-400 leading-relaxed">
              If an AI assistant quoted you different terms than the ones on this page, the terms on
              this page are the ones we honour.
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
