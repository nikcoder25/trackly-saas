// next/font/local only works inside the Next compiler. Tests that import a
// page (and through it the font modules) get an inert font object.
export default function localFont() {
  return { className: '', variable: '', style: { fontFamily: '' } };
}
