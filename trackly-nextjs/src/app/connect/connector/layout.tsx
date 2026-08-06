import type { Metadata } from 'next';

// The Connector consent screen is a transactional OAuth-style handoff reached
// only via ?site=&callback=&state= from the plugin. It has no standalone value
// in search, and without this it inherited the root layout's metadata - so it
// was indexable, carried the HOMEPAGE's <title>, and canonicalised to
// https://livesov.com. That is a duplicate-title signal pointing at the
// homepage from a page no searcher should ever land on.
//
// Same posture as the (auth) route group, which sets noindex for login,
// signup, reset-password and email-verified.
export const metadata: Metadata = {
  title: 'Connect your brand | Livesov',
  robots: { index: false, follow: false },
};

export default function ConnectConnectorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
