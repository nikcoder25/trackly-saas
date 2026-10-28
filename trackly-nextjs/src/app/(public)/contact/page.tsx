import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/seo/SeoLayout';
import SiteShell from '@/components/site/SiteShell';
import Link from 'next/link';
import ContactForm from '@/components/ContactForm';
import EmailOff from '@/components/EmailOff';

export const metadata: Metadata = {
  title: 'Contact Us | Support, Sales & Partnerships | Livesov',
  description: 'Contact the Livesov team for product support, enterprise plans or partnerships. Send us a message and a real person will reply within 24 hours.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact Us | Support, Sales & Partnerships | Livesov',
    description: 'Contact the Livesov team for product support, enterprise plans or partnerships. Send us a message and a real person will reply within 24 hours.',
    url: 'https://livesov.com/contact',
    siteName: 'Livesov',
    type: 'website',
    images: [{ url: 'https://livesov.com/og-image.png', width: 1200, height: 630, alt: 'Contact Us - Livesov' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact Us | Support, Sales & Partnerships | Livesov',
    description: 'Contact the Livesov team for product support, enterprise plans or partnerships. Send us a message and a real person will reply within 24 hours.',
    images: ['https://livesov.com/og-image.png'],
  },
};

function Arrow() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7" /><path d="M8 7h9v9" /></svg>
  );
}

export default function ContactPage() {
  return (
    <SiteShell>
      <Breadcrumbs items={[{ name: 'Contact', url: '/contact' }]} />
      <section className="ls-wrap" style={{ paddingTop: 80, paddingBottom: 112, display: 'flex', flexWrap: 'wrap', gap: 64 }}>
        <div className="ls-stack" style={{ flex: '1 1 400px', gap: 28, minWidth: 0 }}>
          <span className="ls-eyebrow">Contact</span>
          <h1 className="ls-h1">Let&apos;s talk <span className="ls-em">AI visibility.</span></h1>
          <p className="ls-lead" style={{ maxWidth: 460 }}>
            Questions about plans, agency setups or partnerships. A real person replies within one business day.
          </p>
          <div className="ls-stack ls-gap-12" style={{ marginTop: 8 }}>
            <EmailOff>
              <a href="mailto:hello@livesov.com" className="ls-linkcard">
                <span><small>Email</small><strong>hello@livesov.com</strong></span><Arrow />
              </a>
            </EmailOff>
            <Link href="/partners" className="ls-linkcard">
              <span><small>Partners</small><strong>Agency partner program</strong></span><Arrow />
            </Link>
            <Link href="/docs" className="ls-linkcard">
              <span><small>Help</small><strong>Docs and guides</strong></span><Arrow />
            </Link>
          </div>
        </div>
        <div id="contact-form" className="ls-frame" style={{ flex: '1 1 480px', minWidth: 0 }}>
          <div className="ls-frame-in">
            <h2 className="ls-sr">Send us a message</h2>
            <ContactForm />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
