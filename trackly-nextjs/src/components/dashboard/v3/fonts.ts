// Dashboard type. Apple devices render the system face (SF Pro) first; every
// other platform gets Inter, self-hosted through next/font (served from our
// origin, so the CSP needs no change). preload: false keeps the files off
// classic pages; they only download once a dashboard element uses the family.
import { Inter, Geist_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--v3-font-sans', preload: false });
const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], display: 'swap', variable: '--v3-font-mono', preload: false });

/** Class names that define the CSS font variables on the dashboard root. */
export const v3FontVars = `${inter.variable} ${mono.variable}`;
