'use client';
// Avatar menu shared by the classic and v3 topbars. It carries the design
// switch ("Try the new design" / "Back to classic design").

import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useUiFlag } from '@/contexts/UiFlagContext';
import { V3Icon } from './icons';
import './v3.css';

function useOutsideClose(open: boolean, close: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

export default function AccountMenu({ variant }: { variant: 'v3' | 'classic' }) {
  const { user, logout } = useAuth();
  const { ui, setUi } = useUiFlag();
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const letter = user?.name?.[0]?.toUpperCase() || 'U';
  return (
    <div className={variant === 'v3' ? 'v3-acct' : 'lvx-acct'} ref={ref} style={{ position: 'relative' }}>
      <button type="button" className={variant === 'v3' ? 'v3-avatar' : 'avatar'} title={user?.email || ''}
        aria-label="Account menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {letter}
      </button>
      {open && (
        <div className={variant === 'v3' ? 'v3-menu v3-acct-menu' : 'lvx-acct-menu'} role="menu">
          <div className={variant === 'v3' ? 'v3-menu-head' : 'lvx-acct-head'}>
            <b>{user?.name || 'Your account'}</b>
            <span>{user?.email}</span>
          </div>
          <Link href="/dashboard/account" role="menuitem" className={variant === 'v3' ? 'v3-menu-item' : 'lvx-acct-item'} onClick={close}>
            {variant === 'v3' && <V3Icon name="user" size={16} />}Account &amp; Plan
          </Link>
          <Link href="/dashboard/billing" role="menuitem" className={variant === 'v3' ? 'v3-menu-item' : 'lvx-acct-item'} onClick={close}>
            {variant === 'v3' && <V3Icon name="card" size={16} />}Billing &amp; Usage
          </Link>
          <button type="button" role="menuitem" data-testid="ui-switch"
            className={variant === 'v3' ? 'v3-menu-item' : 'lvx-acct-item lvx-acct-try'}
            onClick={() => { close(); setUi(ui === 'v3' ? 'classic' : 'v3'); }}>
            {variant === 'v3' && <V3Icon name="switch" size={16} />}
            {ui === 'v3' ? 'Back to classic design' : 'Try the new design'}
          </button>
          <button type="button" role="menuitem" className={variant === 'v3' ? 'v3-menu-item' : 'lvx-acct-item'} onClick={() => { close(); logout(); }}>
            {variant === 'v3' && <V3Icon name="logout" size={16} />}Sign out
          </button>
        </div>
      )}
    </div>
  );
}

