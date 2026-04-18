import type { Metadata } from 'next';
import SeoLayout, { SeoHero, SeoContent, Breadcrumbs } from '@/components/seo/SeoLayout';

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
        <p className="text-sm text-gray-400 mt-2">Last updated: March 15, 2026</p>
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
        <p>We integrate with: AI platform APIs (OpenAI, Anthropic, Google, Perplexity, xAI) to run visibility queries; Google OAuth for sign-in; DodoPayments for subscription billing; Resend/SendGrid for transactional emails.</p>

        <h2>6. Data Retention</h2>
        <p>Account data is retained while your account is active. API logs are retained for 7 days. Query run data is retained for 90 days. You can delete your account at any time, which removes all associated data.</p>

        <h2>7. Your Rights (GDPR/CCPA)</h2>
        <p>You have the right to access, correct, delete, and export your data. You can exercise these rights through your account settings or by contacting us at hello@livesov.com.</p>

        <h2>8. Contact</h2>
        <p>For privacy-related inquiries, contact us at hello@livesov.com.</p>
      </SeoContent>
    </SeoLayout>
  );
}
