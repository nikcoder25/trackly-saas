'use client';

import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { SUPPORTED_LOCALES, Locale } from '@/locales';

export default function LanguageSwitcher({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  };

  const current = SUPPORTED_LOCALES.find(l => l.code === locale) || SUPPORTED_LOCALES[0];
  const textColor = variant === 'dark' ? '#fff' : 'var(--text-secondary)';
  const bgColor = variant === 'dark' ? 'rgba(255,255,255,.1)' : 'var(--bg-section)';
  const dropBg = variant === 'dark' ? '#1a1a2e' : '#fff';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onKeyDown={handleKeyDown}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current.label}. Change language`}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', fontSize: 12, fontWeight: 600,
          color: textColor, background: bgColor,
          border: '1px solid transparent', borderRadius: 6,
          cursor: 'pointer', fontFamily: 'var(--font)',
        }}
      >
        {current.flag} <span style={{ fontSize: 10 }} aria-hidden="true">&#x25BE;</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select language"
          aria-activedescendant={`lang-option-${locale}`}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: dropBg, border: '1px solid var(--border, #e2e5ea)',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.1)',
            zIndex: 100, minWidth: 120, overflow: 'hidden',
          }}
        >
          {SUPPORTED_LOCALES.map(l => (
            <button
              key={l.code}
              id={`lang-option-${l.code}`}
              role="option"
              aria-selected={locale === l.code}
              onClick={() => { setLocale(l.code as Locale); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 14px', fontSize: 12, fontWeight: locale === l.code ? 700 : 500,
                color: locale === l.code ? 'var(--primary, #6366f1)' : textColor,
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font)', textAlign: 'left',
              }}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
