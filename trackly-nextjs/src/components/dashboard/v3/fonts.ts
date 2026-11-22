// Dashboard type. Apple devices render the system face (SF Pro) first; every
// other platform gets Inter, self-hosted through next/font (served from our
// origin, so the CSP needs no change). preload: false keeps the files off
// classic pages; they only download once a dashboard element uses the family.
import localFont from 'next/font/local';

const inter = localFont({ src: '../../../fonts/inter-latin-var.woff2', weight: '100 900', display: 'swap', variable: '--v3-font-sans', preload: false });
const mono = localFont({ src: '../../../fonts/geist-mono-latin-var.woff2', weight: '100 900', display: 'swap', variable: '--v3-font-mono', preload: false, adjustFontFallback: false });

/** Class names that define the CSS font variables on the dashboard root. */
export const v3FontVars = `${inter.variable} ${mono.variable}`;
