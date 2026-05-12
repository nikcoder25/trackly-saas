'use client';

export default function AuthLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <div id="auth-page">
      <div className="auth-brand-panel">
        <div className="auth-brand-content">
          <div className="auth-brand-logo">
            Live<span>sov</span>
          </div>
          <div className="auth-brand-heading">Track your brand&apos;s AI visibility</div>
          <div className="auth-brand-desc">See exactly how ChatGPT, Perplexity, Claude, Gemini, and Grok mention your brand.</div>
          <div className="auth-features">
            {[
              { icon: '◉', title: 'Real-time AI Monitoring', desc: 'Track mentions across 5 AI platforms with live query results' },
              { icon: '◆', title: 'Share of Voice Analytics', desc: "Measure your brand's visibility vs competitors in AI responses" },
              { icon: '★', title: 'Evidence & Proof', desc: 'Get actual AI responses as proof of brand mentions' },
              { icon: '⚙', title: 'Automated Scheduled Runs', desc: 'Set up recurring checks and get notified of changes' },
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
          <div className="auth-brand-footer">Built for brands and agencies tracking AI visibility</div>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-inner">
          {children}
        </div>
      </div>
    </div>
  );
}
