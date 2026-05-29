import { Newsreader, Hanken_Grotesk } from 'next/font/google';

/* Editorial type for the Livesov home page only. The CSS variables are
   consumed by src/styles/livesov-home.css (--serif / --sans) and applied to
   the `.lv-home` wrapper, so the rest of the app keeps its Inter stack.
   Defined in a shared module because the home component renders at both `/`
   (app/page.tsx) and `/home`, which do not share a layout. */
export const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-newsreader',
});

export const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-hanken',
});
