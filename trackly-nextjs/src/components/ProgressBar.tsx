'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';

export default function ProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPath = useRef(pathname);
  // Hold the in-flight animation timeouts so they can be cleared on the next
  // navigation / unmount instead of leaking (a click handler can't return a
  // cleanup fn - React discards it).
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    if (pathname !== prevPath.current) {
      // Route changed - finish the bar
      clearTimers();
      setProgress(100);
      const t = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
      prevPath.current = pathname;
      return () => clearTimeout(t);
    }
  }, [pathname]);

  // Start the bar on click of any internal link
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Ignore clicks that won't drive an in-place navigation: modified clicks
      // (new tab / download / etc.), non-primary buttons, already-handled
      // events, or links that open in a new tab - otherwise the bar starts and
      // never finishes because the pathname never changes.
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      if (anchor.target === '_blank') return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) return;
      if (href === pathname) return;
      clearTimers();
      setVisible(true);
      setProgress(30);
      // Animate to ~80% over time
      timers.current.push(setTimeout(() => setProgress(60), 100));
      timers.current.push(setTimeout(() => setProgress(80), 300));
    };
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('click', onClick); clearTimers(); };
  }, [pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: '#6366f1',
          transition: progress === 100 ? 'width 0.2s ease, opacity 0.3s ease 0.1s' : 'width 0.4s ease',
          opacity: progress === 100 ? 0 : 1,
          boxShadow: '0 0 8px rgba(99, 102, 241, 0.4)',
        }}
      />
    </div>
  );
}
