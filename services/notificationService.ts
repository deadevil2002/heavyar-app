import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getFirebaseAuth } from './firebaseConfig';
import { signOut } from 'firebase/auth';
import { WORKER_BASE_URL } from '@/constants/worker';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = getFirebaseAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const send = (authToken: string) => fetch(`${WORKER_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...(init?.headers || {}),
    },
  });
  let response = await send(token);
  if (response.status === 401 && auth.currentUser) {
    response = await send(await auth.currentUser.getIdToken(true));
    if (response.status === 401) {
      await signOut(auth).catch(() => undefined);
      throw new Error('SESSION_EXPIRED');
    }
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const error = new Error(typeof body.error === 'string' ? body.error : response.status === 401 ? 'SESSION_EXPIRED' : 'NOTIFICATIONS_UNAVAILABLE');
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return (body.data ?? body) as T;
}

export async function registerCurrentDevice(): Promise<void> {
  if (Platform.OS === 'web') return;
  const Notifications = await import('expo-notifications');
  const Constants = await import('expo-constants');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Heavyar',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const permissions = await Notifications.getPermissionsAsync();
  const finalStatus = permissions.status === 'granted'
    ? permissions.status
    : (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== 'granted') return;
  const projectId = Constants.default.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!/^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(token)) return;
  await request('/api/notifications/devices', {
    method: 'POST',
    body: JSON.stringify({ token, installationId: await installationId(), platform: Platform.OS }),
  });
  await AsyncStorage.setItem(INSTALLATION_TOKEN_KEY, token);
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
    const status = current.status === 'granted' ? current.status : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const Constants = await import('expo-constants');
    const projectId = Constants.default.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return /^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export async function listNotifications(pageToken?: string | null): Promise<NotificationPage> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (pageToken) query.set('cursor', pageToken);
  const result = await request<Partial<NotificationPage>>(`/api/notifications?${query.toString()}`);
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
    unreadCount: Number(result.unreadCount || 0),
    hasMore: result.hasMore === true,
    nextPageToken: result.nextPageToken || null,
  };
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!/^[A-Za-z0-9:_-]{3,180}$/.test(id)) throw new Error('INVALID_NOTIFICATION');
  await request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' });
}

export async function markAllNotificationsRead(maxPasses = 10): Promise<{ hasMore: boolean; remainingCount: number }> {
  let remainingCount = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    const result = await request<{ hasMore?: boolean; remainingCount?: number }>('/api/notifications/read-all', { method: 'POST', body: '{}' });
    if (result.hasMore === false) return { hasMore: false, remainingCount: Number(result.remainingCount || 0) };
    const page = await listNotifications();
    remainingCount = page.unreadCount;
    if (!remainingCount) return { hasMore: false, remainingCount: 0 };
    if (result.hasMore === undefined && pass >= maxPasses - 1) break;
  }
  return { hasMore: true, remainingCount };
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const result = await request<{ preferences?: Partial<NotificationPreferences> }>('/api/notifications/preferences');
  return { ...defaultPreferences, ...(result.preferences || {}) };
}

export async function updateNotificationPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences> {
  const result = await request<{ preferences?: Partial<NotificationPreferences> }>('/api/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify(preferences),
  });
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