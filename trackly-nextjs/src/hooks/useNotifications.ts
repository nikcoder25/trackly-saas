'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, isAbortError } from '@/lib/fetch-client';
import { useCredits } from '@/contexts/CreditsContext';
import {
  evaluateUsageAlerts,
  markUsageAlertRead,
} from '@/lib/usage-alert-notifications';

export interface Notification {
  id: string;
  message: string;
  created_at: string;
  read: boolean;
  /**
   * Optional click target. Server notifications don't currently set
   * this; client-synthesized usage alerts always do.
   */
  href?: string;
  /**
   * Marks rows produced client-side (e.g. usage alerts) so the bell
   * can route the read action through the right marker - server rows
   * use POST /api/notifications/read, client ones go to localStorage.
   */
  source?: 'usage-alert';
}

interface NotificationsResponse {
  notifications?: Notification[];
}

/**
 * Fetches the current user's server notifications once on mount and
 * merges them with client-synthesized usage alerts (which fire when
 * the user crosses 80% / 95% / 100% of their monthly credit cap).
 *
 * Uses an AbortController so the server request is cancelled if the
 * component unmounts before it resolves - preventing "set state on
 * unmounted component" warnings and avoiding wasted network work.
 *
 * The usage-alert evaluator re-runs whenever the credit status
 * changes; it's pure-on-input + idempotent within a billing period
 * (see lib/usage-alert-notifications.ts), so re-runs are cheap and
 * don't double-fire alerts.
 */
export function useNotifications() {
  const [serverNotifs, setServerNotifs] = useState<Notification[]>([]);
  const [alertNotifs, setAlertNotifs] = useState<Notification[]>([]);
  const { status } = useCredits();

  // Server fetch - once on mount.
  useEffect(() => {
    const controller = new AbortController();
    api<NotificationsResponse>('GET', '/api/notifications', undefined, {
      signal: controller.signal,
    })
      .then((data) => setServerNotifs(data.notifications || []))
      .catch((err) => {
        if (isAbortError(err)) return;
        // Soft-fail: notifications are non-critical UI.
      });
    return () => controller.abort();
  }, []);

  // Re-evaluate usage alerts whenever the credit status changes (or
  // arrives for the first time). The evaluator handles the
  // "don't re-fire" logic via a localStorage map keyed by
  // status.nextResetAt.
  useEffect(() => {
    setAlertNotifs(evaluateUsageAlerts(status));
  }, [
    status?.monthlyUsed,
    status?.monthlyCap,
    status?.nextResetAt,
    status?.plan,
  ]);

  const markRead = useCallback((id: string) => {
    // Client-synthesized usage alert? Update localStorage and
    // re-evaluate so the optimistic UI flips to read immediately.
    if (id.startsWith('usage-alert-')) {
      markUsageAlertRead(id);
      setAlertNotifs(evaluateUsageAlerts(status));
      return;
    }
    // Server notification - call the existing read endpoint and
    // optimistically flip read state in local list.
    setServerNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    api('POST', '/api/notifications/read', { ids: [Number(id)] }).catch(() => {});
  }, [status]);

  const notifications = useMemo<Notification[]>(() => {
    return [...alertNotifs, ...serverNotifs].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [alertNotifs, serverNotifs]);

  const unreadCount = notifications.reduce((n, notif) => (notif.read ? n : n + 1), 0);

  return { notifications, unreadCount, markRead };
}
