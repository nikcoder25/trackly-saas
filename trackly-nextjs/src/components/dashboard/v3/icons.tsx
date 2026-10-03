'use client';
// Inline 1.5px-stroke icons for the v3 dashboard. No emoji, no icon font.

import * as React from 'react';

export type V3IconName =
  | 'overview' | 'prompts' | 'competitors' | 'sources' | 'fixes' | 'reports' | 'audits' | 'settings'
  | 'search' | 'bell' | 'menu' | 'close' | 'chevron-down' | 'chevron-right' | 'plus' | 'play'
  | 'download' | 'arrow-right' | 'check' | 'logout' | 'user' | 'card' | 'sparkle' | 'switch' | 'clock'
  | 'flame' | 'trophy' | 'target' | 'arrow-up' | 'arrow-down' | 'check-circle';

const PATHS: Record<V3IconName, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  prompts: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
  competitors: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  sources: <><path d="M4 5a2 2 0 012-2h9l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></>,
  fixes: <><path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></>,
  reports: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 17v-4M12 17v-7M15 17v-2" /></>,
  audits: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4M8 11l2 2 4-4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  bell: <><path d="M6 9a6 6 0 0112 0v4l2 3H4l2-3z" /><path d="M10 19a2 2 0 004 0" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  'chevron-down': <><path d="M6 9l6 6 6-6" /></>,
  'chevron-right': <><path d="M9 6l6 6-6 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  play: <><path d="M7 5l12 7-12 7z" /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></>,
  'arrow-right': <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  check: <><path d="M5 12l5 5 9-10" /></>,
  logout: <><path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4" /><path d="M15 8l4 4-4 4M19 12H9" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></>,
  sparkle: <><path d="M12 3l2 5.5L19.5 10 14 12l-2 5.5L10 12 4.5 10 10 8.5z" /></>,
  switch: <><path d="M4 8h13l-3-3M20 16H7l3 3" /></>,
  flame: <><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.6-8.3.3 1.8 1.3 3 2.4 3.6.2-2.6 1.5-5 3.6-6.6-.3 2.6.6 4.4 1.8 6 1 1.4 1.6 2.9 1.6 4.8 0 4-2.6 6.7-6.5 6.7z" /><path d="M12 21c-1.6 0-2.8-1.2-2.8-2.9 0-1.6 1.2-2.6 1.8-4 .9 1.1 2 1.5 2.7 2.5.5.6.8 1.2.8 2 0 1.4-1 2.4-2.5 2.4z" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 01-8 0z" /><path d="M8 6H5v1.5A3 3 0 008 10.4M16 6h3v1.5a3 3 0 01-3 2.9M12 13v4M8.5 20h7M10 17h4v3h-4z" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  'arrow-up': <><path d="M12 19V6M6.5 11.5L12 6l5.5 5.5" /></>,
  'arrow-down': <><path d="M12 5v13M6.5 12.5L12 18l5.5-5.5" /></>,
  'check-circle': <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16.5 9.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
};

export function V3Icon({ name, size = 18, className, style }: { name: V3IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
      {PATHS[name]}
    </svg>
  );
}
