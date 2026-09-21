// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { DISCOVERY_REQUEST_TIMEOUT_MS, DiscoveryProvider, useDiscovery, useDiscoveryDraft, useDiscoveryMarkets, withDiscoveryDeadline } from '../contexts/DiscoveryContext';
import { getEquipmentThumbnailUrl } from '../utils/imageHelpers';
import { mobilePerformance } from '../utils/mobilePerformance';
import type { Equipment } from '../types';

const calls = vi.hoisted(() => ({
  search: vi.fn<(filters: unknown, cursor: string | undefined, limit: number, signal: AbortSignal) => Promise<{ equipment: Equipment[]; nextCursor?: string }>>(),
}));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock('expo-router', () => ({ useFocusEffect: () => {} }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: undefined }) }));
vi.mock('../services/authService', () => ({ fetchMarketConfig: async () => [
  { code: 'SA', enabled: true, marketplaceAvailable: true },
  { code: 'AE', enabled: true, marketplaceAvailable: true },
] }));
vi.mock('../services/equipmentSearchService', () => ({ searchPublicEquipment: calls.search }));
vi.mock('../services/discoveryInvalidation', () => ({ subscribePublicEquipmentInvalidation: () => () => {} }));

let discovery: ReturnType<typeof useDiscovery>;
let draft: ReturnType<typeof useDiscoveryDraft>;
let homeRenders = 0;
let searchRenders = 0;
let marketRenders = 0;
function HomeProbe() { discovery = useDiscovery(); draft = useDiscoveryDraft(discovery); homeRenders++; return null; }
function SearchProbe() { useDiscovery(); searchRenders++; return null; }
function MarketProbe() { useDiscoveryMarkets(); marketRenders++; return null; }
const host = document.createElement('div');
let root: ReturnType<typeof createRoot>;
async function settle(ms = 20) { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); }
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  await act(async () => { root.render(<QueryClientProvider client={client}><DiscoveryProvider><HomeProbe /><SearchProbe /><MarketProbe /></DiscoveryProvider></QueryClientProvider>); });
  await settle(50);
  calls.search.mockClear(); homeRenders = 0; searchRenders = 0; marketRenders = 0;
  mobilePerformance.reset();
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mobilePerformance.configure({ enabled: true });
  calls.search.mockReset().mockResolvedValue({ equipment: [], nextCursor: undefined });
});
afterEach(async () => { if (root) await act(async () => root.unmount()); vi.useRealTimers(); mobilePerformance.configure({ enabled: false }); });

it('five draft keystrokes update only Home; one debounced committed query', async () => {
  await mount();
  for (const text of ['c', 'cr', 'cra', 'cran', 'crane']) {
    await act(async () => draft.changeText(text));
  }
  const immediate = { homeRenders, searchRenders, marketRenders, requests: calls.search.mock.calls.length };
  expect(immediate).toEqual({ homeRenders: 5, searchRenders: 0, marketRenders: 0, requests: 0 });
  expect(mobilePerformance.snapshot().metrics.filter(m => m.kind === 'context_commit')).toEqual([]);
  await settle(400); await settle();
  console.log('DISCOVERY_AFTER', JSON.stringify({ immediate, settled: { homeRenders, searchRenders, marketRenders, requests: calls.search.mock.calls.length } }));
  expect(calls.search).toHaveBeenCalledTimes(1);
  expect(marketRenders).toBe(0);
});

it('opening filters and category/region/city selection remain local until one Apply', async () => {
  await mount();
  await act(async () => draft.beginFilters());
  for (const [key, value] of [['category', 'crane'], ['region', 'riyadh'], ['city', 'riyadh-city']] as const) {
    await act(async () => draft.changeFilter(key, value));
  }
  await settle(400);
  expect(calls.search).toHaveBeenCalledTimes(0);
  expect(searchRenders).toBe(0);
  await act(async () => draft.commitFilters());
  await settle(); await settle();
  expect(calls.search).toHaveBeenCalledTimes(1);
  expect(discovery.filters).toMatchObject({ category: 'crane', region: 'riyadh', city: 'riyadh-city' });
});

it('uses 20-item cursor pages and de-duplicates IDs without showing old-filter results during transitions', async () => {
  const first = Array.from({ length: 20 }, (_, i) => ({ id: String(i) } as Equipment));
  calls.search.mockResolvedValueOnce({ equipment: first, nextCursor: 'page-2' });
  await mount();
  expect(discovery.equipment).toHaveLength(20);
  calls.search.mockResolvedValueOnce({ equipment: [{ id: '19' }, { id: '20' }] as Equipment[] });
  await act(async () => discovery.loadMore());
  await settle(); await settle();
  expect(calls.search).toHaveBeenCalledWith(expect.anything(), 'page-2', 20, expect.anything());
  expect(discovery.equipment).toHaveLength(21);
  let resolve!: (page: { equipment: Equipment[] }) => void;
  calls.search.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => discovery.setFilter('category', 'crane'));
  await settle();
  expect(discovery.equipment).toHaveLength(0);
  expect(discovery.loading).toBe(true);
  await act(async () => discovery.loadMore());
  expect(calls.search).toHaveBeenCalledTimes(2);
  await act(async () => resolve({ equipment: [{ id: 'new' }] as Equipment[] }));
  await settle();
  expect(discovery.equipment.map(item => item.id)).toEqual(['new']);
});

it.each([['countryCode', 'AE'], ['category', 'crane'], ['text', 'new search']] as const)(
  'failed %s transition never exposes prior-query inventory',
  async (key, value) => {
    calls.search.mockResolvedValueOnce({ equipment: [{ id: 'prior-market-equipment' }] as Equipment[] });
    await mount();
    expect(discovery.equipment).toHaveLength(1);
    calls.search.mockRejectedValue(new Error('test transport failure'));
    await act(async () => discovery.setFilter(key, value));
    await settle();
    expect(discovery.equipment).toEqual([]);
    await settle(1150); await settle();
    expect(discovery.error).toBe(true);
    expect(discovery.equipment).toEqual([]);
    expect(discovery.filters[key]).toBe(value);
  },
);

it('same-key failed refresh retains matching successful rows with an error', async () => {
  calls.search.mockResolvedValueOnce({ equipment: [{ id: 'matching-equipment' }] as Equipment[] });
  await mount();
  calls.search.mockRejectedValue(new Error('test refresh failure'));
  await act(async () => discovery.refresh());
  await settle(1150); await settle();
  expect(discovery.error).toBe(true);
  expect(discovery.equipment.map(item => item.id)).toEqual(['matching-equipment']);
});

it('a stalled first page ends loading at 15 seconds with actionable error and no automatic timeout retry', async () => {
  await mount();
  calls.search.mockImplementation(() => new Promise(() => {}));
  vi.useFakeTimers();
  await act(async () => discovery.setFilter('category', 'stalled'));
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(discovery.loading).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(DISCOVERY_REQUEST_TIMEOUT_MS + 1); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  expect(discovery.loading).toBe(false);
  expect(discovery.error).toBe(true);
  expect(discovery.equipment).toEqual([]);
  expect(calls.search).toHaveBeenCalledTimes(1);
  expect(calls.search.mock.calls[0][3].aborted).toBe(true);
  calls.search.mockResolvedValue({ equipment: [{ id: 'retried-result' }] as Equipment[] });
  await act(async () => discovery.refresh());
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  expect(discovery.equipment.map(item => item.id)).toEqual(['retried-result']);
  expect(discovery.error).toBe(false);
});

it('deadline rejects stalled work even when the transport ignores abort', async () => {
  vi.useFakeTimers();
  let signal!: AbortSignal;
  const result = withDiscoveryDeadline(nextSignal => { signal = nextSignal; return new Promise(() => {}); });
  const rejection = expect(result).rejects.toThrow('DISCOVERY_REQUEST_TIMEOUT');
  await vi.advanceTimersByTimeAsync(DISCOVERY_REQUEST_TIMEOUT_MS);
  await rejection;
  expect(signal.aborted).toBe(true);
});

it('explicit search submit cancels duplicate debounce work', async () => {
  await mount();
  await act(async () => draft.changeText('crane'));
  await act(async () => draft.commitText());
  await settle(400); await settle();
  expect(calls.search).toHaveBeenCalledTimes(1);
});

it('reset cancels an uncommitted search draft', async () => {
  await mount();
  await act(async () => draft.changeText('crane'));
  await act(async () => draft.resetAll());
  await settle(400);
  expect(calls.search).toHaveBeenCalledTimes(0);
  expect(draft.text).toBe('');
});

it('refresh keeps every loaded row visible while restarting the cursor chain', async () => {
  const first = Array.from({ length: 20 }, (_, i) => ({ id: String(i) } as Equipment));
  calls.search.mockResolvedValueOnce({ equipment: first, nextCursor: 'page-2' });
  await mount();
  calls.search.mockResolvedValueOnce({ equipment: [{ id: '20' }] as Equipment[] });
  await act(async () => discovery.loadMore());
  await settle(); await settle();
  let resolve!: (page: { equipment: Equipment[] }) => void;
  calls.search.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => discovery.refresh());
  await settle();
  expect(discovery.equipment).toHaveLength(21);
  expect(discovery.refreshing).toBe(true);
  await act(async () => resolve({ equipment: first }));
  await settle();
  expect(discovery.equipment).toHaveLength(20);
});

it('transforms only safe Cloudinary delivery URLs without touching originals or signatures', () => {
  const original = 'https://res.cloudinary.com/demo/image/upload/v123/equipment/a.jpg';
  expect(getEquipmentThumbnailUrl(original)).toContain('/f_auto,q_auto,c_limit,w_480/v123/');
  for (const url of [
    'https://example.com/photo.jpg',
    'https://res.cloudinary.com/demo/image/upload/s--signature--/v123/a.jpg',
    'https://res.cloudinary.com/demo/image/upload/c_fill,w_100/v123/a.jpg',
    original + '?token=signature', 'https://res.cloudinary.com/demo/image/private/v123/a.jpg',
    'invalid',
  ]) expect(getEquipmentThumbnailUrl(url)).toBe(url);
});

it('Home and Search expose virtualized two-column/list layouts without duplicate featured data or fake ratings', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  for (const path of ['../app/(tabs)/(home)/index.tsx', '../app/(tabs)/search/index.tsx']) {
    const screen = source(path);
    expect(screen).toContain('<FlatList');
    expect(screen).toContain("numColumns={view === 'grid' ? 2 : 1}");
    expect(screen).toContain('initialNumToRender={6}');
    expect(screen).toContain('windowSize={5}');
    expect(screen).not.toContain('featuredEquipment');
    expect(screen).not.toContain('filteredEquipment.map');
  }
  const card = source('../components/EquipmentCard.tsx');
  expect(card).not.toContain('mockUsers');
  expect(card).not.toContain('rating');
  expect(card).toContain('numberOfLines={2}');
  expect(card).toContain('cachePolicy="memory-disk"');
  expect(card).not.toContain('width: 200');
});