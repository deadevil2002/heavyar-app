import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import Requests from '../app/(tabs)/requests/index';

const state = vi.hoisted(() => ({
  uid: 'provider-a',
  listeners: [] as { next: (snapshot: any) => void; error: (error: Error) => void; stop: ReturnType<typeof vi.fn> }[],
}));
vi.mock('firebase/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  collection: vi.fn(), where: vi.fn(), orderBy: vi.fn(), documentId: vi.fn(), limit: vi.fn(), query: vi.fn(),
  onSnapshot: (_query: unknown, next: (snapshot: any) => void, error: (error: Error) => void) => {
    const stop = vi.fn();
    state.listeners.push({ next, error, stop });
    return stop;
  },
}));
vi.mock('../services/firebaseConfig', () => ({ getFirebaseDb: () => ({}), getFirebaseAuth: () => ({}) }));
vi.mock('../services/cloudinaryService', () => ({ deleteMultipleCloudinaryImages: vi.fn() }));
vi.mock('../services/firestoreService', async importOriginal => ({
  ...await importOriginal<typeof import('../services/firestoreService')>(),
  fetchEquipmentByIds: async () => new Map(),
}));
vi.mock('react-native', () => ({
  View: ({ children }: any) => <div>{children}</div>,
  Text: ({ children, accessibilityRole }: any) => <span role={accessibilityRole}>{children}</span>,
  Pressable: ({ children, onPress }: any) => <button onClick={onPress}>{children}</button>,
  ActivityIndicator: () => null,
  FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent }: any) => <div>
    {ListHeaderComponent}{data.length ? data.map((item: any) => <div key={item.id}>{renderItem({ item })}</div>) : ListEmptyComponent}
  </div>,
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => <div>{children}</div> }));
vi.mock('lucide-react-native', () => ({ Lock: () => null }));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), setParams: vi.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => (() => void)) => React.useEffect(callback, [callback]),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: state.uid, role: 'provider' } }) }));
vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ isRTL: false, t: (key: string) => key }) }));
vi.mock('../components/DriverRequestsSection', () => ({ default: () => null }));
vi.mock('../components/RequestCard', () => ({ default: ({ request }: any) => <span>{request.id}</span> }));
vi.mock('../components/EmptyState', () => ({ default: () => <span>No requests</span> }));
vi.mock('../utils/mobilePerformance', () => ({ mobilePerformance: { countRender: vi.fn(), markContextCommit: vi.fn(), markRefetch: vi.fn() } }));

let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; });

it('surfaces a real Firestore listener error, retries subscription preserving rows, ignores old UID/unmounted callbacks', async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.listeners = []; state.uid = 'provider-a';
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root!.render(<Requests />));
  expect(state.listeners).toHaveLength(1);
  const first = state.listeners[0];
  // Actual subscribeToUserRequests transforms this SDK snapshot.
  await act(async () => first.next({ docs: [{ id: 'existing-request', data: () => ({}) }], size: 1 }));
  expect(host.textContent).toContain('existing-request');
  await act(async () => first.error(new Error('SERVICE_UNAVAILABLE')));
  expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  expect(host.textContent).toContain('existing-request');
  const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Retry')!;
  await act(async () => retry.click());
  expect(first.stop).toHaveBeenCalledTimes(1);
  expect(state.listeners).toHaveLength(2);
  expect(host.textContent).toContain('existing-request');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await act(async () => first.error(new Error('stale error')));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  state.uid = 'provider-b';
  await act(async () => root!.render(<Requests />));
  expect(state.listeners[1].stop).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain('existing-request');
  await act(async () => state.listeners[1].error(new Error('old identity error')));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  const last = state.listeners.at(-1)!;
  await act(async () => root!.unmount()); root = undefined;
  expect(last.stop).toHaveBeenCalledTimes(1);
  expect(() => last.error(new Error('after unmount'))).not.toThrow();
});