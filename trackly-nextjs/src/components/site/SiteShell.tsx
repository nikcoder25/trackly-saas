import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { siteFontVars } from './fonts';
import '@/styles/livesov-site.css';

/* Page frame for every public page: fonts, tokens, sticky header and footer.
   SeoLayout wraps the long-tail pages in this same frame (with
   `id="landing-page"`, which globals.css keys its spacing utilities on). */
export default function SiteShell({
  children,
  id,
  className = '',
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div id={id} className={`ls ${className} ${siteFontVars}`}>
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </div>
  );
}
