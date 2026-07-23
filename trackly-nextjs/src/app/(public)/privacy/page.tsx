import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent, Breadcrumbs } from '@/components/seo/SeoLayout';
import EmailOff from '@/components/EmailOff';

export const metadata: Metadata = {
  title: 'Privacy Policy - Livesov',
  description: 'Livesov Privacy Policy - learn how we collect, use, store, and protect your personal data. GDPR and CCPA compliant.',
  alternates: { canonical: '/privacy' },
  openGraph: {
    title: 'Privacy Policy - Livesov',
    description: 'Livesov Privacy Policy - learn how we collect, use, store, and protect your personal data. GDPR and CCPA compliant.',
    url: 'https://livesov.com/privacy',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Privacy Policy - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy Policy - Livesov',
    description: 'Livesov Privacy Policy - learn how we collect, use, store, and protect your personal data. GDPR and CCPA compliant.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function PrivacyPage() {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Privacy Policy', url: '/privacy' }]} />
      <SeoHero title="Privacy Policy" subtitle="How we collect, use, store, and protect your personal data." hideCta />
      <div className="max-w-3xl mx-auto px-6 pb-4">
        <p className="text-sm text-gray-400 mt-2">Last updated: April 25, 2026</p>
      </div>
      <SeoContent>
        <h2>1. Information We Collect</h2>
        <p>We collect information you provide directly: email address, name, and password when you create an account. If you sign in with Google, we receive your Google profile information (name, email, avatar). We also collect AI platform API keys you provide, which are encrypted at rest with AES-256-GCM.</p>

        <h2>2. How We Use Your Information</h2>
        <p>We use your information to provide and improve our service, send transactional emails (verification, password reset, billing receipts), and communicate important service updates. We do not sell your personal data.</p>

        <h2>3. Data Storage & Security</h2>
        <p>Your data is stored in PostgreSQL databases hosted on secure cloud infrastructure. API keys are encrypted using AES-256-GCM with a dedicated encryption key. Passwords are hashed using bcrypt. All connections use TLS encryption.</p>

        <h2>4. Cookies</h2>
        <p>We use essential httpOnly cookies for authentication (JWT tokens). These cookies are strictly necessary for the service to function. We do not use tracking or advertising cookies. See our <a href="/cookies">Cookie Policy</a> for details.</p>

        <h2>5. Third-Party Services</h2>
        <p>We integrate with: AI platform APIs (OpenAI, Anthropic, Google, Perplexity, xAI) to run visibility queries; Google OAuth for sign-in and Google Search Console access (see section 6); DodoPayments for subscription billing; Resend/SendGrid for transactional emails.</p>

        <h2>6. Google User Data (Search Console)</h2>
        <p>When you choose to connect Google Search Console, we request read-only access to your Search Console data through Google OAuth, using only the <code>https://www.googleapis.com/auth/webmasters.readonly</code> scope. We never request write access to your Search Console account.</p>
        <p><strong>What we access:</strong> your list of verified Search Console properties, Search Analytics data (queries, pages, clicks, impressions, average position), and URL Inspection results (indexing and canonical status) for the site you connect.</p>
        <p><strong>How we use it:</strong> solely to power the features you invoked — identifying pages and queries to improve (striking-distance, CTR rescue), checking indexing/canonical issues, and measuring whether a shipped SEO fix improved performance. We do not use Google user data for advertising, we do not sell it, and we do not transfer it to third parties except as needed to provide these features to you.</p>
        <p><strong>Storage &amp; deletion:</strong> your Google OAuth tokens are encrypted at rest (AES-256-GCM) and are used only to fetch the data above on your behalf. You can disconnect Google Search Console at any time from the Connections panel, which revokes and deletes the stored tokens. Deleting your account removes all associated Google data.</p>
        <p><strong>Limited Use:</strong> Livesov&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including its Limited Use requirements.</p>

        <h2>7. Data Retention</h2>
        <p>Account data is retained while your account is active. API logs are retained for 7 days. Query run data is retained for 90 days. You can delete your account at any time, which removes all associated data.</p>

        <h2>8. Your Rights (GDPR/CCPA)</h2>
        <p>You have the right to access, correct, delete, and export your data. You can exercise these rights through your account settings or by contacting us at <EmailOff>hello@livesov.com</EmailOff>.</p>

        <h2>9. Contact</h2>
        <p>For privacy-related inquiries, contact us at <EmailOff>hello@livesov.com</EmailOff>.</p>
      </SeoContent>
    </SeoLayout>
  );
}
