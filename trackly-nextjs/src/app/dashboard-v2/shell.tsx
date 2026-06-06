'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Dashboard shell: hash router, sidebar, topbar, subbar + the habit/comprehension
// overlays (glossary drawer, first-run tour, daily recap, streak, goal card).

import * as React from 'react';
import { Logo, Info, GLOSSARY, useLS, todayStr, dayDiff, lvCelebrate } from './ui';

export const NAV = [
  { label: 'Dashboard', items: [
    { id: 'overview',  label: 'Overview',         icon: '◧' },
    { id: 'mentions',  label: 'Mentions',         icon: '◎', badge: '1.2k' },
    { id: 'proof',     label: 'Evidence & Proof', icon: '◆' },
    { id: 'platforms', label: 'Platform Status',  icon: '●' },
  ] },
  { label: 'Discovery', items: [
    { id: 'prompt-discovery', label: 'Prompt Discovery', icon: '◈', badge: 'NEW' },
    { id: 'agent-analytics',  label: 'Agent Analytics',  icon: '◉', badge: 'NEW' },
  ] },
  { label: 'Analysis', items: [
    { id: 'competitors',     label: 'Competitors',      icon: '⊘' },
    { id: 'trends',          label: 'SOV Trends',       icon: '◆' },
    { id: 'accuracy',        label: 'Accuracy Monitor', icon: '◎', badge: '6' },
    { id: 'citations',       label: 'Citations',        icon: '◇' },
    { id: 'results',         label: 'Results',          icon: '☰' },
    { id: 'query-tracker',   label: 'Query Tracker',    icon: '◈' },
    { id: 'recommendations', label: 'Recommendations',  icon: '◆', badge: '12' },
  ] },
  { label: 'Tools', items: [
    { id: 'geo-audit',  label: 'GEO Audit',       icon: '◉' },
    { id: 'regional',   label: 'Regional Audits', icon: '◐' },
    { id: 'onboarding', label: 'Onboarding',      icon: '◇' },
  ] },
  { label: 'Settings', items: [
    { id: 'setup',   label: 'Brand Setup',    icon: '◇' },
    { id: 'prompts', label: 'Tracked Prompts', icon: '⚡' },
    { id: 'account', label: 'Account & Plan',  icon: '◉' },
    { id: 'billing', label: 'Billing & Usage', icon: '◆' },
    { id: 'alerts',  label: 'Alerts',          icon: '◈' },
  ] },
];

const GROUP_HELP: Record<string, string> = {
  Dashboard: 'Your daily at-a-glance - health score, live mentions and engine status.',
  Discovery: 'Find new questions buyers ask AI, and where AI agents send traffic.',
  Analysis: 'Dig deeper - competitors, long-term trends, accuracy and tracked questions.',
  Tools: 'Run an on-demand audit or check how you do by country.',
  Settings: 'Set up brands, the questions you track, billing and alerts.',
};

export const PAGES_FLAT = NAV.flatMap(g => g.items.map(it => ({ ...it, group: g.label })));
export function findPage(id: string) { return PAGES_FLAT.find(p => p.id === id) || PAGES_FLAT[0]; }

/* ───────────────────────────── Router ───────────────────────────── */

const ROUTER = React.createContext<{ page: string; go: (id: string) => void }>({ page: 'overview', go: () => {} });
export function useRouter() { return React.useContext(ROUTER); }

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = React.useState('overview');
  React.useEffect(() => {
    const read = () => {
      const h = (window.location.hash || '').replace('#', '');
      if (h && PAGES_FLAT.some(p => p.id === h)) setPage(h);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const go = React.useCallback((id: string) => {
    setPage(id);
    window.location.hash = id;
    document.querySelector('.lvx .canvas')?.scrollTo({ top: 0 });
  }, []);
  return <ROUTER.Provider value={{ page, go }}>{children}</ROUTER.Provider>;
}

/* ───────────────────────────── Extras (glossary / tour / recap / goal / streak) ───────────────────────────── */

interface ExtrasValue {
  glossaryOpen: boolean; openGlossary: () => void; closeGlossary: () => void;
  tourOpen: boolean; startTour: () => void; endTour: () => void;
  recapOpen: boolean; openRecap: () => void; closeRecap: () => void;
  streak: number; checkedInToday: boolean; doCheckIn: () => void;
  goal: { target: number; by: string }; setGoal: (g: any) => void;
  celebrate: (o?: any) => void;
}
const EXTRAS = React.createContext<ExtrasValue | null>(null);
export function useExtras() { return React.useContext(EXTRAS); }

export function ExtrasProvider({ children }: { children: React.ReactNode }) {
  const [glossaryOpen, setGlossaryOpen] = React.useState(false);
  const [tourOpen, setTourOpen] = React.useState(false);
  const [recapOpen, setRecapOpen] = React.useState(false);
  const [tourDone, setTourDone] = useLS('lvx_tour_done_v1', false);
  const [streak, setStreak] = useLS('lvx_streak', 0);
  const [lastCheckin, setLastCheckin] = useLS<string | null>('lvx_last_checkin', null);
  const [goal, setGoal] = useLS('lvx_goal', { target: 30, by: 'Jun 30' });

  const checkedInToday = lastCheckin === todayStr();
  const celebrate = React.useCallback((o?: any) => lvCelebrate(o), []);

  const doCheckIn = React.useCallback(() => {
    const today = todayStr();
    setStreak(prev => {
      if (lastCheckin === today) return prev || 1;
      if (lastCheckin && dayDiff(lastCheckin, today) === 1) return (prev || 0) + 1;
      return 1;
    });
    setLastCheckin(today);
    setTimeout(() => lvCelebrate({ count: 70 }), 120);
  }, [lastCheckin, setStreak, setLastCheckin]);

  const endTour = React.useCallback(() => {
    setTourOpen(false); setTourDone(true);
    if (!checkedInToday) setTimeout(() => setRecapOpen(true), 350);
  }, [checkedInToday, setTourDone]);

  const value: ExtrasValue = {
    glossaryOpen, openGlossary: () => setGlossaryOpen(true), closeGlossary: () => setGlossaryOpen(false),
    tourOpen, startTour: () => setTourOpen(true), endTour,
    recapOpen, openRecap: () => setRecapOpen(true), closeRecap: () => setRecapOpen(false),
    streak, checkedInToday, doCheckIn, goal, setGoal, celebrate,
  };
  return (
    <EXTRAS.Provider value={value}>
      {children}
      <GlossaryPanel open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />
      <Tour open={tourOpen} onClose={endTour} />
      <WhatChangedRecap />
    </EXTRAS.Provider>
  );
}

/* ───────────────────────────── Nav icons ───────────────────────────── */

function NavIcon({ id }: { id: string }) {
  const s: any = { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'overview': return <svg {...s}><rect x="2" y="2" width="4" height="4" /><rect x="8" y="2" width="4" height="4" /><rect x="2" y="8" width="4" height="4" /><rect x="8" y="8" width="4" height="4" /></svg>;
    case 'mentions': return <svg {...s}><path d="M2 4h10v6h-5l-3 2v-2H2z" /></svg>;
    case 'proof': return <svg {...s}><path d="M2 3h7l3 3v7H2z" /><path d="M9 3v3h3" /><path d="M5 8l2 2 3-3" /></svg>;
    case 'platforms': return <svg {...s}><circle cx="7" cy="7" r="5" /><path d="M2 7h10M7 2c1.5 2 1.5 8 0 10M7 2c-1.5 2-1.5 8 0 10" /></svg>;
    case 'competitors': return <svg {...s}><path d="M3 11V5l4-3 4 3v6" /><path d="M3 11h8" /></svg>;
    case 'trends': return <svg {...s}><path d="M2 11l3-3 2 2 5-5" /><path d="M12 5h-2V3" /></svg>;
    case 'accuracy': return <svg {...s}><circle cx="7" cy="7" r="5" /><path d="M5 7l2 2 3-3" /></svg>;
    case 'citations': return <svg {...s}><path d="M2 5c1-2 3-2 4-2v3c-1 0-2.5.5-2.5 2v2H2zM7.5 5c1-2 3-2 4-2v3c-1 0-2.5.5-2.5 2v2H7.5z" /></svg>;
    case 'results': return <svg {...s}><path d="M2 4h10M2 7h10M2 10h7" /></svg>;
    case 'query-tracker': return <svg {...s}><circle cx="6" cy="6" r="4" /><path d="M9 9l3 3" /></svg>;
    case 'recommendations': return <svg {...s}><path d="M7 2l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" /></svg>;
    case 'geo-audit': return <svg {...s}><circle cx="7" cy="6" r="3" /><path d="M7 9v3M4 12h6" /></svg>;
    case 'regional': return <svg {...s}><circle cx="7" cy="7" r="5" /><path d="M2 7h10M7 2c2 2 2 8 0 10M7 2c-2 2-2 8 0 10" /></svg>;
    case 'setup': return <svg {...s}><circle cx="7" cy="7" r="2" /><path d="M7 2v1.5M7 10.5V12M2 7h1.5M10.5 7H12M3.5 3.5l1 1M9.5 9.5l1 1M3.5 10.5l1-1M9.5 4.5l1-1" /></svg>;
    case 'prompts': return <svg {...s}><path d="M5 2L3 7l2 5M9 2l2 5-2 5" /></svg>;
    case 'prompt-discovery': return <svg {...s}><circle cx="6" cy="6" r="3" /><path d="M8 8l4 4" /><path d="M6 4v2M5 6h2" strokeWidth={1} /></svg>;
    case 'agent-analytics': return <svg {...s}><rect x="2" y="9" width="2" height="3" /><rect x="6" y="6" width="2" height="6" /><rect x="10" y="3" width="2" height="9" /><path d="M2 3l3 2 3-2 4 3" fill="none" strokeWidth={1.2} /></svg>;
    case 'onboarding': return <svg {...s}><path d="M3 11V5l4-3 4 3v6" /><path d="M5 11V8h4v3" /></svg>;
    case 'account': return <svg {...s}><circle cx="7" cy="5" r="2.5" /><path d="M3 12c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" /></svg>;
    case 'billing': return <svg {...s}><rect x="2" y="3.5" width="10" height="7" rx="1" /><path d="M2 6h10" /></svg>;
    case 'alerts': return <svg {...s}><path d="M3 6a4 4 0 018 0v2l1 2H2l1-2z" /><path d="M5.5 11.5a1.5 1.5 0 003 0" /></svg>;
    default: return <svg {...s}><circle cx="7" cy="7" r="2" /></svg>;
  }
}

/* ───────────────────────────── StartHere ───────────────────────────── */

function StartHere() {
  const ex = useExtras();
  const [dismissed, setDismissed] = useLS('lvx_starthere_dismissed', false);
  const { go } = useRouter();
  if (dismissed) return null;
  const steps = [
    { id: 'overview', n: '1', t: 'Overview', d: 'Your daily snapshot' },
    { id: 'mentions', n: '2', t: 'Mentions', d: 'Every AI answer about you' },
    { id: 'recommendations', n: '3', t: 'Recommendations', d: 'Do these to win' },
  ];
  return (
    <div className="start-here">
      <div className="sh-head">
        <span className="sh-title">New here? Start with these</span>
        <button className="sh-x" title="Dismiss" onClick={() => setDismissed(true)}>
          <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        </button>
      </div>
      {steps.map(s => (
        <button key={s.id} className="sh-step" onClick={() => go(s.id)}>
          <span className="sh-n mono">{s.n}</span>
          <span style={{ minWidth: 0 }}><span className="sh-t">{s.t}</span><span className="sh-d">{s.d}</span></span>
        </button>
      ))}
      {ex && <button className="sh-tour" onClick={ex.startTour}>▸ Take the 20-second tour</button>}
    </div>
  );
}

/* ───────────────────────────── Sidebar ───────────────────────────── */

export function Sidebar() {
  const { page, go } = useRouter();
  const [running, setRunning] = React.useState(false);
  const start = () => { setRunning(true); setTimeout(() => setRunning(false), 4500); };
  return (
    <aside className="sidebar">
      <button className="sb-run" onClick={start} disabled={running}>
        {running ? <><span className="pulse" /> Running…</> : <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 2L10 6L3 10Z" fill="currentColor" /></svg>
          Run all engines
        </>}
      </button>
      <StartHere />
      {NAV.map(group => (
        <div key={group.label} className="sb-group">
          <div className="sb-group-label">
            {group.label}
            {GROUP_HELP[group.label] && <Info term={null} size={11}>{GROUP_HELP[group.label]}</Info>}
          </div>
          {group.items.map(it => (
            <button key={it.id} className={'sb-item ' + (page === it.id ? 'on' : '')} onClick={() => go(it.id)}>
              <span className="sb-i"><NavIcon id={it.id} /></span>
              <span>{it.label}</span>
              {(it as any).badge && <span className="sb-badge">{(it as any).badge}</span>}
            </button>
          ))}
        </div>
      ))}
      <div className="sb-foot">
        <span className="av">N</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">Nikhil S.</div>
          <div className="plan">Team plan · $29/mo</div>
        </div>
        <button className="icon-btn" title="Sign out">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M5 2H3a1 1 0 00-1 1v7a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M8 4l3 2.5L8 9M11 6.5H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </aside>
  );
}

/* ───────────────────────────── Topbar ───────────────────────────── */

export function Topbar({ brandName = 'Acme PM', brandMeta = '3 / 5' }: { brandName?: string; brandMeta?: string }) {
  const ex = useExtras();
  return (
    <header className="topbar">
      <div className="topbar-left">
        <Logo size={14} />
        <span className="div" />
        <div className="brand-sel" tabIndex={0}>
          <span className="ptile ptile-chatgpt mono" style={{ width: 22, height: 22, fontSize: 9, background: 'linear-gradient(135deg, #6366F1, #4F46E5)' }}>AC</span>
          <span className="bs-name">{brandName}</span>
          <span className="bs-meta">{brandMeta}</span>
          <span className="bs-caret">▾</span>
        </div>
        <button className="btn-d" style={{ fontSize: 12 }}>+ Add brand</button>
        <div className="global-search">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Search prompts, mentions, sources…</span>
          <kbd>⌘ K</kbd>
        </div>
      </div>
      <div className="topbar-right">
        <StreakChip />
        <button className="icon-btn" title="Status">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7L5 10L12 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button className="icon-btn lv-help-btn" title="Glossary - what the words mean" onClick={() => ex && ex.openGlossary()}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5.5 5.5C5.5 4.5 6.2 4 7 4S8.5 4.5 8.5 5.5C8.5 6.5 7 6.5 7 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" /><circle cx="7" cy="9.5" r="0.6" fill="currentColor" /></svg>
        </button>
        <button className="icon-btn" title="Alerts">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 6C3 3.8 4.8 2 7 2C9.2 2 11 3.8 11 6V8L12 10H2L3 8V6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" /><path d="M5.5 11.5C5.5 12.3 6.2 13 7 13C7.8 13 8.5 12.3 8.5 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" /></svg>
          <span className="dot" />
        </button>
        <span className="plan-badge">TEAM</span>
        <button className="avatar">N</button>
      </div>
    </header>
  );
}

/* ───────────────────────────── Subbar ───────────────────────────── */

export function Subbar({ page, runAt = '2 min ago' }: { page: string; runAt?: string }) {
  const meta = findPage(page);
  return (
    <div className="subbar">
      <div className="breadcrumbs">
        <span>Livesov</span>
        <span className="crumb-sep">/</span>
        <span>{meta.group}</span>
        <span className="crumb-sep">/</span>
        <b>{meta.label}</b>
      </div>
      <div className="subbar-right">
        <span className="subbar-run"><span className="pulse" /> Last run · {runAt}</span>
        <button className="btn-d">Export</button>
        <button className="btn-d">Share</button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Shell ───────────────────────────── */

export function Shell({ children }: { children: React.ReactNode }) {
  const { page } = useRouter();
  return (
    <div className="app">
      <Topbar />
      <Sidebar />
      <main className="canvas">
        <Subbar page={page} />
        {children}
      </main>
    </div>
  );
}

/* ───────────────────────────── Habit / comprehension overlays ───────────────────────────── */

export function FlameIcon({ size = 13, on = true }: { size?: number; on?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.5c.4 2-1.2 2.8-2.2 4.2C3.9 6.8 3.5 7.8 3.5 8.8a3.5 3.5 0 007 0c0-1-.5-2-1.4-2.9C9.6 6.9 9 6.4 9 5.4c0-1 .7-1.6.4-2.6C10.8 3.6 11 5 11 5"
        fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

export function StreakChip() {
  const ex = useExtras();
  if (!ex) return null;
  const { streak, checkedInToday, openRecap } = ex;
  return (
    <button className={'streak-chip ' + (checkedInToday ? 'lit' : 'cold')} onClick={openRecap}
      title={checkedInToday ? `${streak}-day streak - checked in today` : 'Check in to keep your streak alive'}>
      <FlameIcon on={checkedInToday} />
      <span className="mono">{streak || 0}</span>
      {!checkedInToday && <span className="streak-dot" />}
    </button>
  );
}

export function WhatChangedRecap() {
  const ex = useExtras();
  const { go } = useRouter();
  if (!ex || !ex.recapOpen) return null;
  const { streak, checkedInToday, doCheckIn, closeRecap, goal } = ex;
  const changes = [
    { icon: '▲', tone: 'pos', t: 'Brand Health climbed to 78', d: '+6 points since you were last here', go: 'overview' },
    { icon: '★', tone: 'pos', t: 'You overtook Linear', d: 'Now #1 on 3 priority questions', go: 'competitors' },
    { icon: '✦', tone: 'info', t: '2 new things to try', d: 'Worth an est. +8.4 pts of Share of Voice', go: 'recommendations' },
    { icon: '⚠', tone: 'warn', t: '1 new false claim to fix', d: 'Grok said you have no AI features', go: 'mentions' },
  ];
  const jump = (id: string) => { go(id); closeRecap(); };
  return (
    <div className="recap-bg" onClick={closeRecap}>
      <div className="recap" onClick={e => e.stopPropagation()} role="dialog" aria-label="What changed">
        <button className="recap-x icon-btn" onClick={closeRecap} title="Close">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        <div className="recap-hd">
          <div className="recap-eyebrow eyebrow">SINCE YOU WERE GONE</div>
          <h2 className="recap-title">Welcome back, Nikhil.</h2>
          <p className="recap-sub">Here&rsquo;s what moved while you were away - tap any item to jump straight to it.</p>
        </div>
        <ul className="recap-list">
          {changes.map((c, i) => (
            <li key={i} className={'recap-row recap-' + c.tone} onClick={() => jump(c.go)}>
              <span className="recap-ic">{c.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div className="recap-t">{c.t}</div>
                <div className="recap-d">{c.d}</div>
              </div>
              <span className="recap-arrow">→</span>
            </li>
          ))}
        </ul>
        <div className="recap-foot">
          <div className="recap-streak">
            <FlameIcon size={18} on={checkedInToday || streak > 0} />
            <div>
              <div className="recap-streak-n"><b className="mono">{streak || 0}</b> day{streak === 1 ? '' : 's'} in a row</div>
              <div className="recap-streak-s">{checkedInToday ? 'Checked in today - see you tomorrow!' : `Goal: ${goal.target}% Share of Voice by ${goal.by}`}</div>
            </div>
          </div>
          {checkedInToday
            ? <button className="btn-g" onClick={closeRecap}>Jump in</button>
            : <button className="btn-p" onClick={doCheckIn}>Check in · keep streak</button>}
        </div>
      </div>
    </div>
  );
}

export function GoalCard({ current = 27.4 }: { current?: number }) {
  const ex = useExtras();
  const goal = ex?.goal || { target: 30, by: 'Jun 30' };
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<number | string>(goal.target);
  const pct = Math.max(0, Math.min(100, Math.round((current / goal.target) * 100)));
  const gap = (goal.target - current).toFixed(1);
  const hit = current >= goal.target;
  const save = () => {
    const n = Math.max(1, Math.min(100, Number(draft) || goal.target));
    ex?.setGoal({ ...goal, target: n });
    setEditing(false);
  };
  return (
    <section className="goal-card">
      <div className="goal-top">
        <div>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center' }}>YOUR GOAL <Info term="sov" /></div>
          {editing ? (
            <div className="goal-edit">
              <span>Reach</span>
              <input className="aud-input goal-input" type="number" min={1} max={100} value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
              <span>% Share of Voice</span>
              <button className="btn-p" style={{ padding: '5px 10px', fontSize: 11 }} onClick={save}>Save</button>
            </div>
          ) : (
            <div className="goal-line">
              Reach <b>{goal.target}% Share of Voice</b> by {goal.by}
              <button className="goal-edit-btn" onClick={() => { setDraft(goal.target); setEditing(true); }}>Edit</button>
            </div>
          )}
        </div>
        <div className="goal-now">
          <div className="goal-now-v mono">{current}<i>%</i></div>
          <div className="goal-now-l">today</div>
        </div>
      </div>
      <div className="goal-track">
        <i style={{ width: pct + '%' }} />
        <span className="goal-marker" style={{ left: '100%' }} title={`Target ${goal.target}%`} />
      </div>
      <div className="goal-foot">
        {hit
          ? <span className="pos" style={{ fontWeight: 600 }}>🎉 Goal reached - set a bolder target!</span>
          : <span><b className="mono" style={{ color: 'var(--text)' }}>{gap} points</b> to go - about <b>{Math.max(1, Math.ceil(Number(gap) / 0.6))} weeks</b> at your current pace.</span>}
        <span className="goal-pct mono">{pct}%</span>
      </div>
    </section>
  );
}

/* Glossary drawer */
function GlossaryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const order = ['sov', 'mention', 'engine', 'citation', 'hallucination', 'position', 'sentiment', 'health', 'coverage', 'prompt', 'intent', 'geo', 'audit', 'pp'];
  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Glossary">
        <header className="drawer-h">
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>What the words mean</div>
            <div className="quiet" style={{ fontSize: 12, marginTop: 2 }}>Plain-English definitions - no jargon required.</div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </header>
        <div className="drawer-b">
          <ul className="gloss-list">
            {order.map(k => {
              const g = GLOSSARY[k];
              return (
                <li key={k} className="gloss-item">
                  <div className="gloss-term">{g.term}</div>
                  <div className="gloss-short">{g.short}</div>
                  {g.why && <div className="gloss-why">{g.why}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </>
  );
}

/* First-run coachmark tour */
const TOUR_STEPS = [
  { sel: null, title: 'Welcome to Livesov 👋', body: 'Livesov watches how AI assistants - ChatGPT, Claude, Gemini and others - talk about your brand. Here’s a 20-second tour of the essentials.', cta: 'Show me' },
  { sel: '.hb', title: 'Your one number: Brand Health', body: 'A single 0–100 score for how you’re doing in AI answers. If you check one thing a day, make it this - and watch it climb.' },
  { sel: '.ins-strip', title: 'What needs you today', body: 'The 2–3 things worth acting on right now: a win to celebrate, a fix to make, or a play to run. Click any card to dive in.' },
  { sel: '.kpi-rail', title: 'Your headline stats', body: 'Share of Voice, mentions, sentiment and more - each with the change since last week. Hover any ⓘ to learn what it means.' },
  { sel: '.sb-run', title: 'Fresh data on demand', body: 'We re-ask every AI engine on a schedule. Want an update right now? Hit “Run all engines.”' },
  { sel: '.lv-help-btn', title: 'Never stuck on a word', body: 'Tap the ? anytime to open the glossary. That’s it - go win some answers.', cta: 'Start exploring' },
];

function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = React.useState(0);
  const [rect, setRect] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const step = TOUR_STEPS[i];
  const measure = React.useCallback(() => {
    if (!step || !step.sel) { setRect(null); return; }
    const el = document.querySelector('.lvx ' + step.sel) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [step]);
  React.useEffect(() => { if (open) setI(0); }, [open]);
  React.useEffect(() => {
    if (!open) return;
    measure();
    const on = () => measure();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [open, i, measure]);
  if (!open || !step) return null;
  const last = i === TOUR_STEPS.length - 1;
  const pad = 8;
  const cut = rect ? { left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 } : null;
  let card: any = { left: typeof window !== 'undefined' ? window.innerWidth / 2 : 0, top: typeof window !== 'undefined' ? window.innerHeight / 2 : 0, t: 'center' };
  if (cut && typeof window !== 'undefined') {
    const below = cut.top + cut.height + 200 < window.innerHeight;
    card = below
      ? { left: Math.max(220, Math.min(window.innerWidth - 220, cut.left + cut.width / 2)), top: cut.top + cut.height + 14, t: 'below' }
      : { left: Math.max(220, Math.min(window.innerWidth - 220, cut.left + cut.width / 2)), top: cut.top - 14, t: 'above' };
  }
  return (
    <div className="tour-root">
      {cut ? <div className="tour-cut" style={{ left: cut.left, top: cut.top, width: cut.width, height: cut.height }} /> : <div className="tour-dim" />}
      <div className={'tour-card tour-' + card.t} style={card.t === 'center' ? {} : { left: card.left, top: card.top }}>
        <div className="tour-step mono">STEP {i + 1} / {TOUR_STEPS.length}</div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-body">{step.body}</div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={onClose}>Skip tour</button>
          <div style={{ flex: 1 }} />
          {i > 0 && <button className="btn-g" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn-p" onClick={() => (last ? onClose() : setI(i + 1))}>{step.cta || (last ? 'Done' : 'Next')}</button>
        </div>
        <div className="tour-dots">
          {TOUR_STEPS.map((_, j) => <i key={j} className={j === i ? 'on' : ''} onClick={() => setI(j)} />)}
        </div>
      </div>
    </div>
  );
}
