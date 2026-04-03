import type { Metadata } from 'next';
import SeoLayout, { SeoContent } from '@/components/seo/SeoLayout';

export const metadata: Metadata = {
  title: 'Cookie Policy — Livesov',
  description: 'Livesov Cookie Policy — learn what cookies and local storage we use, how they work, and how to manage them.',
  alternates: { canonical: '/cookies' },
  openGraph: {
    title: 'Cookie Policy — Livesov',
    description: 'Livesov Cookie Policy — learn what cookies and local storage we use, how they work, and how to manage them.',
    url: 'https://livesov.com/cookies',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Cookie Policy — Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cookie Policy — Livesov',
    description: 'Livesov Cookie Policy — learn what cookies and local storage we use, how they work, and how to manage them.',
    images: ['https://livesov.com/og-image.png'],
  },
};

export default function CookiesPage() {
  return (
    <SeoLayout>
      <div className="max-w-3xl mx-auto px-6 pt-16 pb-4">
        <h1 className="text-3xl font-extrabold text-gray-900">Cookie Policy</h1>
        <p className="text-sm text-gray-400 mt-2">Last updated: March 2026</p>
      </div>
      <SeoContent>
        <h2>What Cookies We Use</h2>
        <p>Livesov uses only essential cookies required for the service to function. We do not use advertising, tracking, or analytics cookies.</p>

        <h2>Essential Cookies</h2>
        <div className="overflow-x-auto my-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-semibold text-gray-900">Cookie</th>
                <th className="text-left py-2 pr-4 font-semibold text-gray-900">Purpose</th>
                <th className="text-left py-2 font-semibold text-gray-900">Duration</th>
              </tr>
            </thead>
            <tbody className="text-gray-500">
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">livesov_token</td>
                <td className="py-2 pr-4">JWT access token for authentication</td>
                <td className="py-2">15 minutes</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2 pr-4 font-mono text-xs">livesov_refresh</td>
                <td className="py-2 pr-4">Refresh token for session persistence</td>
                <td className="py-2">30 days</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2>Local Storage</h2>
        <p>We use browser localStorage to store non-sensitive preferences like your selected brand ID and UI state. This data stays on your device and is not sent to our servers.</p>

        <h2>How to Manage Cookies</h2>
        <p>You can clear cookies through your browser settings. Note that clearing authentication cookies will log you out of Livesov.</p>

        <h2>No Third-Party Cookies</h2>
        <p>We do not allow third-party advertising or analytics cookies on Livesov. The only external service that may set cookies is Google Sign-In if you choose to use it.</p>
      </SeoContent>
    </SeoLayout>
  );
}
