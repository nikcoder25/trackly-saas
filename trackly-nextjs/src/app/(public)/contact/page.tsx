import type { Metadata } from 'next';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Contact Us — Livesov',
  description: 'Get in touch with the Livesov team for support, enterprise inquiries, partnerships, or feedback.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact Us — Livesov',
    description: 'Get in touch with the Livesov team for support, enterprise inquiries, partnerships, or feedback.',
    url: 'https://livesov.com/contact',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Contact Us — Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact Us — Livesov',
    description: 'Get in touch with the Livesov team for support, enterprise inquiries, partnerships, or feedback.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function ContactPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Contact', url: '/contact' }]} />
      <SeoHero
        title="Get in Touch"
        subtitle="We'd love to hear from you. Reach out for support, enterprise plans, partnerships, or just to say hello."
      />
      <div className="max-w-xl mx-auto px-6 pb-16">
        <h2 className="sr-only">Contact Options</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 space-y-6">
          <div>
            <h3 className="font-bold text-gray-900 mb-1">General Support</h3>
            <p className="text-gray-500 text-sm">For questions about your account, billing, or features.</p>
            <p className="text-[var(--brand)] font-medium mt-1">support@livesov.com</p>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-1">Enterprise Sales</h3>
            <p className="text-gray-500 text-sm">For custom plans, volume pricing, and enterprise features.</p>
            <p className="text-[var(--brand)] font-medium mt-1">sales@livesov.com</p>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mb-1">Partnerships</h3>
            <p className="text-gray-500 text-sm">For integration partnerships and reseller opportunities.</p>
            <p className="text-[var(--brand)] font-medium mt-1">partners@livesov.com</p>
          </div>
        </div>
      </div>
    </SeoLayout>
  );
}
