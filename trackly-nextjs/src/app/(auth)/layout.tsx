'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Left: Brand messaging panel */}
      <div className="flex-1 bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] text-white flex items-center justify-center p-8 md:p-16 relative overflow-hidden">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-[radial-gradient(circle,rgba(255,97,84,.12)_0%,transparent_70%)] pointer-events-none" />
        <div className="relative max-w-[480px]">
          <div className="text-[32px] font-extrabold tracking-tight mb-8">
            Live<span className="text-[var(--primary)]">sov</span>
          </div>
          <h1 className="text-[36px] font-extrabold leading-[1.2] mb-4 tracking-tight">{t.auth.brandPanel.title}</h1>
          <p className="text-base text-white/70 leading-relaxed mb-10">{t.auth.brandPanel.desc}</p>
          <div className="flex flex-col gap-5 mb-10">
            {[
              { icon: '\u25C9', ...t.auth.brandPanel.features[0] },
              { icon: '\u25C6', ...t.auth.brandPanel.features[1] },
              { icon: '\u2605', ...t.auth.brandPanel.features[2] },
              { icon: '\u2699', ...t.auth.brandPanel.features[3] },
            ].map(f => (
              <div key={f.title} className="flex items-start gap-3.5">
                <div className="w-9 h-9 shrink-0 flex items-center justify-center bg-[rgba(255,97,84,.15)] rounded-lg text-base text-[var(--primary)]">{f.icon}</div>
                <div>
                  <div className="text-sm font-bold mb-0.5">{f.title}</div>
                  <div className="text-[13px] text-white/55 leading-snug">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-[13px] text-white/65 pt-5 border-t border-white/[.08]">{t.auth.brandPanel.trusted}</div>
        </div>
      </div>

      {/* Right: Auth form panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10 bg-white">
        <div className="w-full max-w-[400px]">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher variant="light" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
