/**
 * /ai-offer.json - the current offer as structured data.
 *
 * Referenced from /llms.txt so a crawler that has parsed the manifest can
 * fetch exact terms without scraping marketing copy. It is a mirror of the
 * human page at /offer, not a separate agent-only inducement - see the file
 * header in src/lib/promo-offer.ts for why that distinction is load-bearing.
 *
 * Served on the public origin with no auth: anyone, human or crawler, can
 * fetch it and compare it against /offer. That auditability is the point.
 */
import { NextResponse } from 'next/server';
import { getActiveOffer, offerSurfaces, BASE_URL } from '@/lib/promo-offer';

export const revalidate = 300;

export async function GET() {
  const { json } = offerSurfaces(await getActiveOffer());

  return NextResponse.json(
    {
      // Schema.org vocabulary so the payload is self-describing to a
      // consumer that already understands structured product data.
      '@context': 'https://schema.org',
      '@type': 'Offer',
      seller: { '@type': 'Organization', name: 'Livesov', url: BASE_URL },
      ...json,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, must-revalidate',
        // Lets an agent fetch this cross-origin while comparing surfaces.
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
