// @vitest-environment jsdom
import React, { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authState: { sessionReady: true, isAuthenticated: true, user: { uid: 'customer-A' } as { uid: string } | null },
  platform: { OS: 'ios' },
  router: { push: vi.fn() },
  subscribeToPushTokenRefresh: vi.fn(),
  notificationRouteFromPayload: vi.fn(() => '/notifications'),
  addResponseListener: vi.fn(),
  clearLastResponse: vi.fn(async () => undefined),
  getLastResponse: vi.fn(),
  responseCallbacks: [] as ((response: any) => void)[],
  responseRemovers: [] as ReturnType<typeof vi.fn>[],
  passthrough: (props: { children?: unknown }) => props.children ?? null,
}));

vi.mock('@tanstack/react-query', () => ({ QueryClient: class {}, QueryClientProvider: mocks.passthrough }));
vi.mock('expo-router', () => ({
  useRouter: () => mocks.router,
  useSegments: () => [],
  Stack: Object.assign(mocks.passthrough, { Screen: () => null }),
}));
vi.mock('expo-splash-screen', () => ({ preventAutoHideAsync: vi.fn(), hideAsync: vi.fn() }));
vi.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: mocks.passthrough }));
vi.mock('react-native', () => ({ Platform: mocks.platform, View: mocks.passthrough }));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('tamagui', () => ({ TamaguiProvider: mocks.passthrough }));
vi.mock('../tamagui.config', () => ({ default: {} }));
vi.mock('../constants/colors', () => ({ default: { primary: '#000' } }));
vi.mock('../contexts/LanguageContext', () => ({ LanguageProvider: mocks.passthrough, useLanguage: () => ({ isRTL: false }) }));
vi.mock('../contexts/AuthContext', () => ({ AuthProvider: mocks.passthrough, useAuth: () => mocks.authState }));
vi.mock('../contexts/DiscoveryContext', () => ({ DiscoveryProvider: mocks.passthrough }));
vi.mock('../components/EmailVerificationBanner', () => ({ default: () => null }));
vi.mock('../components/ProvisioningRecoveryScreen', () => ({ default: () => null }));
vi.mock('../components/HeavyarLaunchMotion', () => ({ default: () => null, claimHeavyarLaunchMotion: () => false }));
vi.mock('../components/ui/heavyar', () => ({ HeavyarLoadingState: () => null }));
vi.mock('../components/PolicyReacceptanceScreen', () => ({ default: () => null }));
vi.mock('../utils/qaPerformance', () => ({ enableQaPerformanceMode: vi.fn() }));
vi.mock('../services/notificationService', () => ({
  subscribeToPushTokenRefresh: mocks.subscribeToPushTokenRefresh,
  notificationRouteFromPayload: mocks.notificationRouteFromPayload,
}));
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  addNotificationResponseReceivedListener: mocks.addResponseListener,
  clearLastNotificationResponseAsync: mocks.clearLastResponse,
  getLastNotificationResponseAsync: mocks.getLastResponse,
}));

// Module-level mocks must be registered before this import.
// eslint-disable-next-line import/first
import { NotificationNavigation } from '../app/_layout';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve };
};
const response = (notificationId = 'notification-1') => ({
  notification: { request: { content: { data: { notificationId, action: 'inbox' } } } },
});

describe('NotificationNavigation lifecycle', () => {
  let root: Root | undefined;
  let host: HTMLDivElement;

  const render = async (node: React.ReactNode = <NotificationNavigation />) => {
    if (!root) {
      host = document.createElement('div');
      root = createRoot(host);
    }
    await act(async () => { root?.render(node); });
  };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.authState = { sessionReady: true, isAuthenticated: true, user: { uid: 'customer-A' } };
    mocks.platform.OS = 'ios';
    mocks.router.push.mockReset();
    mocks.notificationRouteFromPayload.mockReset().mockReturnValue('/notifications');
    mocks.subscribeToPushTokenRefresh.mockReset().mockResolvedValue(vi.fn());
    mocks.responseCallbacks = [];
    mocks.responseRemovers = [];
    mocks.addResponseListener.mockReset().mockImplementation((callback: (value: any) => void) => {
      const remove = vi.fn();
      mocks.responseCallbacks.push(callback);
      mocks.responseRemovers.push(remove);
      return { remove };
    });
    mocks.clearLastResponse.mockClear();
    mocks.getLastResponse.mockReset().mockResolvedValue(null);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
  });

  it('removes a listener that resolves after component cleanup', async () => {
    const late = deferred<() => void>();
    const removePush = vi.fn();
    mocks.subscribeToPushTokenRefresh.mockReturnValueOnce(late.promise);
    await render();
    await act(async () => root?.unmount());
    root = undefined;
    await act(async () => late.resolve(removePush));
    expect(removePush).toHaveBeenCalledTimes(1);
    expect(mocks.responseRemovers[0]).toHaveBeenCalledTimes(1);
  });

  it('removes a listener whose initialization finishes after logout', async () => {
    const late = deferred<() => void>();
    const removePush = vi.fn();
    mocks.subscribeToPushTokenRefresh.mockReturnValueOnce(late.promise);
    await render();
    mocks.authState = { sessionReady: true, isAuthenticated: false, user: null };
    await render();
    await act(async () => late.resolve(removePush));
    expect(removePush).toHaveBeenCalledTimes(1);
    expect(mocks.responseRemovers[0]).toHaveBeenCalledTimes(1);
  });

  it('installs and removes each normal and Strict Mode subscription exactly once', async () => {
    const pushRemovers: ReturnType<typeof vi.fn>[] = [];
    mocks.subscribeToPushTokenRefresh.mockImplementation(async () => {
      const remove = vi.fn();
      pushRemovers.push(remove);
      return remove;
    });
    await render();
    await act(async () => root?.unmount());
    root = undefined;
    expect(mocks.subscribeToPushTokenRefresh).toHaveBeenCalledTimes(1);
    expect(pushRemovers[0]).toHaveBeenCalledTimes(1);
    expect(mocks.responseRemovers[0]).toHaveBeenCalledTimes(1);

    await render(<StrictMode><NotificationNavigation /></StrictMode>);
    await act(async () => root?.unmount());
    root = undefined;
    expect(mocks.subscribeToPushTokenRefresh).toHaveBeenCalledTimes(3);
    expect(pushRemovers.slice(1).every(remove => remove.mock.calls.length === 1)).toBe(true);
    expect(mocks.responseRemovers.slice(1).every(remove => remove.mock.calls.length === 1)).toBe(true);
  });

  it('isolates rapid A to B to A transitions and ignores obsolete callbacks', async () => {
    await render();
    mocks.authState = { sessionReady: true, isAuthenticated: true, user: { uid: 'customer-B' } };
    await render();
    mocks.authState = { sessionReady: true, isAuthenticated: true, user: { uid: 'customer-A' } };
    await render();
    await act(async () => {
      mocks.responseCallbacks[0](response('old-A'));
      mocks.responseCallbacks[1](response('old-B'));
      mocks.responseCallbacks[2](response('current-A'));
      mocks.responseCallbacks[2](response('current-A'));
    });
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/notifications');
  });

  it('does not navigate when a delayed last response resolves after logout', async () => {
    const last = deferred<any>();
    mocks.getLastResponse.mockReturnValueOnce(last.promise);
    await render();
    mocks.authState = { sessionReady: true, isAuthenticated: false, user: null };
    await render();
    await act(async () => last.resolve(response('late')));
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it('opens a valid current-session tap once and skips native listeners for guest and web sessions', async () => {
    await render();
    await act(async () => {
      mocks.responseCallbacks[0](response('current'));
      mocks.responseCallbacks[0](response('current'));
    });
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/notifications');
    expect(mocks.clearLastResponse).toHaveBeenCalledTimes(1);
    await act(async () => root?.unmount());
    root = undefined;

    mocks.subscribeToPushTokenRefresh.mockClear();
    mocks.addResponseListener.mockClear();
    mocks.authState = { sessionReady: true, isAuthenticated: false, user: null };
    await render();
    expect(mocks.subscribeToPushTokenRefresh).not.toHaveBeenCalled();
    expect(mocks.addResponseListener).not.toHaveBeenCalled();
    await act(async () => root?.unmount());
    root = undefined;

    mocks.platform.OS = 'web';
    mocks.authState = { sessionReady: true, isAuthenticated: true, user: { uid: 'customer-A' } };
    await render();
    expect(mocks.subscribeToPushTokenRefresh).not.toHaveBeenCalled();
    expect(mocks.addResponseListener).not.toHaveBeenCalled();
  });
});
