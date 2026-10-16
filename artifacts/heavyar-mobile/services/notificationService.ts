import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getFirebaseAuth } from './firebaseConfig';
import { signOut } from 'firebase/auth';
import { WORKER_BASE_URL } from '@/constants/worker';
import { publishNotificationRead } from './notificationUnreadPolicy';
import { assertNotificationIdentity } from './notificationOperationGuard';
import { mobilePerformance } from '@/utils/mobilePerformance';
import { verificationDestination } from '@/constants/releaseCapabilities';

const INSTALLATION_KEY = 'heavyar_installation_id';
const INSTALLATION_GENERATION_KEY = 'heavyar_notification_registration_generation';
const PAGE_SIZE = 20;

export type NotificationCategory =
  | 'rental'
  | 'service'
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
  | { type: 'service_rfq'; subjectId: string }
  | { type: 'service_execution'; subjectId: string }
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
  service: boolean;
  payment: boolean;
  verification: boolean;
  complaint: boolean;
  security: boolean;
};

const defaultPreferences: NotificationPreferences = {
  rental: true,
  service: true,
  payment: true,
  verification: true,
  complaint: true,
  security: true,
};
const INSTALLATION_TOKEN_KEY = 'heavyar_installation_push_token';

type DeviceRegistrationSession = {
  uid: string;
  authUser: object;
  generation: number;
  epoch: number;
  status: 'active' | 'revoked';
  queue: Promise<void>;
  pendingByToken: Map<string, Promise<DeviceRegistrationResult>>;
  controllers: Set<AbortController>;
  lastRegisteredToken: string | null;
};

let deviceRegistrationEpoch = 0;
let deviceRegistrationSession: DeviceRegistrationSession | null = null;
let pendingDeviceSession: { uid: string; authUser: object; promise: Promise<DeviceRegistrationSession> } | null = null;

function abortDeviceRegistrationSession(session: DeviceRegistrationSession | null) {
  if (!session) return;
  session.status = 'revoked';
  for (const controller of session.controllers) controller.abort();
  session.controllers.clear();
}

async function nextDeviceRegistrationGeneration(): Promise<number> {
  const stored = Number(await AsyncStorage.getItem(INSTALLATION_GENERATION_KEY));
  const generation = Math.max(Date.now(), Number.isSafeInteger(stored) && stored > 0 ? stored + 1 : 1);
  await AsyncStorage.setItem(INSTALLATION_GENERATION_KEY, String(generation));
  return generation;
}

async function currentDeviceRegistrationSession(uid: string): Promise<DeviceRegistrationSession> {
  const authUser = getFirebaseAuth().currentUser;
  assertNotificationIdentity(uid, authUser?.uid);
  if (!authUser) throw new Error('AUTH_REQUIRED');
  if (deviceRegistrationSession?.uid === uid
    && deviceRegistrationSession.authUser === authUser
    && deviceRegistrationSession.status === 'active') return deviceRegistrationSession;
  if (deviceRegistrationSession?.uid === uid
    && deviceRegistrationSession.authUser === authUser
    && deviceRegistrationSession.status === 'revoked') throw new Error('SESSION_EXPIRED');
  if (pendingDeviceSession?.uid === uid && pendingDeviceSession.authUser === authUser) return pendingDeviceSession.promise;

  abortDeviceRegistrationSession(deviceRegistrationSession);
  deviceRegistrationSession = null;
  const epoch = ++deviceRegistrationEpoch;
  const promise = (async () => {
    const generation = await nextDeviceRegistrationGeneration();
    if (deviceRegistrationEpoch !== epoch || getFirebaseAuth().currentUser !== authUser) throw new Error('SESSION_EXPIRED');
    const session: DeviceRegistrationSession = {
      uid,
      authUser,
      generation,
      epoch,
      status: 'active',
      queue: Promise.resolve(),
      pendingByToken: new Map(),
      controllers: new Set(),
      lastRegisteredToken: null,
    };
    deviceRegistrationSession = session;
    return session;
  })();
  pendingDeviceSession = { uid, authUser, promise };
  try {
    return await promise;
  } finally {
    if (pendingDeviceSession?.promise === promise) pendingDeviceSession = null;
  }
}

function assertDeviceRegistrationSession(session: DeviceRegistrationSession, signal?: AbortSignal) {
  assertNotificationIdentity(session.uid, getFirebaseAuth().currentUser?.uid, signal);
  if (signal?.aborted
    || session.status !== 'active'
    || deviceRegistrationSession !== session
    || deviceRegistrationEpoch !== session.epoch
    || getFirebaseAuth().currentUser !== session.authUser) throw new Error('SESSION_EXPIRED');
}

async function registerDeviceToken(
  session: DeviceRegistrationSession,
  token: string,
  platform: string,
  signal?: AbortSignal,
): Promise<DeviceRegistrationResult> {
  assertDeviceRegistrationSession(session, signal);
  if (session.lastRegisteredToken === token) return { status: 'registered', token };
  const pending = session.pendingByToken.get(token);
  if (pending) return pending;

  const previous = session.queue;
  const operation = (async () => {
    await previous.catch(() => undefined);
    assertDeviceRegistrationSession(session, signal);
    const controller = new AbortController();
    const abort = () => controller.abort();
    session.controllers.add(controller);
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', abort, { once: true });
    try {
      const currentInstallationId = await installationId();
      assertDeviceRegistrationSession(session, controller.signal);
      await request('/api/notifications/devices', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          token,
          installationId: currentInstallationId,
          platform,
          registrationGeneration: session.generation,
        }),
      }, session.uid);
      assertDeviceRegistrationSession(session, controller.signal);
      await AsyncStorage.setItem(INSTALLATION_TOKEN_KEY, token);
      assertDeviceRegistrationSession(session, controller.signal);
      session.lastRegisteredToken = token;
      return { status: 'registered', token } as DeviceRegistrationResult;
    } finally {
      signal?.removeEventListener('abort', abort);
      session.controllers.delete(controller);
    }
  })();
  session.pendingByToken.set(token, operation);
  session.queue = operation.then(() => undefined, () => undefined);
  void operation.finally(() => {
    if (session.pendingByToken.get(token) === operation) session.pendingByToken.delete(token);
  }).catch(() => undefined);
  return operation;
}

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
  const label = path.startsWith('/api/notifications/unread-count') ? 'notifications.unread'
    : path === '/api/notifications' || path.startsWith('/api/notifications?') ? 'notifications.list'
      : path.includes('/preferences') ? 'notifications.preferences'
        : path.includes('/devices') ? 'notifications.devices' : 'notifications.mutation';
  const send = async (authToken: string) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        mobilePerformance.trackNetwork(label, async () => {
          const response = await fetch(`${WORKER_BASE_URL}${path}`, {
            ...init,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
              ...(init?.headers || {}),
            },
          });
          return { response, text: await mobilePerformance.readResponseText(response, label) };
        }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('NOTIFICATIONS_TIMEOUT')), 15_000); }),
      ]);
    } catch (error) {
      if (init?.signal?.aborted) mobilePerformance.markCancellation(label);
      else if (error instanceof Error && error.message === 'NOTIFICATIONS_TIMEOUT') mobilePerformance.markTimeout(label);
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
  let exchange = await send(token);
  let response = exchange.response;
  assertCurrent();
  if (response.status === 401 && user) {
    const refreshedToken = await user.getIdToken(true);
    assertCurrent();
    exchange = await send(refreshedToken);
    response = exchange.response;
    assertCurrent();
    if (response.status === 401) {
      await signOut(auth).catch(() => undefined);
      throw new Error('SESSION_EXPIRED');
    }
  }
  let body: any = {};
  try { body = mobilePerformance.parseJson(exchange.text, label) || {}; } catch { /* handled as unavailable */ }
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
  | { status: 'web' | 'permission-not-granted' | 'permission-denied' | 'missing-project-id' | 'invalid-token' };

export async function registerCurrentDevice(
  expectedUid?: string,
  requestPermission = false,
  options: { signal?: AbortSignal } = {},
): Promise<DeviceRegistrationResult> {
  if (Platform.OS === 'web') return { status: 'web' };
  const auth = getFirebaseAuth();
  const uid = expectedUid ?? auth.currentUser?.uid ?? '';
  const initialUser = auth.currentUser;
  const session = await currentDeviceRegistrationSession(uid);
  const assertCurrent = () => {
    assertNotificationIdentity(uid, auth.currentUser?.uid, options.signal);
    if (auth.currentUser !== initialUser) throw new Error('SESSION_EXPIRED');
    assertDeviceRegistrationSession(session, options.signal);
  };
  assertCurrent();
  const Notifications = await import('expo-notifications');
  const Constants = await import('expo-constants');
  assertCurrent();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Heavyar',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    assertCurrent();
  }
  const permissions = await Notifications.getPermissionsAsync();
  assertCurrent();
  if (!permissions.granted && !requestPermission) return { status: 'permission-not-granted' };
  const granted = permissions.granted || (await Notifications.requestPermissionsAsync()).granted;
  assertCurrent();
  if (!granted) return { status: 'permission-denied' };
  const projectId = Constants.default.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return { status: 'missing-project-id' };
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  assertCurrent();
  if (!/^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(token)) return { status: 'invalid-token' };
  return registerDeviceToken(session, token, Platform.OS, options.signal);
}

/** Must be called only from an explicit user action. */
export async function enablePushNotifications(expectedUid: string) {
  return registerCurrentDevice(expectedUid, true);
}

type PushTokenRefreshSubscriptionOptions = {
  signal?: AbortSignal;
  isCurrent?: () => boolean;
};

function pushTokenRefreshKey(token: { type?: unknown; data?: unknown }): string {
  let data = '';
  try {
    data = typeof token.data === 'string' ? token.data : JSON.stringify(token.data ?? null);
  } catch {
    data = String(token.data ?? '');
  }
  return `${String(token.type ?? '').slice(0, 32)}:${data.slice(0, 4096)}`;
}

export async function subscribeToPushTokenRefresh(
  expectedUid: string,
  options: PushTokenRefreshSubscriptionOptions = {},
): Promise<() => void> {
  if (Platform.OS === 'web' || options.signal?.aborted) return () => undefined;
  const Notifications = await import('expo-notifications');
  if (options.signal?.aborted
    || !(options.isCurrent?.() ?? true)
    || getFirebaseAuth().currentUser?.uid !== expectedUid) return () => undefined;

  let disposed = false;
  let registrationInFlight = false;
  let activeTokenKey: string | null = null;
  let queuedTokenKey: string | null = null;
  let lastHandledTokenKey: string | null = null;
  const isCurrent = () => !disposed
    && !options.signal?.aborted
    && (options.isCurrent?.() ?? true)
    && getFirebaseAuth().currentUser?.uid === expectedUid;

  const registerToken = (tokenKey: string): void => {
    if (!isCurrent() || tokenKey === activeTokenKey || tokenKey === lastHandledTokenKey) return;
    if (registrationInFlight) {
      queuedTokenKey = tokenKey;
      return;
    }
    registrationInFlight = true;
    activeTokenKey = tokenKey;
    void registerCurrentDevice(expectedUid, false, { signal: options.signal }).then(() => {
      if (isCurrent()) lastHandledTokenKey = tokenKey;
    }).catch(() => undefined).finally(() => {
      registrationInFlight = false;
      activeTokenKey = null;
      const nextTokenKey = queuedTokenKey;
      queuedTokenKey = null;
      if (nextTokenKey) registerToken(nextTokenKey);
    });
  };

  const subscription = Notifications.addPushTokenListener((token) => {
    registerToken(pushTokenRefreshKey(token));
  });
  const remove = () => {
    if (disposed) return;
    disposed = true;
    queuedTokenKey = null;
    options.signal?.removeEventListener('abort', remove);
    subscription.remove();
  };
  if (options.signal?.aborted) remove();
  else options.signal?.addEventListener('abort', remove, { once: true });
  return remove;
}

export async function revokeCurrentDevice(): Promise<void> {
  const auth = getFirebaseAuth();
  const authUser = auth.currentUser;
  const uid = authUser?.uid ?? '';
  assertNotificationIdentity(uid, authUser?.uid);
  if (!authUser) throw new Error('AUTH_REQUIRED');
  let session: DeviceRegistrationSession;
  if (deviceRegistrationSession?.uid === uid && deviceRegistrationSession.authUser === authUser) {
    session = deviceRegistrationSession;
  } else if (pendingDeviceSession?.uid === uid && pendingDeviceSession.authUser === authUser) {
    session = await pendingDeviceSession.promise;
  } else {
    session = await currentDeviceRegistrationSession(uid);
  }
  abortDeviceRegistrationSession(session);
  deviceRegistrationEpoch += 1;
  const token = await AsyncStorage.getItem(INSTALLATION_TOKEN_KEY);
  const currentInstallationId = await installationId();
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await request('/api/notifications/devices', {
          method: 'DELETE',
          body: JSON.stringify({
            ...(token ? { token } : {}),
            installationId: currentInstallationId,
            platform: Platform.OS,
            registrationGeneration: session.generation,
          }),
        }, uid);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if ((error as Error).message === 'SESSION_EXPIRED') throw error;
      }
    }
    if (lastError) throw lastError;
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
    notifications: raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const item = entry as NotificationItem & { action?: unknown; subjectId?: unknown };
      const structured = item.action && typeof item.action === 'object' ? item.action as { type?: unknown; subjectId?: unknown } : null;
      const subjectId = typeof structured?.subjectId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(structured.subjectId) ? structured.subjectId : undefined;
      const rawAction: string = String(structured?.type || '');
      const action = rawAction === 'request' && subjectId ? { type: 'request' as const, subjectId }
        : rawAction === 'payment' && subjectId ? { type: 'payment' as const, subjectId }
          : rawAction === 'complaint' && subjectId ? { type: 'complaint' as const, subjectId }
            : rawAction === 'service_rfq' && subjectId ? { type: 'service_rfq' as const, subjectId }
              : rawAction === 'service_execution' && subjectId ? { type: 'service_execution' as const, subjectId }
                : rawAction === 'verification' ? { type: 'verification' as const, ...(subjectId ? { subjectId } : {}) }
              : rawAction === 'profile' ? { type: 'profile' as const, ...(subjectId ? { subjectId } : {}) } : undefined;
      // Do not let malformed server records reach the renderer. In
      // particular, legacy records may have no action (or a non-object
      // action), which is a valid inbox-only notification.
      if (typeof item.id !== 'string' || !item.id) return [];
      return [{ ...item, action }];
    }),
    unreadCount: result.unreadCount!,
    hasMore: result.hasMore === true,
    nextPageToken: result.nextPageToken || null,
  };
}

export async function markNotificationRead(id: string, expectedUid?: string): Promise<number> {
  if (!/^[A-Za-z0-9:_-]{3,180}$/.test(id)) throw new Error('INVALID_NOTIFICATION');
  const uid = expectedUid ?? getFirebaseAuth().currentUser?.uid;
  let changed = false;
  try {
    await request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' }, expectedUid);
    changed = true;
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
  } catch (error) {
    // The write may have succeeded even when reconciliation failed. Let
    // mounted badge consumers refresh rather than leaving a stale count.
    if (changed && uid) publishNotificationRead({ uid, type: 'invalidate' });
    throw error;
  }
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
  if (typeof action !== 'object' || typeof action.type !== 'string') return null;
  switch (action.type) {
    case 'request':
      return typeof action.subjectId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(action.subjectId)
        ? `/request/${encodeURIComponent(action.subjectId)}` : null;
    case 'payment':
      return typeof action.subjectId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(action.subjectId)
        ? `/payment/${encodeURIComponent(action.subjectId)}` : null;
    case 'verification': return verificationDestination();
    case 'service_rfq':
      return typeof action.subjectId === 'string' && /^rfq_[A-Za-z0-9_-]{43}$/.test(action.subjectId)
        ? `/service-rfq/${encodeURIComponent(action.subjectId)}` : null;
    case 'service_execution':
      return typeof action.subjectId === 'string' && /^execution_[A-Za-z0-9_-]{43}$/.test(action.subjectId)
        ? `/service-execution/${encodeURIComponent(action.subjectId)}` : null;
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
    case 'verification': return verificationDestination();
    case 'service_rfq': return subjectId ? notificationActionRoute({ type: 'service_rfq', subjectId }) : null;
    case 'service_execution': return subjectId ? notificationActionRoute({ type: 'service_execution', subjectId }) : null;
    case 'complaint': return subjectId ? notificationActionRoute({ type: 'complaint', subjectId }) : null;
    case 'profile': return '/(tabs)/profile';
    case 'inbox': return '/notifications';
    default: return null;
  }
}

export { defaultPreferences };
