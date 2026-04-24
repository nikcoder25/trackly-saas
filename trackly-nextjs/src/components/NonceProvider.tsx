'use client';

import { createContext, useContext, type ReactNode } from 'react';

// Surfaces the per-request CSP nonce (set by middleware as `x-nonce`) to
// client components that need to stamp it onto inline <script> elements.
// Server components should read the nonce directly from `headers()` instead.
const NonceContext = createContext<string>('');

export function NonceProvider({ nonce, children }: { nonce: string; children: ReactNode }) {
  return <NonceContext.Provider value={nonce}>{children}</NonceContext.Provider>;
}

export function useNonce(): string {
  return useContext(NonceContext);
}
