'use client';

import Link from 'next/link';
import { SiteLogo } from '@/components/site/SiteHeader';
import { siteFontVars } from '@/components/site/fonts';
import '@/styles/livesov-site.css';

const POINTS = [
  '7 day free trial, no credit card',
  'Set up in under two minutes',
  'ChatGPT, Claude, Gemini, Perplexity and Grok',
  'Plans from $9/mo',
];

/* Sign up / sign in shell from the "Livesov Website" design: form on the
   left, dark proof panel on the right. The pages inside keep their legacy
   class names (.auth-tabs, .finp, .btn-primary...); livesov-site.css
   restyles them under `.ls-auth`. */
export default function AuthLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ls ls-auth ${siteFontVars}`}>
      <div className="ls-auth-form">
        <Link href="/" className="ls-logo" aria-label="Livesov home" style={{ alignSelf: 'flex-start' }}><SiteLogo /></Link>
        <div className="ls-auth-center">
          <div className="ls-auth-inner">{children}</div>
        </div>
      </div>

      <aside className="ls-auth-side" aria-label="Why Livesov">
        <h2 className="ls-h2 md" style={{ maxWidth: 520 }}>See what AI says <span className="ls-em lime">about every client.</span></h2>
        <ul>
          {POINTS.map((p) => (
            <li key={p}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A3E635" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              {p}
            </li>
          ))}
        </ul>
        <div className="ls-auth-score">
          <div className="ls-ring" style={{ width: 64, height: 64, ['--ring-c' as string]: '#A3E635', ['--ring-t' as string]: '#2A2C3E', ['--ring-bg' as string]: '#161827' } as React.CSSProperties}>
            <div style={{ width: 48, height: 48, fontWeight: 600 }}>78</div>
          </div>
          <div className="ls-stack" style={{ gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Brand health score</span>
            <span style={{ fontSize: 14, color: 'var(--ls-on-dark-3)' }}>Sample workspace · updated daily</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
