import en from './en';
import es from './es';
import fr from './fr';
import type { Translations } from './en';

export type { Translations };
export type Locale = 'en' | 'es' | 'fr';

const locales: Record<string, Translations> = { en, es, fr };

export function getTranslations(locale: string): Translations {
  return locales[locale] || en;
}

export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'es', label: 'Espa\u00f1ol', flag: 'ES' },
  { code: 'fr', label: 'Fran\u00e7ais', flag: 'FR' },
];

export default locales;
