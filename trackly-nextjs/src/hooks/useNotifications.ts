'use client';

import { useEffect, useState } from 'react';
import { api, isAbortError } from '@/lib/fetch-client';

export interface Notification {
  id: string;
  message: string;
  created_at: string;
  read: boolean;
}

interface NotificationsResponse {
  notifications?: Notification[];
}

/**
 * Fetches the current user's notifications once on mount.
 *
 * Uses an AbortController so the request is cancelled if the component
 * unmounts before it resolves - preventing "set state on unmounted
 * component" warnings and avoiding wasted network work.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    api<NotificationsResponse>('GET', '/api/notifications', undefined, {
      signal: controller.signal,
    })
      .then((data) => setNotifications(data.notifications || []))
      .catch((err) => {
        if (isAbortError(err)) return;
        // Soft-fail: notifications are non-critical UI.
      });

    return () => controller.abort();
  }, []);

  const unreadCount = notifications.reduce((n, notif) => (notif.read ? n : n + 1), 0);

  return { notifications, unreadCount };
}
