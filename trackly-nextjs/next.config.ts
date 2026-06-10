import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    // PDFKit reads its font-metric (.afm) data files from disk at runtime.
    // If it's bundled by webpack those reads fail (ENOENT) and PDF generation
    // throws ("Failed to generate PDF report"). Keeping it external makes Next
    // require it from node_modules so the font data loads correctly.
    serverExternalPackages: ['pdfkit'],
    images: {
          remotePatterns: [
            { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
                ],
    },
    redirects: async () => [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
      {
        // Defense-in-depth for the legacy /features route, which never
        // shipped as a page. The homepage `#features` section is the
        // canonical destination. Catches any stray external backlink,
        // cached crawler entry, or future internal link that points at
        // the bare /features path.
        source: '/features',
        destination: '/#features',
        permanent: true,
      },
    ],
    headers: async () => [
      {
              source: '/(.*)',
              headers: [
                { key: 'X-Frame-Options', value: 'DENY' },
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
                // X-XSS-Protection intentionally omitted: deprecated, ignored
                // by modern browsers, and its legacy filter enabled XS-Leaks.
                // CSP (set per-request in middleware.ts) covers XSS.
                { key: 'X-DNS-Prefetch-Control', value: 'on' },
                // Content-Security-Policy is set per-request in middleware.ts
                // so it can embed a unique nonce that replaces 'unsafe-inline'
                // for script-src.
                      ],
      },
      {
              source: '/dashboard/:path*',
              headers: [
                { key: 'Cache-Control', value: 'no-store, must-revalidate' },
                      ],
      },
      {
              source: '/api/:path*',
              headers: [
                { key: 'Cache-Control', value: 'no-store, must-revalidate' },
                      ],
      },
      {
              source: '/(login|signup|reset-password)',
              headers: [
                { key: 'Cache-Control', value: 'no-store, must-revalidate' },
                      ],
      },
        ],
};

// Always wrap with Sentry so the webpack plugin instruments the bundle at build time.
// The DSN is checked at runtime inside sentry.client.config.ts / sentry.server.config.ts.
export default withSentryConfig(nextConfig, {
    silent: true,
});
