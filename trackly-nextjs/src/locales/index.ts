import en from './en';
import type { Translations } from './en';

export type { Translations };
export type Locale = 'en';

const locales: Record<string, Translations> = { en };

export function getTranslations(locale: string): Translations {
  return locales[locale] || en;
}

export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: 'EN' },
];

export default locales;
