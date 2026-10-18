import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RequestDetailScreen from '../app/request/[id]';
import ChatScreen from '../app/chat/[requestId]';

const state = vi.hoisted(() => ({
  uid: 'customer-a',
  requestId: 'request-1',
  detail: [] as { next: (value: any) => void; error: (error: Error) => void; stop: ReturnType<typeof vi.fn> }[],
  chatRequests: [] as { next: (value: any) => void; error: (error: Error) => void; stop: ReturnType<typeof vi.fn> }[],
  chatMessages: [] as { next: (value: any) => void; error: (error: Error) => void; stop: ReturnType<typeof vi.fn> }[],
}));

vi.mock('react-native', () => ({
  View: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
  ScrollView: ({ children }: any) => <div>{children}</div>,
  KeyboardAvoidingView: ({ children }: any) => <div>{children}</div>,
  Pressable: ({ children, onPress, disabled, accessibilityRole }: any) => <button role={accessibilityRole} disabled={disabled} onClick={onPress}>{children}</button>,
  TextInput: ({ value, onChangeText }: any) => <input value={value || ''} onChange={event => onChangeText?.(event.target.value)} />,
  FlatList: ({ data, renderItem, ListHeaderComponent }: any) => <div>{ListHeaderComponent}{data.map((item: any) => <div key={item.id}>{renderItem({ item })}</div>)}</div>,
  ActivityIndicator: () => <span>loading</span>,
  Modal: ({ children, visible }: any) => visible ? <div>{children}</div> : null,
  StyleSheet: { create: (value: unknown) => value },
  Platform: { OS: 'web' },
  InteractionManager: { runAfterInteractions: (callback: () => void) => { callback(); return { cancel: vi.fn() }; } },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => <div>{children}</div> }));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('lucide-react-native', () => ({
  ArrowLeft: () => null, ArrowRight: () => null, MessageCircle: () => null,
  CreditCard: () => null, Star: () => null, Calendar: () => null, Receipt: () => null,
  Send: () => null, Lock: () => null, Flag: () => null, MapPinned: () => null, X: () => null,
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: state.requestId, requestId: state.requestId }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: state.uid, role: 'customer' } }) }));
vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({
  isRTL: false,
  language: 'en',
  t: (key: string) => key,
  localizedText: (_ar: string, en: string) => en,
}) }));
vi.mock('../services/requestRealtimeService', () => ({
  subscribeToRequestDetail: (_id: string, next: (value: any) => void, error: (error: Error) => void) => {
    const stop = vi.fn();
    let closed = false;
    const close = () => { if (!closed) { closed = true; stop(); } };
    state.detail.push({ next, error: failure => { close(); error(failure); }, stop });
    return close;
  },
}));
vi.mock('../services/firestoreService', () => ({
  subscribeToRequest: (_id: string, next: (value: any) => void, error: (error: Error) => void) => {
    const stop = vi.fn();
    let closed = false;
    const close = () => { if (!closed) { closed = true; stop(); } };
    state.chatRequests.push({ next, error: failure => { close(); error(failure); }, stop });
    return close;
  },
  subscribeToMessages: (_id: string, next: (value: any) => void, error: (error: Error) => void) => {
    const stop = vi.fn();
    let closed = false;
    const close = () => { if (!closed) { closed = true; stop(); } };
    state.chatMessages.push({ next, error: failure => { close(); error(failure); }, stop });
    return close;
  },
  fetchOlderMessages: vi.fn(),
  sendMessage: vi.fn(),
  sendLocationMessage: vi.fn(),
}));
vi.mock('../components/StatusBadge', () => ({ default: () => null }));
vi.mock('../components/AppDialog', () => ({ default: () => null }));
vi.mock('../hooks/useAppDialog', () => ({ useAppDialog: () => ({ dialog: {}, showDialog: vi.fn(), hideDialog: vi.fn() }) }));
vi.mock('../utils/imageHelpers', () => ({ getFirstImageUrl: () => '' }));
vi.mock('../services/rentalV2', () => ({
  formatMinorAmount: () => '', liveRentalEstimateMinor: () => 0,
  rentalRequestPricingState: () => ({ kind: 'legacy' }),
}));
vi.mock('../services/paymentService', () => ({
  isAcceptedFixedDurationRental: () => false,
}));
vi.mock('../services/errorMessages', () => ({ safeErrorMessage: () => 'error' }));
vi.mock('../utils/mobilePerformance', () => ({ mobilePerformance: { countRender: vi.fn() } }));
vi.mock('../services/requestNavigationSnapshot', () => ({ getRequestNavigationSnapshot: () => null }));
vi.mock('../utils/routePerformance', () => ({
  markRouteStage: vi.fn(),
  startRouteModuleEvaluation: () => ({ complete: vi.fn() }),
}));
vi.mock('../components/location/LocationPreview', () => ({ default: () => null }));
vi.mock('../components/location/LocationPicker', () => ({ default: () => null }));
vi.mock('../components/rental/RentalExtensionCard', () => ({ default: () => null }));
vi.mock('../services/blockedUsers', () => ({ useBlockedUsers: () => ({ isBlocked: () => false, unblock: vi.fn() }) }));

let root: Root | undefined;
let host: HTMLDivElement;

async function render(element: React.ReactNode) {
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => { root!.render(element); });
}

async function settleRequestSubscription() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)); });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.uid = 'customer-a';
  state.requestId = 'request-1';
  state.detail = [];
  state.chatRequests = [];
  state.chatMessages = [];
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
});

describe('terminal realtime listener failures', () => {
  it('ends request-detail loading, clears private data, and retries with exactly one listener', async () => {
    await render(<RequestDetailScreen />);
    await settleRequestSubscription();
    expect(state.detail).toHaveLength(1);
    await act(async () => state.detail[0].error(Object.assign(new Error('denied'), { code: 'permission-denied' })));
    expect(host.textContent).toContain('error_occurred');
    expect(host.textContent).toContain('Retry');

    const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Retry')!;
    await act(async () => retry.click());
    await settleRequestSubscription();
    expect(state.detail[0].stop).toHaveBeenCalledTimes(1);
    expect(state.detail).toHaveLength(2);
  });

  it('clears valid chat content after permission loss and isolates retry/account-switch listeners', async () => {
    await render(<ChatScreen />);
    expect(state.chatRequests).toHaveLength(1);
    expect(state.chatMessages).toHaveLength(1);
    await act(async () => {
      state.chatRequests[0].next({ id: state.requestId, customerUid: 'customer-a', providerUid: 'provider-a', status: 'accepted', allowChat: true });
      state.chatMessages[0].next({ items: [{ id: 'message-1', senderUid: 'provider-a', text: 'private message', createdAt: new Date().toISOString() }], cursor: null, hasMore: false });
    });
    expect(host.textContent).toContain('private message');

    await act(async () => state.chatMessages[0].error(Object.assign(new Error('denied'), { code: 'permission-denied' })));
    expect(host.textContent).not.toContain('private message');
    expect(host.textContent).toContain('could not be loaded securely');
    expect(state.chatRequests[0].stop).toHaveBeenCalledTimes(1);
    expect(state.chatMessages[0].stop).toHaveBeenCalledTimes(1);

    const retry = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Retry')!;
    await act(async () => retry.click());
    expect(state.chatRequests).toHaveLength(2);
    expect(state.chatMessages).toHaveLength(2);

    state.uid = 'customer-b';
    await act(async () => root!.render(<ChatScreen />));
    expect(state.chatRequests[1].stop).toHaveBeenCalledTimes(1);
    expect(state.chatMessages[1].stop).toHaveBeenCalledTimes(1);
    expect(state.chatRequests).toHaveLength(3);
    expect(state.chatMessages).toHaveLength(3);
    await act(async () => state.chatMessages[1].next({ items: [{ id: 'stale', senderUid: 'provider-a', text: 'stale private message', createdAt: new Date().toISOString() }], cursor: null, hasMore: false }));
    expect(host.textContent).not.toContain('stale private message');
    const currentRequest = state.chatRequests[2];
    const currentMessages = state.chatMessages[2];
    await act(async () => root!.unmount());
    root = undefined;
    expect(currentRequest.stop).toHaveBeenCalledTimes(1);
    expect(currentMessages.stop).toHaveBeenCalledTimes(1);
  });
});
