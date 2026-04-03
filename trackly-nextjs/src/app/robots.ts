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
          '/api/',
          '/login',
          '/signup',
          '/reset-password',
          '/home',       // duplicate of /, prevent indexing
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
