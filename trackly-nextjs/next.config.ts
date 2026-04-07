import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    images: {
          remotePatterns: [
            { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
            { protocol: 'https', hostname: 'api.qrserver.com' },
                ],
    },
    headers: async () => [
      {
              source: '/(.*)',
              headers: [
                { key: 'X-Frame-Options', value: 'DENY' },
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
                { key: 'X-DNS-Prefetch-Control', value: 'on' },
                {
                            key: 'Content-Security-Policy',
                            value: [
                                          "default-src 'self'",
                                          "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com https://www.googletagmanager.com https://www.google-analytics.com https://browser.sentry-cdn.com",
                                          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                                          "font-src 'self' https://fonts.gstatic.com",
                                          "img-src 'self' data: https://lh3.googleusercontent.com https://api.qrserver.com",
                                          "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://*.sentry.io https://www.google-analytics.com https://analytics.google.com",
                                          "worker-src 'self' blob:",
                                          "frame-src https://accounts.google.com",
                                          "frame-ancestors 'none'",
                                        ].join('; '),
                },
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
    disableLogger: true,
});
