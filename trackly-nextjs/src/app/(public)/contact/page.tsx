import type { Metadata } from 'next';
import { Mail } from 'lucide-react';
import SeoLayout, { SeoHero, Breadcrumbs } from '@/components/seo/SeoLayout';
import ContactForm from '@/components/ContactForm';

export const metadata: Metadata = {
  title: 'Contact Us - Livesov',
  description: 'Get in touch with the Livesov team for support, enterprise inquiries, partnerships, or feedback.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact Us - Livesov',
    description: 'Get in touch with the Livesov team for support, enterprise inquiries, partnerships, or feedback.',
    url: 'https://livesov.com/contact',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Contact Us - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact Us - Livesov',
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
        ctaText="Send us a message"
        ctaHref="#contact-form"
      />

      {/* Contact Form */}
      <div id="contact-form" className="max-w-2xl mx-auto px-6 mt-6 pb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Send Us a Message</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 shadow-sm">
          <ContactForm />
        </div>
      </div>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-gray-200" />
      </div>

      {/* Contact Info Card */}
      <div className="max-w-2xl mx-auto px-6 mt-6 pb-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-3 text-center">Or Reach Out Directly</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center transition-shadow hover:shadow-md mt-8">
          <Mail className="w-8 h-8 text-[var(--brand)] mx-auto mb-3" />
          <h3 className="font-bold text-gray-900 mb-2">Email Us</h3>
          <p className="text-gray-500 text-sm mb-3">For all inquiries including support, sales, and partnerships.</p>
          <a href="mailto:hello@livesov.com" className="text-[var(--brand)] font-medium text-sm hover:underline">hello@livesov.com</a>
        </div>
      </div>
    </SeoLayout>
  );
}
