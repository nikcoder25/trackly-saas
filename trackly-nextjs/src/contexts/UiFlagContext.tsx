'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  UI_FLAG_KEY, UI_FLAG_PARAM, parseUiVersion, readUiCookie, resolveUiVersion, uiFlagCookie,
  type UiVersion,
} from '@/lib/ui-flag';

interface UiFlagContextType {
  ui: UiVersion;
  isV3: boolean;
  setUi: (v: UiVersion) => void;
}

const UiFlagContext = createContext<UiFlagContextType>({ ui: 'classic', isV3: false, setUi: () => {} });

function persist(v: UiVersion) {
  try { document.cookie = uiFlagCookie(v, window.location.protocol === 'https:'); } catch { /* ignore */ }
  try { window.localStorage.setItem(UI_FLAG_KEY, v); } catch { /* storage unavailable */ }
}

/**
 * Holds the dashboard design choice. `initial` comes from the cookie the
 * server layout read, so the first paint already uses the right shell. On
 * mount we apply a `?ui=` override and fall back to localStorage when the
 * cookie was cleared.
 */
export function UiFlagProvider({ initial, children }: { initial: UiVersion; children: ReactNode }) {
  const [ui, setUiState] = useState<UiVersion>(initial);

  useEffect(() => {
    let param: string | null = null;
    let stored: string | null = null;
    try { param = new URLSearchParams(window.location.search).get(UI_FLAG_PARAM); } catch { /* ignore */ }
    try { stored = window.localStorage.getItem(UI_FLAG_KEY); } catch { /* ignore */ }
    const cookie = readUiCookie(document.cookie);
    const next = resolveUiVersion({ param, cookie, stored });
    // Only write when something needs syncing, so a classic user who never
    // touched the switch gets no cookie and no storage entry.
    if (parseUiVersion(param) || (!parseUiVersion(cookie) && parseUiVersion(stored))) persist(next);
    setUiState(next);
  }, []);

  // Lets v3 styles reach things rendered outside the shell (toasts, modals
  // portalled to <body>). Removed when the dashboard unmounts.
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.ui = ui;
    return () => { delete el.dataset.ui; };
  }, [ui]);

  const setUi = useCallback((v: UiVersion) => {
    persist(v);
    setUiState(v);
  }, []);

  return <UiFlagContext.Provider value={{ ui, isV3: ui === 'v3', setUi }}>{children}</UiFlagContext.Provider>;
}

export function useUiFlag() {
  return useContext(UiFlagContext);
}
