'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBrands } from '@/contexts/BrandContext';
import { useRun } from '@/contexts/RunContext';
import { PLATFORM_COLORS } from '@/lib/constants';

const ALL_PLATFORMS = Object.keys(PLATFORM_COLORS);

const INDUSTRIES = [
  'SaaS', 'E-commerce', 'Healthcare', 'Finance', 'Real Estate',
  'Legal', 'Marketing', 'Education', 'Travel', 'Food & Beverage',
  'HVAC', 'Plumbing', 'Roofing', 'Automotive', 'Other',
];

async function api(method: string, path: string, body?: unknown) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { setSelectedBrand, refreshBrands } = useBrands();
  const { startRun } = useRun();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [customIndustry, setCustomIndustry] = useState('');
  const [city, setCity] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['ChatGPT', 'Perplexity']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const effectiveIndustry = industry === 'Other' ? customIndustry : industry;

  const togglePlatform = (p: string) => {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      const data = await api('POST', '/api/brands', {
        name,
        industry: effectiveIndustry,
        city,
        queries: [],
        competitors: [],
        selected_platforms: platforms,
      });
      setSelectedBrand(data.brand);
      await refreshBrands();
      router.push('/dashboard');
      setTimeout(() => startRun(false), 800);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const canProceedStep1 = name.trim().length >= 2 && effectiveIndustry.trim().length >= 2;
  const canProceedStep2 = platforms.length >= 1;

  const steps = [
    { n: 1, label: 'Brand Info' },
    { n: 2, label: 'AI Platforms' },
    { n: 3, label: 'Review & Create' },
  ];

  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px' }}>
      <div style={{ width: '100%', maxWidth: 540 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: 16, marginBottom: 16,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>Welcome to Livesov</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Let&apos;s set up your first brand to start tracking AI visibility.</p>
        </div>

        {/* Step Indicators */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {steps.map(s => (
            <div key={s.n} style={{
              flex: 1, textAlign: 'center', padding: '10px 0', fontSize: 12, fontWeight: 600,
              borderRadius: 'var(--radius-xs)', border: '1px solid',
              background: step === s.n ? 'rgba(99,102,241,.08)' : step > s.n ? 'rgba(16,185,129,.06)' : 'var(--bg2)',
              color: step === s.n ? '#6366f1' : step > s.n ? '#10b981' : 'var(--muted)',
              borderColor: step === s.n ? 'rgba(99,102,241,.3)' : step > s.n ? 'rgba(16,185,129,.3)' : 'var(--border)',
              transition: 'all .2s',
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: '50%', fontSize: 11, marginRight: 6,
                background: step === s.n ? '#6366f1' : step > s.n ? '#10b981' : 'var(--bg3)',
                color: step >= s.n ? '#fff' : 'var(--muted)',
              }}>{step > s.n ? '\u2713' : s.n}</span>
              {s.label}
            </div>
          ))}
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
          padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,.04)',
        }}>
          {error && (
            <div style={{
              background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)',
              color: '#ef4444', fontSize: 13, padding: '10px 14px', borderRadius: 'var(--radius-xs)', marginBottom: 16,
            }}>{error}</div>
          )}

          {/* Step 1: Brand Info */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Tell us about your brand</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>We&apos;ll use this to generate relevant AI queries.</p>

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Brand Name *</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Livesov, Acme Corp"
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                  outline: 'none', boxSizing: 'border-box', marginBottom: 16,
                }}
              />

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Industry *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: industry === 'Other' ? 10 : 16 }}>
                {INDUSTRIES.map(ind => (
                  <button key={ind} onClick={() => setIndustry(ind)} style={{
                    padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 20,
                    border: '1px solid', cursor: 'pointer', transition: 'all .15s',
                    background: industry === ind ? '#6366f1' : 'var(--bg)',
                    color: industry === ind ? '#fff' : 'var(--text)',
                    borderColor: industry === ind ? '#6366f1' : 'var(--border)',
                  }}>{ind}</button>
                ))}
              </div>
              {industry === 'Other' && (
                <input
                  value={customIndustry} onChange={e => setCustomIndustry(e.target.value)}
                  placeholder="Enter your industry..."
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                    outline: 'none', boxSizing: 'border-box', marginBottom: 16,
                  }}
                />
              )}

              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Location <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
              <input
                value={city} onChange={e => setCity(e.target.value)}
                placeholder="e.g. Austin TX, London, New York"
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 14, borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                  outline: 'none', boxSizing: 'border-box', marginBottom: 24,
                }}
              />

              <button
                onClick={() => setStep(2)} disabled={!canProceedStep1}
                style={{
                  width: '100%', padding: 13, fontSize: 14, fontWeight: 700, border: 'none',
                  borderRadius: 'var(--radius-xs)', cursor: canProceedStep1 ? 'pointer' : 'default',
                  background: canProceedStep1 ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--bg3)',
                  color: canProceedStep1 ? '#fff' : 'var(--muted)', transition: 'all .2s',
                }}
              >Continue</button>
            </div>
          )}

          {/* Step 2: Select AI Platforms */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Choose AI platforms to track</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>Select which AI platforms you want to monitor for brand mentions.</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
                {ALL_PLATFORMS.map(p => {
                  const selected = platforms.includes(p);
                  const color = PLATFORM_COLORS[p] || '#6366f1';
                  return (
                    <button key={p} onClick={() => togglePlatform(p)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
                      borderRadius: 'var(--radius-xs)', border: '2px solid', cursor: 'pointer',
                      background: selected ? `${color}10` : 'var(--bg)',
                      borderColor: selected ? color : 'var(--border)',
                      transition: 'all .15s',
                    }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                        background: selected ? color : 'var(--border)',
                      }} />
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: selected ? color : 'var(--muted)',
                      }}>{p}</span>
                    </button>
                  );
                })}
              </div>

              {platforms.length === 0 && (
                <p style={{ fontSize: 12, color: '#f59e0b', marginBottom: 16 }}>Select at least one platform.</p>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep(1)} style={{
                  flex: 1, padding: 13, fontSize: 14, fontWeight: 600,
                  background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                }}>Back</button>
                <button onClick={() => setStep(3)} disabled={!canProceedStep2} style={{
                  flex: 2, padding: 13, fontSize: 14, fontWeight: 700, border: 'none',
                  borderRadius: 'var(--radius-xs)', cursor: canProceedStep2 ? 'pointer' : 'default',
                  background: canProceedStep2 ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--bg3)',
                  color: canProceedStep2 ? '#fff' : 'var(--muted)', transition: 'all .2s',
                }}>Continue</button>
              </div>
            </div>
          )}

          {/* Step 3: Review & Create */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>Review & create your brand</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>Confirm the details below, then we&apos;ll create your brand.</p>

              <div style={{
                background: 'var(--bg)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)',
                padding: 20, marginBottom: 20,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '12px 16px', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Brand</span>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{name}</span>

                  <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Industry</span>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>{effectiveIndustry}</span>

                  {city && (
                    <>
                      <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Location</span>
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{city}</span>
                    </>
                  )}

                  <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Platforms</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {platforms.map(p => (
                      <span key={p} style={{
                        padding: '3px 10px', fontSize: 12, fontWeight: 600, borderRadius: 12,
                        background: `${PLATFORM_COLORS[p] || '#6366f1'}15`,
                        color: PLATFORM_COLORS[p] || '#6366f1',
                      }}>{p}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{
                background: 'rgba(99,102,241,.04)', borderRadius: 'var(--radius-xs)',
                border: '1px solid rgba(99,102,241,.15)', padding: '12px 16px', marginBottom: 20,
                fontSize: 12, color: 'var(--muted)', lineHeight: 1.6,
              }}>
                You can add competitors, queries, and nearby areas from your dashboard after setup.
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep(2)} style={{
                  flex: 1, padding: 13, fontSize: 14, fontWeight: 600,
                  background: 'var(--bg3)', color: 'var(--muted)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                }}>Back</button>
                <button onClick={handleCreate} disabled={saving} style={{
                  flex: 2, padding: 13, fontSize: 14, fontWeight: 700, border: 'none',
                  borderRadius: 'var(--radius-xs)', cursor: saving ? 'default' : 'pointer',
                  background: saving ? 'var(--bg3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  color: saving ? 'var(--muted)' : '#fff', transition: 'all .2s',
                }}>{saving ? 'Creating brand...' : 'Create Brand & Go to Dashboard'}</button>
              </div>
            </div>
          )}
        </div>

        {/* Skip link */}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13,
              cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >Skip for now</button>
        </div>
      </div>
    </div>
  );
}
