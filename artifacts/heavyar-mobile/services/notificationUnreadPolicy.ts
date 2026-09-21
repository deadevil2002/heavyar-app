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