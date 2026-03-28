'use client';

import { useState, useEffect, useRef } from 'react';

interface Message { role: 'bot' | 'user'; content: string; }

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', content: 'Welcome! I can help you analyze your AI visibility data. Try asking:\n"Why is my SOV so low on some platforms?"\n"How can I improve my recommendation rate?"\n"Compare my performance across platforms"' }
  ]);
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

  return (
    <div>
      <div className="view-title">Copilot</div>
      <div className="view-sub">AI-powered assistant for visibility strategy and analysis.</div>

      <div className="card" style={{ minHeight: 400, display: 'flex', flexDirection: 'column', padding: 0 }}>
        {/* Chat History */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: 20, overflowY: 'auto', maxHeight: '60vh' }}>
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
                  // Make suggestion lines clickable
                  if (msg.role === 'bot' && line.startsWith('"') && line.endsWith('"')) {
                    return (
                      <div key={li}>
                        <span className="copilot-suggestion" onClick={() => send(line.replace(/"/g, ''))}>{line}</span>
                      </div>
                    );
                  }
                  return <div key={li}>{line}</div>;
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

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', padding: 12 }}>
          <input className="finp" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="Ask about your AI visibility..."
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
