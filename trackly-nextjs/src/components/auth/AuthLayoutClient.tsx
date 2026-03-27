'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function AuthLayoutClient({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();

  return (
    <div id="auth-page">
      <div className="auth-brand-panel">
        <div className="auth-brand-content">
          <div className="auth-brand-logo">
            Live<span>sov</span>
          </div>
          <div className="auth-brand-heading">{t.auth.brandPanel.title}</div>
          <div className="auth-brand-desc">{t.auth.brandPanel.desc}</div>
          <div className="auth-features">
            {[
              { icon: '\u25C9', ...t.auth.brandPanel.features[0] },
              { icon: '\u25C6', ...t.auth.brandPanel.features[1] },
              { icon: '\u2605', ...t.auth.brandPanel.features[2] },
              { icon: '\u2699', ...t.auth.brandPanel.features[3] },
            ].map(f => (
              <div key={f.title} className="auth-feature">
                <div className="auth-feature-icon">{f.icon}</div>
                <div>
                  <div className="auth-feature-title">{f.title}</div>
                  <div className="auth-feature-desc">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="auth-brand-footer">{t.auth.brandPanel.trusted}</div>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <LanguageSwitcher variant="light" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
