'use client';

import { useState, useEffect, useRef } from 'react';

interface Message { role: 'bot' | 'user'; content: string; }

const suggestedQueries = [
  'Why is my SOV so low on some platforms?',
  'How can I improve my recommendation rate?',
  'Compare my performance across platforms',
  'What content should I create to boost visibility?',
  'Which platform should I focus on first?',
];

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send(text?: string) {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    const userMsg: Message = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: [...messages, userMsg].map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'bot', content: data.reply || data.message || 'Sorry, I could not generate a response.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally { setSending(false); }
  }

  const isEmpty = messages.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 52px - 40px)' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <div className="view-title">Copilot</div>
      <div className="view-sub" style={{ marginBottom: 12 }}>AI-powered assistant for visibility strategy and analysis.</div>

      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, minHeight: 0 }}>
        {/* Chat History */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 20, overflowY: 'auto' }}>
          {isEmpty && !sending && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>◈</div>
              <div style={{ textAlign: 'center', maxWidth: 400 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Ask me anything about your AI visibility</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>I can analyze your data, suggest strategies, and help you understand your brand&apos;s presence across AI platforms.</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 500 }}>
                {suggestedQueries.map((q) => (
                  <button key={q} onClick={() => send(q)}
                    style={{
                      background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)',
                      fontSize: 12, padding: '8px 14px', borderRadius: 100, cursor: 'pointer',
                      transition: 'all .15s ease', fontFamily: 'var(--font)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {msg.role === 'bot' && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12 }}>◈</div>
              )}
              <div style={{
                background: msg.role === 'bot' ? 'var(--bg3)' : 'var(--primary-light)',
                padding: '12px 16px', borderRadius: msg.role === 'bot' ? '12px 12px 12px 4px' : '12px 12px 4px 12px',
                fontSize: 12, lineHeight: 1.6, maxWidth: '80%', whiteSpace: 'pre-wrap',
                marginLeft: msg.role === 'user' ? 'auto' : 0,
                color: 'var(--text)',
              }}>
                {msg.content.split('\n').map((line, li) => {
                  if (msg.role === 'bot' && line.startsWith('"') && line.endsWith('"')) {
                    return (
                      <div key={li}>
                        <span className="copilot-suggestion" onClick={() => send(line.replace(/"/g, ''))}>{line}</span>
                      </div>
                    );
                  }
                  if (msg.role === 'bot') {
                    let escaped = line
                      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                    let html = escaped
                      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                      .replace(/`(.+?)`/g, '<code style="background:var(--bg);padding:1px 4px;border-radius:3px;font-family:var(--mono);font-size:11px;">$1</code>');
                    if (/^#{1,3}\s/.test(line)) html = `<strong>${html.replace(/^#{1,3}\s/, '')}</strong>`;
                    if (/^[-•]\s/.test(line)) html = `&nbsp;&nbsp;• ${html.replace(/^[-•]\s/, '')}`;
                    return <div key={li} dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />;
                  }
                  return <div key={li}>{line || '\u00A0'}</div>;
                })}
              </div>
            </div>
          ))}
          {sending && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12 }}>◈</div>
              <div style={{ background: 'var(--bg3)', padding: '12px 16px', borderRadius: '12px 12px 12px 4px', fontSize: 12, color: 'var(--muted)' }}>
                Thinking<span style={{ animation: 'pulse 1s infinite' }}>...</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Sticky Input */}
        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', padding: 12, flexShrink: 0 }}>
          <input className="finp" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="e.g., Why is my SOV low on Gemini?"
            style={{ flex: 1, margin: 0, padding: '10px 14px' }} />
          <button onClick={() => send()} disabled={sending}
            style={{ padding: '10px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-xs)', fontFamily: 'var(--font)', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
