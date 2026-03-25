'use client';

import { useState, useEffect, useRef } from 'react';

interface Message { role: 'bot' | 'user'; content: string; }

const SUGGESTIONS = [
  'Why is my SOV so low on some platforms?',
  'How can I improve my recommendation rate?',
  'Compare my performance across platforms',
];

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', content: 'Hi! I\'m your AI visibility copilot. I can help you analyze your brand\'s performance across AI platforms, suggest strategies to improve your share of voice, and answer questions about your data. What would you like to explore?' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return;
    const userMsg: Message = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), history: [...messages, userMsg].map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'bot', content: data.reply || data.message || 'Sorry, I could not generate a response. Please try again.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const showSuggestions = messages.length === 1;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text)] mb-2">Copilot</h1>
      <p className="text-[var(--muted)] mb-6">AI-powered assistant for visibility strategy and analysis.</p>

      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl shadow-[var(--app-shadow)] flex flex-col" style={{ minHeight: '400px' }}>
        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'bot' && (
                <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold">AI</div>
              )}
              <div className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'bot' ? 'bg-[var(--primary-light)] text-[var(--text)]' : 'bg-[var(--bg3)] text-[var(--text)]'}`}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Suggestion Prompts */}
          {showSuggestions && (
            <div className="flex flex-wrap gap-2 mt-2 pl-11">
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => sendMessage(s)} className="px-3 py-2 rounded-lg text-sm bg-[var(--bg3)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)] transition-colors">
                  {s}
                </button>
              ))}
            </div>
          )}

          {sending && (
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-bold">AI</div>
              <div className="bg-[var(--primary-light)] rounded-xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-[var(--muted)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="border-t border-[var(--border)] p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your AI visibility..."
              className="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-md text-sm px-4 py-2.5 outline-none focus:border-[var(--primary)] placeholder:text-[var(--muted)]"
            />
            <button onClick={() => sendMessage(input)} disabled={!input.trim() || sending} className="px-5 py-2.5 rounded-lg text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
