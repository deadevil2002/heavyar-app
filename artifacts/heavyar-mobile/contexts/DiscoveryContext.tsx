import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { fetchMarketConfig } from '@/services/authService';
import { isMarketEnabled } from '@/services/locationHierarchy';
import { defaultDiscoveryCountry, resetDiscoveryFilters, updateDiscoveryFilter, type DiscoveryFilters } from '@/services/publicDiscovery';
import { searchPublicEquipment } from '@/services/equipmentSearchService';
import { subscribePublicEquipmentInvalidation } from '@/services/discoveryInvalidation';
import type { Equipment } from '@/types';
import { refreshIfStale as refreshOnSignalIfStale } from '@/services/discoveryRefreshPolicy';
import { mobilePerformance } from '@/utils/mobilePerformance';
import { canBrowsePublicEquipment } from '@/services/marketplaceAccess';

const INVENTORY_STALE_MS = 2 * 60_000;
const MARKET_STALE_MS = 30 * 60_000;
export const DISCOVERY_REQUEST_TIMEOUT_MS = 15_000;

/** Query-level deadline covers fetch AND body decoding, with caller cancellation. */
export async function withDiscoveryDeadline<T>(work: (signal: AbortSignal) => Promise<T>, external?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  try {
    return await new Promise<T>((resolve, reject) => {
      cancel = () => { controller.abort(); reject(new Error('DISCOVERY_REQUEST_CANCELLED')); };
      if (external?.aborted) { cancel(); return; }
      external?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('DISCOVERY_REQUEST_TIMEOUT'));
      }, DISCOVERY_REQUEST_TIMEOUT_MS);
      work(controller.signal).then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', cancel);
  }
}

const retryDiscovery = (failures: number, error: Error) =>
  error.message !== 'DISCOVERY_REQUEST_TIMEOUT' && error.message !== 'DISCOVERY_REQUEST_CANCELLED' && failures < 1;

function useDiscoveryState() {
  const auth = useAuth();
  const { user } = auth;
  const inventoryEnabled = canBrowsePublicEquipment(auth);
  const allowed = useRef(inventoryEnabled);
  allowed.current = inventoryEnabled;
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!inventoryEnabled) void queryClient.cancelQueries({ queryKey: ['equipment', 'public-search'] });
  }, [inventoryEnabled, queryClient]);
  const marketQuery = useQuery({
    queryKey: ['markets', 'public'],
    queryFn: ({ signal }) => mobilePerformance.trackNetwork('discovery.markets', () => withDiscoveryDeadline(fetchMarketConfig, signal)),
    staleTime: MARKET_STALE_MS,
    refetchOnWindowFocus: false,
    retry: retryDiscovery,
  });
  const markets = marketQuery.data;
  const defaultCountry = defaultDiscoveryCountry(user?.countryCode, markets);
  const [selection, setSelection] = useState<DiscoveryFilters | null>(null);
  const filters = useMemo(() => {
    if (!selection) return resetDiscoveryFilters(defaultCountry);
    // An Admin-disabled market cannot leave the user stranded in empty inventory.
    return isMarketEnabled(selection.countryCode, markets) ? selection : resetDiscoveryFilters(defaultCountry);
  }, [selection, defaultCountry, markets]);
  const queryFilters = useMemo(() => ({ ...filters, text: filters.text.trim() }), [filters]);
  const inventoryIdentity = JSON.stringify([
    queryFilters.countryCode, queryFilters.region, queryFilters.city, queryFilters.category, queryFilters.text,
  ]);
  const inventoryKey = useMemo(() => ['equipment', 'public-search', queryFilters] as const, [queryFilters]);
  const inventory = useInfiniteQuery({
    queryKey: inventoryKey,
    enabled: inventoryEnabled,
    queryFn: ({ pageParam, signal }) => {
      if (!allowed.current) throw new Error('PUBLIC_MARKETPLACE_ROLE_DISABLED');
      return mobilePerformance.trackNetwork('discovery.equipment', () =>
        withDiscoveryDeadline(boundedSignal => searchPublicEquipment(queryFilters, pageParam, 20, boundedSignal), signal));
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor,
    staleTime: INVENTORY_STALE_MS,
    refetchOnWindowFocus: false,
    retry: retryDiscovery,
  });
  const pageEquipment = useMemo(() => {
    const unique = new Map<string, Equipment>();
    for (const item of inventory.data?.pages.flatMap(page => page.equipment) || []) unique.set(item.id, item);
    return [...unique.values()];
  }, [inventory.data]);
  const lastSuccessfulEquipment = useRef<{ key: string; equipment: Equipment[] } | null>(null);
  if (inventory.data && !inventory.isFetching && !inventory.isError) {
    lastSuccessfulEquipment.current = { key: inventoryIdentity, equipment: pageEquipment };
  }
  // Retain only matching results during same-key refresh. Never present old-country
  // or old-filter rows under a newly committed filter, including failed transitions.
  const equipment = (inventory.isFetching || inventory.isError) && lastSuccessfulEquipment.current?.key === inventoryIdentity
    ? lastSuccessfulEquipment.current.equipment : pageEquipment;
  const setFilter = useCallback((key: keyof DiscoveryFilters, value: string) => {
    if (key === 'countryCode' && !isMarketEnabled(value, markets)) return;
    setSelection(current => updateDiscoveryFilter(current || resetDiscoveryFilters(defaultCountry), key, value));
  }, [defaultCountry, markets]);
  const applyFilters = useCallback((next: DiscoveryFilters) => {
    if (isMarketEnabled(next.countryCode, markets)) setSelection({ ...next, text: next.text.trim() });
  }, [markets]);
  const resetFilters = useCallback(() => setSelection(null), []);
  const { refetch: refetchInventory, fetchNextPage } = inventory;
  const { refetch: refetchMarkets } = marketQuery;
  const resetAndRefetchInventory = useCallback(() => {
    if (!allowed.current) return;
    mobilePerformance.markRefetch('discovery.equipment');
    queryClient.setQueryData(inventoryKey, (current: typeof inventory.data) => current ? {
      ...current,
      pages: current.pages.slice(0, 1),
      pageParams: current.pageParams.slice(0, 1),
    } : current);
    void refetchInventory();
  }, [inventoryKey, queryClient, refetchInventory]);
  const refresh = useCallback(() => {
    resetAndRefetchInventory();
    if (marketQuery.isError) void refetchMarkets();
  }, [resetAndRefetchInventory, marketQuery.isError, refetchMarkets]);
  const refreshIfStale = useCallback(() => {
    if (!allowed.current) return;
    const now = Date.now();
    refreshOnSignalIfStale(inventory.dataUpdatedAt, INVENTORY_STALE_MS, resetAndRefetchInventory, now);
    refreshOnSignalIfStale(marketQuery.dataUpdatedAt, MARKET_STALE_MS, () => { void refetchMarkets(); }, now);
  }, [inventory.dataUpdatedAt, marketQuery.dataUpdatedAt, refetchMarkets, resetAndRefetchInventory]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refreshIfStale(); });
    return () => subscription.remove();
  }, [refreshIfStale]);
  useEffect(() => subscribePublicEquipmentInvalidation(resetAndRefetchInventory), [resetAndRefetchInventory]);
  const loadMore = useCallback(() => {
    if (!allowed.current) return;
    if (inventory.hasNextPage && !inventory.isFetching && !inventory.isPlaceholderData) void fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage, inventory.hasNextPage, inventory.isFetching, inventory.isPlaceholderData]);
  const loading = inventoryEnabled && (inventory.isPending || marketQuery.isPending);
  const error = inventory.isError || marketQuery.isError;
  const refreshing = inventory.isFetching && !inventory.isFetchingNextPage && !inventory.isPending;
  const hasFilters = !!(filters.region || filters.city || filters.category || filters.text || filters.countryCode !== defaultCountry);
  return useMemo(() => ({ equipment: inventoryEnabled ? equipment : [], filters, markets, setFilter, applyFilters, resetFilters, refresh, refreshIfStale, loadMore,
    hasMore: inventory.hasNextPage, loadingMore: inventory.isFetchingNextPage,
    loading, refreshing, error, hasFilters }),
  [inventoryEnabled, equipment, filters, markets, setFilter, applyFilters, resetFilters, refresh, refreshIfStale, loadMore,
    inventory.hasNextPage, inventory.isFetchingNextPage, loading, refreshing, error, hasFilters]);
}

const DiscoveryContext = createContext<ReturnType<typeof useDiscoveryState> | null>(null);
const DiscoveryMarketsContext = createContext<ReturnType<typeof useDiscoveryState>['markets']>(undefined);

export function DiscoveryProvider({ children }: { children: React.ReactNode }) {
  const value = useDiscoveryState();
  useEffect(() => { mobilePerformance.markContextCommit('discovery'); }, [value]);
  return <DiscoveryMarketsContext.Provider value={value.markets}><DiscoveryContext.Provider value={value}>{children}</DiscoveryContext.Provider></DiscoveryMarketsContext.Provider>;
}

/** Market-only consumers need not subscribe to inventory or filter commits. */
export function useDiscoveryMarkets() { return useContext(DiscoveryMarketsContext); }

export function useDiscovery() {
  const value = useContext(DiscoveryContext);
  if (!value) throw new Error('DiscoveryProvider is required');
  const refreshOnFocus = useRef(value.refreshIfStale);
  refreshOnFocus.current = value.refreshIfStale;
  // Tab screens stay mounted; focus only revalidates stale shared data.
  useFocusEffect(useCallback(() => { refreshOnFocus.current(); }, []));
  return value;
}

/** Draft keystrokes/selections never mutate shared discovery or its query key. */
export function useDiscoveryDraft(discovery: ReturnType<typeof useDiscovery>) {
  const { filters, setFilter, applyFilters } = discovery;
  const [text, setText] = useState(filters.text);
  const [draftFilters, setDraftFilters] = useState(filters);
  const pendingText = useRef(false);
  const pendingPress = useRef<ReturnType<typeof mobilePerformance.startPress> | null>(null);
  useLayoutEffect(() => { pendingPress.current?.visible(); pendingPress.current = null; }, [text, draftFilters]);
  useEffect(() => () => { pendingPress.current?.cancel(); }, []);
  useEffect(() => { setText(filters.text); pendingText.current = false; }, [filters.text]);
  useEffect(() => {
    if (!pendingText.current) return;
    const timer = setTimeout(() => {
      if (!pendingText.current) return;
      pendingText.current = false;
      setFilter('text', text.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [text, setFilter]);
  const changeText = useCallback((next: string) => {
    pendingPress.current?.cancel();
    pendingPress.current = mobilePerformance.startPress('discovery.searchDraft');
    pendingText.current = true;
    setText(next);
  }, []);
  const commitText = useCallback(() => { pendingText.current = false; setFilter('text', text.trim()); }, [text, setFilter]);
  const beginFilters = useCallback(() => setDraftFilters({ ...filters, text }), [filters, text]);
  const changeFilter = useCallback((key: keyof DiscoveryFilters, value: string) => {
    pendingPress.current?.cancel();
    pendingPress.current = mobilePerformance.startPress('discovery.filterDraft');
    setDraftFilters(current => updateDiscoveryFilter(current, key, value));
  }, []);
  const commitFilters = useCallback(() => {
    pendingText.current = false;
    applyFilters({ ...draftFilters, text });
  }, [applyFilters, draftFilters, text]);
  const resetAll = useCallback(() => {
    pendingText.current = false;
    setText('');
    discovery.resetFilters();
  }, [discovery.resetFilters]);
  return { text, changeText, commitText, draftFilters, beginFilters, changeFilter, commitFilters, resetAll };
}