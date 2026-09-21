import type { QueryClient } from '@tanstack/react-query';

export const NOTIFICATION_UNREAD_STALE_MS = 120_000;
export const notificationUnreadKey = (uid: string) => ['notification-unread', uid] as const;

export type NotificationUnreadChange =
  | { uid: string; type: 'replace'; unreadCount: number }
  | { uid: string; type: 'invalidate' };
type Listener = (change: NotificationUnreadChange) => void;
const listeners = new Set<Listener>();

// Carries the identity captured before the write, never the current account
// after it completes. Successful known mutations patch the shared cache
// directly; only an indeterminate partial operation needs another count read.
export function publishNotificationRead(change: NotificationUnreadChange) {
  listeners.forEach(listener => listener(change));
}

export function subscribeNotificationReads(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Tabs and Home share one subscription per client/identity. Releasing one
// observer must not cancel a request or evict data used by the other.
const cacheSubscriptions = new WeakMap<QueryClient, Map<string, { users: number; unsubscribe: () => void }>>();
export function retainNotificationUnread(client: QueryClient, uid: string) {
  let identities = cacheSubscriptions.get(client);
  if (!identities) { identities = new Map(); cacheSubscriptions.set(client, identities); }
  let entry = identities.get(uid);
  if (!entry) {
    entry = {
      users: 0,
      unsubscribe: subscribeNotificationReads(change => {
        if (change.uid !== uid) return;
        const queryKey = notificationUnreadKey(uid);
        if (change.type === 'replace') {
          client.setQueryData(queryKey, change.unreadCount);
        } else {
          void client.invalidateQueries({ queryKey, exact: true });
        }
      }),
    };
    identities.set(uid, entry);
  }
  entry.users++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--entry.users > 0) return;
    entry.unsubscribe();
    identities.delete(uid);
    void client.cancelQueries({ queryKey: notificationUnreadKey(uid), exact: true });
    client.removeQueries({ queryKey: notificationUnreadKey(uid), exact: true });
  };
}