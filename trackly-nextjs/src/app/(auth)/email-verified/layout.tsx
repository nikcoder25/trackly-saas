import type { Metadata } from 'next';

// The page is a client component, so its title has to come from a layout.
// Without one it inherited the root layout's homepage <title>, which made two
// routes report the same title. Harmless for ranking (the (auth) layout
// already sets noindex) but it muddies title-based analytics and any crawl
// report, and the fix is one line.
export const metadata: Metadata = {
  title: 'Email verified | Livesov',
};

export default function EmailVerifiedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
