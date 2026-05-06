'use client';

import Link from 'next/link';
import SeoLayout, { Breadcrumbs } from '@/components/seo/SeoLayout';

interface ToolPageProps {
  title: React.ReactNode;
  subtitle: string;
  toolName: string;
  toolSlug: string;
  children: React.ReactNode;
  hideUpsell?: boolean;
}

export default function ToolPage({ title, subtitle, toolName, toolSlug, children, hideUpsell }: ToolPageProps) {
  return (
    <SeoLayout>
      <Breadcrumbs items={[{ name: 'Free Tools', url: '/tools' }, { name: toolName, url: `/tools/${toolSlug}` }]} />
      <section
        className="land-hero"
        style={{ paddingTop: 80, paddingBottom: 32, textAlign: 'center' }}
      >
        <div style={{ marginBottom: 16, fontSize: 13, color: 'rgba(255,255,255,.55)' }}>
          <Link href="/tools" style={{ color: 'rgba(255,255,255,.55)', textDecoration: 'none' }}>
            Free Tools
          </Link>
          {' / '}
          <span>{toolName}</span>
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.2, marginBottom: 14 }}>{title}</h1>
        <p
          style={{
            fontSize: 17,
            color: 'rgba(255,255,255,.7)',
            maxWidth: 620,
            margin: '0 auto',
            paddingBottom: 8,
          }}
        >
          {subtitle}
        </p>
      </section>

      <section style={{ padding: '0 24px 64px', maxWidth: 760, margin: '0 auto' }}>{children}</section>

      {!hideUpsell && (
        <section style={{ padding: '0 24px 80px', maxWidth: 760, margin: '0 auto' }}>
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 32,
              boxShadow: '0 4px 24px rgba(0,0,0,.08)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                background: '#f5f3ff',
                borderRadius: 10,
                padding: 20,
                marginBottom: 20,
                border: '1px solid #e0e7ff',
              }}
            >
              <p style={{ fontSize: 14, color: '#1a1a2e', lineHeight: 1.6, margin: 0 }}>
                Want continuous tracking instead of a one-off check? Livesov monitors your AI visibility across
                ChatGPT, Perplexity, Claude, Gemini and Grok every day.
              </p>
            </div>
            <Link
              href="/signup"
              style={{
                display: 'inline-block',
                padding: '14px 32px',
                borderRadius: 10,
                background: 'var(--brand)',
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Start Tracking Free
            </Link>
          </div>
        </section>
      )}
    </SeoLayout>
  );
}

export const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 32,
  boxShadow: '0 4px 24px rgba(0,0,0,.08)',
};

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: '1px solid #e0e0e0',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
};

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  fontSize: 14,
  color: '#1a1a2e',
  marginBottom: 6,
};

export function PrimaryButton({
  children,
  loading,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      style={{
        width: '100%',
        padding: '14px 24px',
        borderRadius: 10,
        border: 'none',
        background: loading || disabled ? '#ccc' : 'var(--brand)',
        color: '#fff',
        fontSize: 16,
        fontWeight: 700,
        cursor: loading || disabled ? 'not-allowed' : 'pointer',
        ...(rest.style || {}),
      }}
    >
      {children}
    </button>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      style={{
        marginTop: 20,
        padding: '12px 16px',
        borderRadius: 10,
        background: '#fef2f2',
        color: '#dc2626',
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}
