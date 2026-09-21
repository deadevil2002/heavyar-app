import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import Home from '../app/(tabs)/(home)/index';
import Search from '../app/(tabs)/search/index';

const state = vi.hoisted(() => ({ role: 'provider', accountPurpose: undefined as string | undefined, unread: 0, push: vi.fn(), discovery: vi.fn() }));
vi.mock('react-native', () => ({
  View: ({ children, testID }: any) => <div data-testid={testID}>{children}</div>,
  ScrollView: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <span>{children}</span>,
  Pressable: ({ children, onPress, accessibilityLabel, testID }: any) => <button aria-label={accessibilityLabel} data-testid={testID} onClick={onPress}>{children}</button>,
  ActivityIndicator: () => null, FlatList: () => <div>Marketplace list</div>, RefreshControl: () => null, TextInput: () => null,
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => <div>{children}</div> }));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('lucide-react-native', () => ({
  Search: () => null, Bell: () => null, Globe: () => null, Grid2X2: () => null, List: () => null,
  Package: () => null, PlusCircle: () => null, Inbox: () => null, Activity: () => null, SlidersHorizontal: () => null, X: () => null,
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }), useLocalSearchParams: () => ({ mode: 'equipment' }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ isLoading: false, isAuthenticated: true, user: { uid: 'fixture', role: state.role, nameEn: 'Fixture', accountPurpose: state.accountPurpose } }) }));
vi.mock('../contexts/LanguageContext', () => ({ useLanguage: () => ({ isRTL: false, t: (key: string) => key, localizedText: (_ar: string, en: string) => en }) }));
vi.mock('../contexts/DiscoveryContext', () => ({ useDiscovery: state.discovery, useDiscoveryDraft: vi.fn() }));
vi.mock('../hooks/useNotificationUnread', () => ({ useNotificationUnread: () => ({ unreadCount: state.unread }) }));
vi.mock('../hooks/useAppDialog', () => ({ useAppDialog: vi.fn() }));
vi.mock('../components/DiscoveryFilters', () => ({ default: () => null }));
vi.mock('../components/EquipmentCard', () => ({ default: () => null }));
vi.mock('../components/CategoryCard', () => ({ default: () => null }));
vi.mock('../components/AppDialog', () => ({ default: () => null }));
vi.mock('../components/EmptyState', () => ({ default: ({ title }: any) => <span>{title}</span> }));
vi.mock('../components/DriverSearchTab', () => ({ default: () => <span>Driver search feature</span> }));
vi.mock('../services/equipmentViewPreference', () => ({ loadEquipmentView: vi.fn(), saveEquipmentView: vi.fn() }));
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
async function mount(component: React.ReactNode) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.push.mockClear(); state.discovery.mockClear();
  host = document.createElement('div'); root = createRoot(host);
  await act(async () => root.render(component));
}
afterEach(async () => { if (root) await act(async () => root.unmount()); });
it('Provider Home renders operations only and routes driver history to unified Requests', async () => {
  state.role = 'provider'; state.accountPurpose = undefined; state.unread = 0;
  await mount(<Home />);
  for (const label of ['My Equipment', 'Add Equipment', 'Incoming Requests', 'Active Rentals', 'Find Driver']) expect(host.textContent).toContain(label);
  expect(host.textContent).not.toContain('Marketplace');
  expect(state.discovery).not.toHaveBeenCalled();
  const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent === 'my_requests')!;
  await act(async () => button.click());
  expect(state.push).toHaveBeenCalledWith({ pathname: '/(tabs)/requests', params: { section: 'drivers' } });
  await act(async () => (host.querySelector('[aria-label="Notifications"]') as HTMLButtonElement).click());
  expect(state.push).toHaveBeenCalledWith('/notifications');
});
it('Store Review Provider Home does not offer driver request navigation', async () => {
  state.role = 'provider'; state.accountPurpose = 'store_review'; state.unread = 0;
  await mount(<Home />);
  expect(host.textContent).not.toContain('Find Driver');
  expect(host.textContent).not.toContain('my_requests');
  expect(Array.from(host.querySelectorAll('button')).some(button => button.textContent === 'my_requests')).toBe(false);
});
it.each([0, 16])('Home bell uses shared unread=%s', async unread => {
  state.role = 'provider'; state.accountPurpose = undefined; state.unread = unread;
  await mount(<Home />);
  expect(!!host.querySelector('[data-testid="home-notification-dot"]')).toBe(unread > 0);
  expect(host.querySelector('[aria-label="Notifications"]')).not.toBeNull();
});
it.each(['provider', 'driver'])('%s Search does not mount equipment discovery even with equipment deep link', async role => {
  state.role = role; state.accountPurpose = undefined;
  await mount(<Search />);
  expect(state.discovery).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('Marketplace');
  expect(host.textContent?.includes('Driver search feature')).toBe(role === 'provider');
});

it('Driver Home is a Requests workspace without marketplace or Provider actions', async () => {
  state.role = 'driver'; state.accountPurpose = undefined;
  await mount(<Home />);
  expect(host.textContent).toContain('Driver workspace');
  expect(host.textContent).toContain('my_requests');
  expect(host.textContent).not.toContain('Add Equipment');
  expect(host.textContent).not.toContain('Marketplace');
  expect(state.discovery).not.toHaveBeenCalled();
});