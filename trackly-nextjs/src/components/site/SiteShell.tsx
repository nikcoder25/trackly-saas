import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { siteFontVars } from './fonts';
import '@/styles/livesov-site.css';

/* Page frame for the redesigned public pages: fonts, tokens, sticky header
   and footer. Long-tail SEO pages keep using SeoLayout. */
export default function SiteShell({
  children,
  footer = 'full',
}: {
  children: React.ReactNode;
  footer?: 'full' | 'compact';
}) {
  return (
    <div className={`ls ${siteFontVars}`}>
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter variant={footer} />
    </div>
  );
}
