'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getTranslations, SUPPORTED_LOCALES, type Locale, type Translations } from '@/locales';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType>({
  locale: 'en',
  setLocale: () => {},
  t: getTranslations('en'),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [t, setT] = useState<Translations>(getTranslations('en'));

  useEffect(() => {
    const saved = localStorage.getItem('livesov-lang') as Locale | null;
    if (saved && SUPPORTED_LOCALES.some(l => l.code === saved)) {
      setLocaleState(saved);
      setT(getTranslations(saved));
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    setT(getTranslations(newLocale));
    localStorage.setItem('livesov-lang', newLocale);
    document.documentElement.lang = newLocale;
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
