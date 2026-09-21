import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { DiscoveryProvider, useDiscovery, useDiscoveryDraft, useDiscoveryMarkets } from '../contexts/DiscoveryContext';
import { invalidatePublicEquipment } from '../services/discoveryInvalidation';
import { canBrowsePublicEquipment } from '../services/marketplaceAccess';
import { mobilePerformance } from '../utils/mobilePerformance';
import { loadRoleEquipmentDetail } from '../services/equipmentDetailAccess';

const state = vi.hoisted(() => ({
  searches: 0, markets: 0, focus: [] as (() => void)[],
  auth: { isLoading: false, isAuthenticated: true, user: { role: 'provider', countryCode: 'SA' } as { role: string; countryCode: string } | null },
}));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => { if (!state.focus.includes(callback)) state.focus.push(callback); } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('../services/authService', () => ({ fetchMarketConfig: async () => { state.markets++; return [{ code: 'SA', enabled: true, marketplaceAvailable: true }]; } }));
vi.mock('../services/equipmentSearchService', () => ({ searchPublicEquipment: async () => {
  state.searches++; await new Promise(resolve => setTimeout(resolve, 15));
  return { equipment: Array.from({ length: 20 }, (_, i) => ({ id: String(i) })), nextCursor: 'next' };
} }));

let discovery: ReturnType<typeof useDiscovery>;
let draft: ReturnType<typeof useDiscoveryDraft>;
let home = 0, search = 0, add = 0;
function Home() { discovery = useDiscovery(); draft = useDiscoveryDraft(discovery); home++; return null; }
function Search() { useDiscovery(); search++; return null; }
function Add() { useDiscoveryMarkets(); add++; return null; }
const pause = async (ms = 40) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
const snapshot = () => ({ searches: state.searches, markets: state.markets, home, search, add,
  commits: mobilePerformance.snapshot().metrics.filter(metric => metric.kind === 'context_commit').reduce((n, metric) => n + metric.count, 0) });
let root: ReturnType<typeof createRoot>;
let client: QueryClient;
async function mount() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.searches = 0; state.markets = 0; state.focus = []; home = 0; search = 0; add = 0;
  mobilePerformance.configure({ enabled: true }); mobilePerformance.reset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.createElement('div'));
  await rerender();
  await pause(); await pause();
}
async function rerender() {
  await act(async () => root.render(<QueryClientProvider client={client}><DiscoveryProvider><Home /><Search /><Add /></DiscoveryProvider></QueryClientProvider>));
}
afterEach(async () => { if (root) await act(async () => root.unmount()); client?.clear(); });

it('allows only resolved Guest and Customer identities', () => {
  expect(canBrowsePublicEquipment({ isLoading: true, user: { role: 'customer' } })).toBe(false);
  expect(canBrowsePublicEquipment({})).toBe(false);
  expect(canBrowsePublicEquipment({ isLoading: false, isAuthenticated: true })).toBe(false);
  expect(canBrowsePublicEquipment({ isLoading: false, accountState: 'provisioning_incomplete' })).toBe(false);
  expect(canBrowsePublicEquipment({ isLoading: false })).toBe(true);
  for (const role of ['provider', 'driver', 'customer']) {
    expect(canBrowsePublicEquipment({ isLoading: false, user: { role } })).toBe(role === 'customer');
  }
});

it('deep links use owner-scoped detail only for Providers; Driver/pending fetch nothing', async () => {
  const loaders = {
    publicById: vi.fn(async (_id: string) => ({ id: 'public' })),
    ownerById: vi.fn(async (_id: string, _uid: string) => ({ id: 'own' })),
  };
  expect(await loadRoleEquipmentDetail('competitor', { isLoading: false, user: { role: 'provider', uid: 'owner' } }, loaders)).toEqual({ id: 'own' });
  expect(loaders.ownerById).toHaveBeenCalledWith('competitor', 'owner');
  expect(loaders.publicById).not.toHaveBeenCalled();
  for (const auth of [
    { isLoading: true, user: { role: 'customer' } },
    { isLoading: false, user: { role: 'driver' } },
    { isLoading: false, isAuthenticated: true, user: null },
  ]) expect(await loadRoleEquipmentDetail('public', auth, loaders)).toBeNull();
  expect(loaders.ownerById).toHaveBeenCalledTimes(1);
  expect(loaders.publicById).not.toHaveBeenCalled();
  await loadRoleEquipmentDetail('public', { isLoading: false, user: { role: 'customer' } }, loaders);
  await loadRoleEquipmentDetail('public', { isLoading: false, user: null }, loaders);
  expect(loaders.publicById).toHaveBeenCalledTimes(2);
});

it('role change masks cached results immediately and cancels late marketplace response', async () => {
  state.auth = { isLoading: false, isAuthenticated: true, user: { role: 'customer', countryCode: 'SA' } };
  await mount();
  expect(discovery.equipment.length).toBe(20);
  await act(async () => discovery.setFilter('category', 'late-fixture'));
  state.auth.user = { role: 'provider', countryCode: 'SA' };
  await rerender();
  expect(discovery.equipment).toEqual([]);
  await pause(); await pause();
  expect(discovery.equipment).toEqual([]);
  state.auth.isLoading = true;
  state.auth.user = { role: 'customer', countryCode: 'SA' };
  await rerender();
  const callsBefore = state.searches;
  await act(async () => { discovery.refresh(); discovery.loadMore(); invalidatePublicEquipment(); });
  await pause();
  expect(discovery.equipment).toEqual([]);
  expect(state.searches).toBe(callsBefore);
});

it('controlled Provider after profile: publish, 30 seconds, six focus cycles', async () => {
  state.auth = { isLoading: false, isAuthenticated: true, user: { role: 'provider', countryCode: 'SA' } };
  await mount();
  const report: Record<string, ReturnType<typeof snapshot>> = { homeSettled: snapshot() };
  await act(async () => draft.beginFilters());
  for (const [key, value] of [['category', 'crane'], ['region', 'Riyadh'], ['city', 'Riyadh']] as const) await act(async () => draft.changeFilter(key, value));
  report.localDraftFields = snapshot();
  await act(async () => invalidatePublicEquipment());
  await pause(); await pause();
  report.postPublishSettled = snapshot();
  await pause(30_000);
  report.postPublish30Seconds = snapshot();
  for (let n = 0; n < 6; n++) { await act(async () => state.focus.forEach(fn => fn())); await pause(5); }
  report.sixFreshFocusCycles = snapshot();
  console.log('ROLE_AWARE_PROVIDER_AFTER', JSON.stringify(report));
  expect(state.searches).toBe(0);
  expect(report.postPublishSettled).toEqual(report.localDraftFields);
  expect(report.postPublish30Seconds).toEqual(report.postPublishSettled);
  expect(report.sixFreshFocusCycles).toEqual(report.postPublishSettled);
}, 40_000);

it('guards refresh, pagination, invalidation and focus across role transitions without deleting cache or filters', async () => {
  state.auth = { isLoading: false, isAuthenticated: true, user: { role: 'customer', countryCode: 'SA' } };
  await mount();
  expect(state.searches).toBe(1);
  await act(async () => discovery.setFilter('category', 'crane')); await pause(); await pause();
  expect(state.searches).toBe(2);
  await act(async () => discovery.loadMore()); await pause(); await pause();
  expect(state.searches).toBe(3);
  const cached = client.getQueriesData({ queryKey: ['equipment', 'public-search'] });
  for (const role of ['provider', 'driver']) {
    state.auth.user = { role, countryCode: 'SA' }; await rerender(); await pause();
    await act(async () => { discovery.refresh(); discovery.loadMore(); discovery.refreshIfStale(); invalidatePublicEquipment(); });
    await act(async () => client.invalidateQueries({ queryKey: ['equipment', 'public-search'] }));
    await pause();
    expect(state.searches).toBe(3);
    expect(discovery.equipment).toEqual([]);
    expect(discovery.filters.category).toBe('crane');
    expect(client.getQueriesData({ queryKey: ['equipment', 'public-search'] })).toEqual(cached);
  }
  state.auth = { isLoading: false, isAuthenticated: false, user: null };
  await rerender(); await pause(); await pause();
  expect(discovery.filters.category).toBe('crane');
  expect(discovery.equipment.length).toBe(20);
  expect(state.searches).toBeGreaterThan(3);
});