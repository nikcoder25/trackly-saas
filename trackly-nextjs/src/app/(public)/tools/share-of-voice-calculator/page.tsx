'use client';

import { useState, useMemo } from 'react';
import ToolPage, { cardStyle, inputStyle, labelStyle } from '@/components/tools/ToolPage';

interface BrandRow {
  id: number;
  name: string;
  mentions: number;
}

let nextId = 4;

export default function ShareOfVoiceCalculatorPage() {
  const [totalResponses, setTotalResponses] = useState<number>(100);
  const [yourBrand, setYourBrand] = useState<string>('Your brand');
  const [yourMentions, setYourMentions] = useState<number>(0);
  const [competitors, setCompetitors] = useState<BrandRow[]>([
    { id: 1, name: 'Competitor 1', mentions: 0 },
    { id: 2, name: 'Competitor 2', mentions: 0 },
    { id: 3, name: 'Competitor 3', mentions: 0 },
  ]);

  const rows = useMemo(() => {
    const all = [{ id: 0, name: yourBrand || 'Your brand', mentions: yourMentions, isYou: true }, ...competitors.map((c) => ({ ...c, isYou: false }))];
    const total = Math.max(totalResponses, 1);
    return all.map((r) => ({
      ...r,
      sov: (r.mentions / total) * 100,
    }));
  }, [totalResponses, yourBrand, yourMentions, competitors]);

  const yourSov = rows[0].sov;
  const sumMentions = rows.reduce((s, r) => s + r.mentions, 0);
  const overMentioned = sumMentions > totalResponses;

  const updateCompetitor = (id: number, patch: Partial<BrandRow>) => {
    setCompetitors((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const addCompetitor = () => {
    setCompetitors((prev) => [...prev, { id: nextId++, name: `Competitor ${prev.length + 1}`, mentions: 0 }]);
  };

  const removeCompetitor = (id: number) => {
    setCompetitors((prev) => prev.filter((c) => c.id !== id));
  };

  const downloadCsv = () => {
    const header = 'Brand,Mentions,Total Responses,Share of Voice (%)';
    const lines = rows.map((r) => `"${r.name.replace(/"/g, '""')}",${r.mentions},${totalResponses},${r.sov.toFixed(2)}`);
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-share-of-voice.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ToolPage
      title={<>AI <span style={{ color: 'var(--brand)' }}>Share of Voice</span> Calculator</>}
      subtitle="Enter how often each brand was mentioned across your AI responses to compute share of voice."
      toolName="AI Share of Voice Calculator"
      toolSlug="share-of-voice-calculator"
    >
      <div style={cardStyle}>
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="totalResponses" style={labelStyle}>Total AI responses sampled</label>
          <input
            id="totalResponses"
            type="number"
            min={1}
            value={totalResponses}
            onChange={(e) => setTotalResponses(Math.max(1, parseInt(e.target.value || '1', 10)))}
            style={{ ...inputStyle, maxWidth: 220 }}
          />
          <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
            Run the same prompt N times across ChatGPT, Perplexity, Claude, Gemini, Grok and count the responses.
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: '0 0 12px' }}>Your brand</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 12 }}>
            <input
              type="text"
              value={yourBrand}
              onChange={(e) => setYourBrand(e.target.value)}
              style={inputStyle}
            />
            <input
              type="number"
              min={0}
              value={yourMentions}
              onChange={(e) => setYourMentions(Math.max(0, parseInt(e.target.value || '0', 10)))}
              style={inputStyle}
              aria-label="Mentions"
            />
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Competitors</h3>
            <button
              type="button"
              onClick={addCompetitor}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e0e0e0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              + Add competitor
            </button>
          </div>
          {competitors.map((c) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 40px', gap: 12, marginBottom: 10 }}>
              <input
                type="text"
                value={c.name}
                onChange={(e) => updateCompetitor(c.id, { name: e.target.value })}
                style={inputStyle}
              />
              <input
                type="number"
                min={0}
                value={c.mentions}
                onChange={(e) => updateCompetitor(c.id, { mentions: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                style={inputStyle}
                aria-label="Mentions"
              />
              <button
                type="button"
                onClick={() => removeCompetitor(c.id)}
                aria-label="Remove"
                style={{ borderRadius: 8, border: '1px solid #f0f0f0', background: '#fff', color: '#9ca3af', cursor: 'pointer', fontSize: 18 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {overMentioned && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 13, border: '1px solid #fde68a' }}>
            Total mentions ({sumMentions}) exceed total responses ({totalResponses}). That&apos;s fine if multiple brands appear in the same response, but raise the total if you&apos;re tracking unique appearances.
          </div>
        )}
      </div>

      <div style={{ ...cardStyle, marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Results</h2>
          <button
            type="button"
            onClick={downloadCsv}
            style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Download CSV
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 64, fontWeight: 800, color: 'var(--brand)', lineHeight: 1 }}>{yourSov.toFixed(1)}%</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>{yourBrand}&apos;s AI share of voice</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows
            .slice()
            .sort((a, b) => b.sov - a.sov)
            .map((r) => (
              <div key={r.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: r.isYou ? 700 : 500, color: '#1a1a2e' }}>{r.name}{r.isYou ? ' (you)' : ''}</span>
                  <span style={{ color: '#6b7280' }}>{r.mentions} / {totalResponses} = <strong style={{ color: '#1a1a2e' }}>{r.sov.toFixed(1)}%</strong></span>
                </div>
                <div style={{ width: '100%', height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(r.sov, 100)}%`, height: '100%', background: r.isYou ? 'var(--brand)' : '#9ca3af' }} />
                </div>
              </div>
            ))}
        </div>
      </div>
    </ToolPage>
  );
}
