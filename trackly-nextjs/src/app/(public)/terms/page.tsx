import type { Metadata } from 'next';
import SeoLayout, { SeoContent } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Terms of Service — Livesov',
  description: 'Livesov Terms of Service — rules and conditions for using our AI visibility tracking platform.',
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms of Service — Livesov',
    description: 'Livesov Terms of Service — rules and conditions for using our AI visibility tracking platform.',
    url: 'https://livesov.com/terms',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Terms of Service — Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terms of Service — Livesov',
    description: 'Livesov Terms of Service — rules and conditions for using our AI visibility tracking platform.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function TermsPage() {
  return (
    <SeoLayout>
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-4">
        <h1 className="text-3xl font-extrabold text-gray-900">Terms of Service</h1>
        <p className="text-sm text-gray-400 mt-2">Last updated: March 2026</p>
      </div>
      <SeoContent>
        <h2>1. Acceptance of Terms</h2>
        <p>By creating an account or using Livesov, you agree to these Terms of Service. If you do not agree, do not use the service.</p>

        <h2>2. Account Responsibilities</h2>
        <p>You are responsible for maintaining the security of your account credentials. You must provide accurate registration information. You are responsible for all activity under your account.</p>

        <h2>3. API Keys</h2>
        <p>You may provide your own AI platform API keys for brand tracking. You are responsible for compliance with each platform&apos;s terms of service. Livesov encrypts your keys at rest but is not liable for charges incurred on your API accounts.</p>

        <h2>4. Acceptable Use</h2>
        <p>You agree not to: use the service to violate any laws; attempt to gain unauthorized access; interfere with the service&apos;s operation; resell access without authorization; use automated tools to scrape the service.</p>

        <h2>5. Billing & Subscriptions</h2>
        <p>Paid plans are billed monthly through DodoPayments. You can cancel anytime. Refunds are handled on a case-by-case basis. Plan limits are enforced automatically.</p>

        <h2>6. Data Ownership</h2>
        <p>You retain ownership of your data. We do not claim rights to your brand data, queries, or results. We may use aggregated, anonymized data to improve our service.</p>

        <h2>7. Service Availability</h2>
        <p>We strive for high availability but do not guarantee uninterrupted service. AI platform APIs may be unavailable or rate-limited independently of our service.</p>

        <h2>8. Limitation of Liability</h2>
        <p>Livesov is provided &quot;as is.&quot; We are not liable for indirect, incidental, or consequential damages. Our total liability is limited to the amount you paid in the 12 months prior.</p>

        <h2>9. Changes to Terms</h2>
        <p>We may update these terms. Continued use after changes constitutes acceptance. Material changes will be communicated via email.</p>

        <h2>10. Contact</h2>
        <p>Questions about these terms? Contact legal@livesov.com.</p>
      </SeoContent>
    </SeoLayout>
  );
}
