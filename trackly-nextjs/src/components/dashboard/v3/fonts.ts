// v3 dashboard type. Self-hosted through next/font (served from our origin,
// so the CSP needs no change). preload: false keeps the files off classic
// pages; they only download once a v3 element actually uses the family.
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';

const geist = Geist({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--v3-font-sans', preload: false });
const geistMono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--v3-font-mono', preload: false });
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], display: 'swap', variable: '--v3-font-serif', preload: false });

/** Class names that define the three CSS variables on the v3 root. */
export const v3FontVars = `${geist.variable} ${geistMono.variable} ${serif.variable}`;
