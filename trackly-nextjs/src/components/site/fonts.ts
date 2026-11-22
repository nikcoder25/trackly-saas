import localFont from 'next/font/local';

// Self-hosted (src/fonts): next/font/google downloads from fonts.gstatic.com
// at build time, and a flaky download failed the production build.

/* Type for the public marketing site (home, pricing, audit, blog index,
   contact, auth). The CSS variables are consumed by
   src/styles/livesov-site.css and applied on the `.ls` wrapper, so the
   dashboard and the long-tail SEO pages keep their Inter stack. */
export const geist = localFont({
  src: '../../fonts/geist-latin-var.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-geist',
});

export const geistMono = localFont({
  src: '../../fonts/geist-mono-latin-var.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-geist-mono',
  adjustFontFallback: false,
});

export const instrumentSerif = localFont({
  src: [
    { path: '../../fonts/instrument-serif-latin-regular.woff2', weight: '400', style: 'normal' },
    { path: '../../fonts/instrument-serif-latin-italic.woff2', weight: '400', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-instrument',
});

export const siteFontVars = `${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`;
