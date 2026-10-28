import type { ReactNode } from 'react';

const OPEN = { __html: '<!--email_off-->' };
const CLOSE = { __html: '<!--/email_off-->' };

/**
 * Cloudflare's Email Address Obfuscation rewrites any email address it finds
 * in the HTML response into an <a href="/cdn-cgi/l/email-protection#..."> link,
 * which crawlers report as a broken (404) internal link on every page.
 * Content between <!--email_off--> and <!--/email_off--> markers is skipped,
 * so wrap every server-rendered email address (mailto: links and plain text).
 */
export default function EmailOff({ children }: { children: ReactNode }) {
  return (
    <>
      <span hidden dangerouslySetInnerHTML={OPEN} />
      {children}
      <span hidden dangerouslySetInnerHTML={CLOSE} />
    </>
  );
}
