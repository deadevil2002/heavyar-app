import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getFirebaseAuth } from './firebaseConfig';
import { signOut } from 'firebase/auth';
import { WORKER_BASE_URL } from '@/constants/worker';
import { publishNotificationRead } from './notificationUnreadPolicy';
import { assertNotificationIdentity } from './notificationOperationGuard';
import { mobilePerformance } from '@/utils/mobilePerformance';

const INSTALLATION_KEY = 'heavyar_installation_id';
const PAGE_SIZE = 20;

export type NotificationCategory =
  | 'rental'
  | 'payment'
  | 'verification'
  | 'complaint'
  | 'security';

export type NotificationItem = {
  id: string;
  category: NotificationCategory;
  titleAr: string;
  titleEn: string;
  bodyAr?: string;
  bodyEn?: string;
  read: boolean;
  createdAt: string;
  action?: NotificationAction;
};

export type NotificationAction =
  | { type: 'request'; subjectId: string }
  | { type: 'payment'; subjectId: string }
  | { type: 'verification'; subjectId?: string }
  | { type: 'complaint'; subjectId: string }
  | { type: 'profile'; subjectId?: string };

export type NotificationPage = {
  notifications: NotificationItem[];
  unreadCount: number;
  hasMore?: boolean;
  nextPageToken?: string | null;
};

// Notification read state is monotonic. A page request that began before a
// successful read must not turn that item unread again when its stale response
// arrives. Refresh still replaces membership; pagination appends/deduplicates.
export function mergeNotificationPage(current: NotificationItem[], incoming: NotificationItem[], append: boolean): NotificationItem[] {
  const currentById = new Map(current.map(item => [item.id, item]));
  const reconciled = incoming.map(item => currentById.get(item.id)?.read ? { ...item, read: true } : item);
  if (!append) return reconciled;
  return [...new Map([...current, ...reconciled].map(item => [item.id, item])).values()];
}

export type NotificationPreferences = {
  rental: boolean;
  payment: boolean;
  verification: boolean;
  complaint: boolean;
  security: boolean;
};

const defaultPreferences: NotificationPreferences = {
  rental: true,
  payment: true,
  verification: true,
  complaint: true,
  security: true,
};
const INSTALLATION_TOKEN_KEY = 'heavyar_installation_push_token';

async function installationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (existing && /^[a-zA-Z0-9_-]{16,80}$/.test(existing)) return existing;
  const value = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  await AsyncStorage.setItem(INSTALLATION_KEY, value);
  return value;
}

async function request<T>(path: string, init?: RequestInit, expectedUid?: string): Promise<T> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  const uid = expectedUid ?? user?.uid ?? '';
  const assertCurrent = () => {
    assertNotificationIdentity(uid, auth.currentUser?.uid, init?.signal);
    if (auth.currentUser !== user) throw new Error('SESSION_EXPIRED');
  };
  assertCurrent();
  const token = await user?.getIdToken();
  assertCurrent();
  if (!token) throw new Error('AUTH_REQUIRED');
  const send = (authToken: string) => mobilePerformance.trackNetwork('notifications', () => fetch(`${WORKER_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...(init?.headers || {}),
    },
  }));
  let response = await send(token);
  assertCurrent();
  if (response.status === 401 && user) {
    const refreshedToken = await user.getIdToken(true);
    assertCurrent();
    response = await send(refreshedToken);
    assertCurrent();
    if (response.status === 401) {
      await signOut(auth).catch(() => undefined);
      throw new Error('SESSION_EXPIRED');
    }
  }
  const body = await response.json().catch(() => ({}));
  assertCurrent();
  if (!response.ok || body.success === false) {
    const error = new Error(typeof body.error === 'string' ? body.error : response.status === 401 ? 'SESSION_EXPIRED' : 'NOTIFICATIONS_UNAVAILABLE');
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return (body.data ?? body) as T;
}

export type DeviceRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'web' | 'permission-denied' | 'missing-project-id' | 'invalid-token' };

export async function registerCurrentDevice(): Promise<DeviceRegistrationResult> {
  if (Platform.OS === 'web') return { status: 'web' };
  const Notifications = await import('expo-notifications');
  const Constants = await import('expo-constants');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Heavyar',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const permissions = await Notifications.getPermissionsAsync();
  const granted = permissions.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return { status: 'permission-denied' };
  const projectId = Constants.default.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return { status: 'missing-project-id' };
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!/^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(token)) return { status: 'invalid-token' };
  await request('/api/notifications/devices', {
    method: 'POST',
    body: JSON.stringify({ token, installationId: await installationId(), platform: Platform.OS }),
  });
  await AsyncStorage.setItem(INSTALLATION_TOKEN_KEY, token);
  return { status: 'registered', token };
}

export async function subscribeToPushTokenRefresh(): Promise<() => void> {
  if (Platform.OS === 'web') return () => undefined;
  const Notifications = await import('expo-notifications');
  const subscription = Notifications.addPushTokenListener(() => {
    void registerCurrentDevice().catch(() => undefined);
  });
  return () => subscription.remove();
}

export async function revokeCurrentDevice(): Promise<void> {
  const token = await AsyncStorage.getItem(INSTALLATION_TOKEN_KEY);
  if (!token) return;
  try {
    await request('/api/notifications/devices', {
      method: 'DELETE',
      body: JSON.stringify({ token, installationId: await installationId(), platform: Platform.OS }),
    });
    await AsyncStorage.removeItem(INSTALLATION_TOKEN_KEY);
  } catch (error) {
    if ((error as Error).message === 'SESSION_EXPIRED') await AsyncStorage.removeItem(INSTALLATION_TOKEN_KEY);
    throw error;
  }
}

/** Backwards-compatible permission helper; never logs or persists the token. */
export async function requestNotificationPermission(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const Notifications = await import('expo-notifications');
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;
    const Constants = await import('expo-constants');
    const projectId = Constants.default.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return /^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export async function getNotificationUnreadCount(expectedUid: string, signal?: AbortSignal): Promise<number> {
  const result = await request<{ unreadCount: number }>('/api/notifications/unread-count', { signal }, expectedUid);
  if (!Number.isSafeInteger(result.unreadCount) || result.unreadCount < 0) {
    throw new Error('NOTIFICATION_COUNT_INVALID');
  }
  return result.unreadCount;
}

export async function listNotifications(pageToken?: string | null, expectedUid?: string): Promise<NotificationPage> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (pageToken) query.set('cursor', pageToken);
  const result = await request<Partial<NotificationPage>>(`/api/notifications?${query.toString()}`, undefined, expectedUid);
  if (!Number.isSafeInteger(result.unreadCount) || Number(result.unreadCount) < 0) throw new Error('NOTIFICATION_COUNT_INVALID');
  const raw = Array.isArray(result.notifications) ? result.notifications : [];
  return {
    notifications: raw.map((entry) => {
      const item = entry as NotificationItem & { action?: unknown; subjectId?: unknown };
      const structured = item.action && typeof item.action === 'object' ? item.action as { type?: unknown; subjectId?: unknown } : null;
      const subjectId = typeof structured?.subjectId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(structured.subjectId) ? structured.subjectId : undefined;
      const rawAction: string = String(structured?.type || '');
      const action = rawAction === 'request' && subjectId ? { type: 'request' as const, subjectId }
        : rawAction === 'payment' && subjectId ? { type: 'payment' as const, subjectId }
          : rawAction === 'complaint' && subjectId ? { type: 'complaint' as const, subjectId }
            : rawAction === 'verification' ? { type: 'verification' as const, ...(subjectId ? { subjectId } : {}) }
              : rawAction === 'profile' ? { type: 'profile' as const, ...(subjectId ? { subjectId } : {}) } : undefined;
      return { ...item, action };
    }),
    unreadCount: result.unreadCount!,
    hasMore: result.hasMore === true,
    nextPageToken: result.nextPageToken || null,
  };
}

export async function markNotificationRead(id: string, expectedUid?: string): Promise<number> {
  if (!/^[A-Za-z0-9:_-]{3,180}$/.test(id)) throw new Error('INVALID_NOTIFICATION');
  const uid = expectedUid ?? getFirebaseAuth().currentUser?.uid;
  await request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' }, expectedUid);
  // The read endpoint is intentionally idempotent and does not currently
  // report whether the document was already read. Reconcile once with the
  // authoritative aggregate instead of optimistically decrementing: a retry,
  // stale cursor page, or already-read document must never double-decrement.
  if (uid) {
    const unreadCount = await getNotificationUnreadCount(uid);
    publishNotificationRead({ uid, type: 'replace', unreadCount });
    return unreadCount;
  }
  throw new Error('AUTH_REQUIRED');
}

export async function markAllNotificationsRead(maxPasses = 10, expectedUid?: string): Promise<{ hasMore: boolean; remainingCount: number }> {
  const uid = expectedUid ?? getFirebaseAuth().currentUser?.uid;
  let remainingCount = 0;
  let changed = false;
  let exactResult = false;
  try {
    for (let pass = 0; pass < maxPasses; pass++) {
      if (getFirebaseAuth().currentUser?.uid !== uid) throw new Error('SESSION_EXPIRED');
      const result = await request<{ hasMore?: boolean }>('/api/notifications/read-all', { method: 'POST', body: '{}' }, uid);
      changed = true;
      if (result.hasMore === false) {
        exactResult = true;
        return { hasMore: false, remainingCount: 0 };
      }
      // Modern bounded endpoint tells us whether another batch is needed;
      // do not aggregate on every batch in addition to cache invalidation.
      if (result.hasMore === undefined) {
        remainingCount = await getNotificationUnreadCount(uid || '');
        if (!remainingCount) {
          exactResult = true;
          return { hasMore: false, remainingCount: 0 };
        }
      }
    }
    remainingCount = await getNotificationUnreadCount(uid || '');
    exactResult = true;
    return { hasMore: remainingCount > 0, remainingCount };
  } finally {
    // One cache event per operation. Complete/known results avoid a duplicate
    // count request; only a partial failure is invalidated for reconciliation.
    if (changed && uid) publishNotificationRead(exactResult
      ? { uid, type: 'replace', unreadCount: remainingCount }
      : { uid, type: 'invalidate' });
  }
}

export async function getNotificationPreferences(expectedUid?: string): Promise<NotificationPreferences> {
  const result = await request<{ preferences?: Partial<NotificationPreferences> }>('/api/notifications/preferences', undefined, expectedUid);
  return { ...defaultPreferences, ...(result.preferences || {}) };
}

export async function updateNotificationPreferences(preferences: NotificationPreferences, expectedUid?: string): Promise<NotificationPreferences> {
  const result = await request<{ preferences?: Partial<NotificationPreferences> }>('/api/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  }, expectedUid);
  return { ...defaultPreferences, ...(result.preferences || preferences) };
}

export function notificationActionRoute(action?: NotificationAction): string | null {
  if (!action) return null;
  switch (action.type) {
    case 'request': return `/request/${encodeURIComponent(action.subjectId)}`;
    case 'payment': return `/payment/${encodeURIComponent(action.subjectId)}`;
    case 'verification': return '/verification';
    // There is no standalone complaint route yet; profile is the safe authenticated destination.
    case 'complaint': return '/(tabs)/profile';
    case 'profile': return '/(tabs)/profile';
    default: return null;
  }
}

export function notificationRouteFromPayload(data: Record<string, unknown> | null | undefined): string | null {
  if (!data || typeof data.action !== 'string') return null;
  const subjectId = typeof data.subjectId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(data.subjectId) ? data.subjectId : null;
  switch (data.action) {
    case 'request': return subjectId ? notificationActionRoute({ type: 'request', subjectId }) : null;
    case 'payment': return subjectId ? notificationActionRoute({ type: 'payment', subjectId }) : null;
    case 'verification': return '/verification';
    case 'complaint': return subjectId ? notificationActionRoute({ type: 'complaint', subjectId }) : null;
    case 'profile': return '/(tabs)/profile';
    case 'inbox': return '/notifications';
    default: return null;
  }
}

export { defaultPreferences };