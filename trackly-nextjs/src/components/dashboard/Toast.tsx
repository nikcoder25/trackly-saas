'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() { return useContext(ToastContext); }

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, type, message }].slice(-5));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const colors = {
    success: { bg: 'rgba(16,185,129,.08)', border: 'rgba(16,185,129,.25)', text: 'var(--green)', icon: '✓' },
    error: { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.25)', text: 'var(--red)', icon: '✗' },
    info: { bg: 'rgba(99,102,241,.08)', border: 'rgba(99,102,241,.25)', text: 'var(--primary)', icon: 'ℹ' },
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div role="alert" aria-live="assertive" style={{ position: 'fixed', top: 16, right: 16, zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
          {toasts.map(t => {
            const c = colors[t.type];
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px',
                background: 'var(--bg2)', border: `1px solid ${c.border}`,
                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                minWidth: 260, maxWidth: 400, pointerEvents: 'auto',
                animation: 'toastSlideIn .3s ease',
              }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: c.text, flexShrink: 0 }}>
                  {c.icon}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: 1.4 }}>{t.message}</span>
                <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0 }}>&times;</button>
              </div>
            );
          })}
        </div>
      )}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}
