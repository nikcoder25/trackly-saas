'use client';

import { useState } from 'react';
import Link from 'next/link';
import SeoLayout from '@/components/seo/SeoLayout';

const INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Finance',
  'E-commerce',
  'Real Estate',
  'Legal',
  'Marketing',
  'Education',
  'Food & Restaurant',
  'Travel',
  'Other',
];

interface CheckResult {
  mentioned: boolean;
  platform: string;
  snippet: string;
  totalPlatforms: number;
}

export default function FreeCheckPage() {
  const [brandName, setBrandName] = useState('');
  const [industry, setIndustry] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch('/api/free-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: brandName.trim(), industry }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setResult(data);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SeoLayout>
      {/* Hero */}
      <section
        className="land-hero"
        style={{ paddingTop: 80, paddingBottom: 48, textAlign: 'center' }}
      >
        <h1 style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
          Is AI Recommending <span style={{ color: '#FF6154' }}>Your Brand</span>?
        </h1>
        <p
          style={{
            fontSize: 18,
            color: 'rgba(255,255,255,.7)',
            maxWidth: 540,
            margin: '0 auto',
            paddingBottom: 24,
          }}
        >
          Find out in 30 seconds — completely free, no signup required
        </p>
      </section>

      {/* Form Section */}
      <section style={{ padding: '0 24px 64px', maxWidth: 560, margin: '-12px auto 0' }}>
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: 40,
            boxShadow: '0 4px 24px rgba(0,0,0,.08)',
          }}
        >
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="brandName"
                style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: 14,
                  color: '#1a1a2e',
                  marginBottom: 6,
                }}
              >
                Brand Name
              </label>
              <input
                id="brandName"
                type="text"
                required
                placeholder="e.g. Livesov"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: '1px solid #e0e0e0',
                  fontSize: 15,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label
                htmlFor="industry"
                style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: 14,
                  color: '#1a1a2e',
                  marginBottom: 6,
                }}
              >
                Industry
              </label>
              <select
                id="industry"
                required
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: '1px solid #e0e0e0',
                  fontSize: 15,
                  outline: 'none',
                  background: '#fff',
                  boxSizing: 'border-box',
                  color: industry ? '#1a1a2e' : '#999',
                }}
              >
                <option value="" disabled>
                  Select your industry
                </option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind} style={{ color: '#1a1a2e' }}>
                    {ind}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px 24px',
                borderRadius: 10,
                border: 'none',
                background: loading ? '#ccc' : '#FF6154',
                color: '#fff',
                fontSize: 16,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background .2s',
              }}
            >
              {loading ? (
                <span>
                  Checking<span className="animate-pulse">...</span>
                </span>
              ) : (
                'Check My Visibility'
              )}
            </button>
          </form>

          {error && (
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
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <div
            style={{
              marginTop: 32,
              background: '#fff',
              borderRadius: 16,
              padding: 40,
              boxShadow: '0 4px 24px rgba(0,0,0,.08)',
              textAlign: 'center',
            }}
          >
            {/* Mentioned indicator */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: result.mentioned ? '#ecfdf5' : '#fef2f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: 36,
              }}
            >
              {result.mentioned ? (
                <span style={{ color: '#10b981' }}>&#10003;</span>
              ) : (
                <span style={{ color: '#ef4444' }}>&#10007;</span>
              )}
            </div>

            <h2
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#1a1a2e',
                marginBottom: 8,
              }}
            >
              {result.mentioned
                ? `"${brandName}" was mentioned!`
                : `"${brandName}" was not mentioned`}
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
              Checked on <strong>{result.platform}</strong>
            </p>

            {/* Snippet */}
            <div
              style={{
                background: '#f9fafb',
                borderRadius: 10,
                padding: 20,
                textAlign: 'left',
                fontSize: 13,
                lineHeight: 1.7,
                color: '#374151',
                marginBottom: 24,
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              {result.snippet}
              {result.snippet.length >= 300 && '...'}
            </div>

            {/* Upsell */}
            <div
              style={{
                background: '#FFF7F6',
                borderRadius: 10,
                padding: 20,
                marginBottom: 24,
                border: '1px solid #FFE4E1',
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  color: '#1a1a2e',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                We checked <strong>1 of {result.totalPlatforms} AI platforms</strong>. Sign up
                free to track all {result.totalPlatforms} platforms, monitor daily, and track your
                competitors.
              </p>
            </div>

            <Link
              href="/signup"
              style={{
                display: 'inline-block',
                padding: '14px 32px',
                borderRadius: 10,
                background: '#FF6154',
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'background .2s',
              }}
            >
              Start Tracking All {result.totalPlatforms} Platforms — Free
            </Link>
          </div>
        )}
      </section>
    </SeoLayout>
  );
}
