import type { QueryClient } from '@tanstack/react-query';

export const NOTIFICATION_UNREAD_STALE_MS = 120_000;
export const notificationUnreadKey = (uid: string) => ['notification-unread', uid] as const;

type Listener = (uid: string) => void;
const listeners = new Set<Listener>();

// Carries the identity captured before the write, never the current account
// after it completes. Failed writes must not publish an unread change.
export function publishNotificationRead(uid: string) {
  listeners.forEach(listener => listener(uid));
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
      unsubscribe: subscribeNotificationReads(changedUid => {
        if (changedUid === uid) void client.invalidateQueries({ queryKey: notificationUnreadKey(uid), exact: true });
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