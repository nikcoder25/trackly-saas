// next/font/google only works inside the Next compiler. Tests that import a
// page (and through it the site shell's fonts) get inert font objects.
const font = () => ({ className: '', variable: '', style: { fontFamily: '' } });

export const Geist = font;
export const Geist_Mono = font;
export const Instrument_Serif = font;
export const Inter = font;
export const JetBrains_Mono = font;
