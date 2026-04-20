import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password - Livesov',
  // The reset token lives in ?token=..., so we must not leak the URL via
  // the Referer header to any third-party analytics/CDN hit and we must
  // not allow this page into search indexes.
  robots: { index: false, follow: false, nocache: true, noarchive: true },
  referrer: 'no-referrer',
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
