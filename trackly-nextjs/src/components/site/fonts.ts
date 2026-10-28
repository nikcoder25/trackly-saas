import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';

/* Type for the public marketing site (home, pricing, audit, blog index,
   contact, auth). The CSS variables are consumed by
   src/styles/livesov-site.css and applied on the `.ls` wrapper, so the
   dashboard and the long-tail SEO pages keep their Inter stack. */
export const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-geist',
});

export const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-geist-mono',
});

export const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-instrument',
});

export const siteFontVars = `${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`;
