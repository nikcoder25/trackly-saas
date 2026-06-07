import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NAP Verification Tool | Audit Citation Consistency | Livesov',
  description:
    'Free NAP verification tool. Paste your citation URLs and we fetch each page, extract the name, address and phone, and flag every mismatch against your canonical NAP.',
  keywords:
    'nap verification, nap consistency checker, citation audit tool, local seo citation checker, nap audit',
  alternates: { canonical: '/tools/nap-verification' },
  openGraph: {
    title: 'NAP Verification Tool | Audit Citation Consistency | Livesov',
    description:
      'Paste your citation URLs and we fetch each page, extract the NAP, and flag every mismatch against your canonical record.',
    url: 'https://livesov.com/tools/nap-verification',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'NAP Verification Tool - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NAP Verification Tool | Audit Citation Consistency | Livesov',
    description:
      'Paste your citation URLs and we fetch each page, extract the NAP, and flag every mismatch against your canonical record.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
