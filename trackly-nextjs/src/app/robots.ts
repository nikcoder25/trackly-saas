import type { MetadataRoute } from 'next';

const BASE_URL = process.env.APP_URL || 'https://livesov.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard/',
          '/admin-backend/',
          '/api/',
          '/login',
          '/signup',
          '/reset-password',
          '/home',       // duplicate of /, prevent indexing
          '/cdn-cgi/',   // Cloudflare internal paths (email-protection links 404 for crawlers)
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
