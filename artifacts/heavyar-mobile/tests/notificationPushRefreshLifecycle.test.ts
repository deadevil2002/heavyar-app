import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'customer-A', getIdToken: vi.fn(async () => 'token-A') } as any },
  addPushTokenListener: vi.fn(),
  getPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  remove: vi.fn(),
  pushListener: null as null | ((token: unknown) => void),
  storage: new Map<string, string>(),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-notifications', () => ({
  addPushTokenListener: mocks.addPushTokenListener,
  getPermissionsAsync: mocks.getPermissionsAsync,
  getExpoPushTokenAsync: mocks.getExpoPushTokenAsync,
  requestPermissionsAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { eas: { projectId: 'test-project' } } } } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mocks.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { mocks.storage.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { mocks.storage.delete(key); }),
  },
}));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('../services/firebaseConfig', () => ({ getFirebaseAuth: () => mocks.auth }));
vi.mock('@/constants/worker', () => ({ WORKER_BASE_URL: 'https://worker.test' }));
vi.mock('../services/notificationUnreadPolicy', () => ({ publishNotificationRead: vi.fn() }));
vi.mock('@/utils/mobilePerformance', () => ({
  mobilePerformance: {
    trackNetwork: vi.fn(async (_label: string, operation: () => Promise<unknown>) => operation()),
    readResponseText: vi.fn(async (response: Response) => response.text()),
    parseJson: vi.fn((text: string) => JSON.parse(text)),
    markCancellation: vi.fn(),
    markTimeout: vi.fn(),
  },
}));
vi.mock('@/constants/releaseCapabilities', () => ({ verificationDestination: vi.fn(() => '/verification') }));

// Module-level mocks must be registered before this import.
// eslint-disable-next-line import/first
import { registerCurrentDevice, revokeCurrentDevice, subscribeToPushTokenRefresh } from '../services/notificationService';

const token = (data: string) => ({ type: 'ios', data });

describe('push-token refresh listener lifecycle', () => {
  beforeEach(() => {
    mocks.auth.currentUser = { uid: 'customer-A', getIdToken: vi.fn(async () => 'token-A') };
    mocks.remove.mockReset();
    mocks.pushListener = null;
    mocks.storage.clear();
    mocks.storage.set('heavyar_installation_id', 'installation_123456');
    mocks.addPushTokenListener.mockReset().mockImplementation((listener: (value: unknown) => void) => {
      mocks.pushListener = listener;
      return { remove: mocks.remove };
    });
    mocks.getPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
    mocks.getExpoPushTokenAsync.mockReset().mockResolvedValue({ data: 'ExpoPushToken[test_token_A]' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }))));
  });

  it('removes the native listener exactly once and ignores events after disposal', async () => {
    const remove = await subscribeToPushTokenRefresh('customer-A');
    expect(mocks.addPushTokenListener).toHaveBeenCalledTimes(1);
    remove();
    remove();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    mocks.pushListener?.(token('native-A'));
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('coalesces repeated tokens, serializes changed tokens, and never overlaps registration', async () => {
    let releaseFirst!: (value: Response) => void;
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    vi.mocked(fetch)
      .mockImplementationOnce(() => {
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        return new Promise<Response>((resolve) => {
          releaseFirst = (value) => { activeRequests -= 1; resolve(value); };
        });
      })
      .mockImplementationOnce(async () => {
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        activeRequests -= 1;
        return new Response(JSON.stringify({ success: true }));
      });

    const remove = await subscribeToPushTokenRefresh('customer-A');
    mocks.pushListener?.(token('native-A'));
    mocks.pushListener?.(token('native-A'));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    mocks.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExpoPushToken[test_token_B]' });
    mocks.pushListener?.(token('native-B'));
    mocks.pushListener?.(token('native-B'));
    expect(fetch).toHaveBeenCalledTimes(1);
    releaseFirst(new Response(JSON.stringify({ success: true })));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(maximumActiveRequests).toBe(1);
    remove();
  });

  it('rejects token events after the listener identity becomes obsolete', async () => {
    let current = true;
    const remove = await subscribeToPushTokenRefresh('customer-A', { isCurrent: () => current });
    current = false;
    mocks.auth.currentUser = { uid: 'customer-B', getIdToken: vi.fn(async () => 'token-B') };
    mocks.pushListener?.(token('native-B'));
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
    remove();
  });

  it('aborts an installed listener once and suppresses later registration work', async () => {
    const controller = new AbortController();
    await subscribeToPushTokenRefresh('customer-A', { signal: controller.signal });
    controller.abort();
    controller.abort();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    mocks.pushListener?.(token('native-A'));
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fences a POST that resolves after logout DELETE even before token persistence', async () => {
    let finishPost!: (value: Response) => void;
    const calls: { method: string; body: any }[] = [];
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const method = String(init?.method || 'GET');
      calls.push({ method, body: JSON.parse(String(init?.body || '{}')) });
      if (method === 'POST') return new Promise<Response>((resolve) => { finishPost = resolve; });
      return new Response(JSON.stringify({ success: true }));
    });

    const registration = registerCurrentDevice('customer-A');
    await vi.waitFor(() => expect(calls.some(call => call.method === 'POST')).toBe(true));
    await revokeCurrentDevice();
    const post = calls.find(call => call.method === 'POST');
    const deletion = calls.find(call => call.method === 'DELETE');
    expect(deletion).toBeTruthy();
    expect(deletion?.body.token).toBeUndefined();
    expect(deletion?.body.registrationGeneration).toBe(post?.body.registrationGeneration);
    finishPost(new Response(JSON.stringify({ success: true })));
    await expect(registration).rejects.toThrow(/SESSION_EXPIRED|NOTIFICATION_REQUEST_ABORTED/);
    expect(mocks.storage.has('heavyar_installation_push_token')).toBe(false);
  });

  it('uses increasing installation generations across A to B to A sessions', async () => {
    const bodies: any[] = [];
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body || '{}')));
      return new Response(JSON.stringify({ success: true }));
    });
    await registerCurrentDevice('customer-A');
    await revokeCurrentDevice();
    mocks.auth.currentUser = { uid: 'customer-B', getIdToken: vi.fn(async () => 'token-B') };
    mocks.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExpoPushToken[test_token_B]' });
    await registerCurrentDevice('customer-B');
    await revokeCurrentDevice();
    mocks.auth.currentUser = { uid: 'customer-A', getIdToken: vi.fn(async () => 'token-A2') };
    mocks.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExpoPushToken[test_token_A2]' });
    await registerCurrentDevice('customer-A');

    const generations = bodies.map(body => body.registrationGeneration);
    expect(generations).toHaveLength(5);
    expect(generations[0]).toBe(generations[1]);
    expect(generations[2]).toBe(generations[3]);
    expect(generations[2]).toBeGreaterThan(generations[1]);
    expect(generations[4]).toBeGreaterThan(generations[3]);
  });

  it('retries revocation once without leaving a registration coordinator lock', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
    await expect(revokeCurrentDevice()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('allows a failed token-refresh registration to retry without overlapping work', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
    const remove = await subscribeToPushTokenRefresh('customer-A');
    mocks.pushListener?.(token('native-A'));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(mocks.getExpoPushTokenAsync).toHaveBeenCalledTimes(1));
    mocks.pushListener?.(token('native-A'));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    remove();
  });
});
