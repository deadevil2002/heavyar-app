import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

const INVENTORY_STALE_MS = 2 * 60_000;
const MARKET_STALE_MS = 30 * 60_000;

function useDiscoveryState() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const marketQuery = useQuery({
    queryKey: ['markets', 'public'],
    queryFn: fetchMarketConfig,
    staleTime: MARKET_STALE_MS,
    refetchOnWindowFocus: false,
  });
  const markets = marketQuery.data;
  const defaultCountry = defaultDiscoveryCountry(user?.countryCode, markets);
  const [selection, setSelection] = useState<DiscoveryFilters | null>(null);
  const [searchText, setSearchText] = useState('');
  const filters = useMemo(() => {
    if (!selection) return resetDiscoveryFilters(defaultCountry);
    // An Admin-disabled market cannot leave the user stranded in empty inventory.
    return isMarketEnabled(selection.countryCode, markets) ? selection : resetDiscoveryFilters(defaultCountry);
  }, [selection, defaultCountry, markets]);
  useEffect(() => {
    const timeout = setTimeout(() => setSearchText(filters.text.trim()), 350);
    return () => clearTimeout(timeout);
  }, [filters.text]);
  const queryFilters = useMemo(() => ({ ...filters, text: searchText }), [filters, searchText]);
  const inventoryKey = useMemo(() => ['equipment', 'public-search', queryFilters] as const, [queryFilters]);
  const inventory = useInfiniteQuery({
    queryKey: inventoryKey,
    queryFn: ({ pageParam, signal }) => searchPublicEquipment(queryFilters, pageParam, 20, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor,
    staleTime: INVENTORY_STALE_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const equipment = useMemo(() => {
    const unique = new Map<string, Equipment>();
    for (const item of inventory.data?.pages.flatMap(page => page.equipment) || []) unique.set(item.id, item);
    return [...unique.values()];
  }, [inventory.data]);
  const setFilter = useCallback((key: keyof DiscoveryFilters, value: string) => {
    if (key === 'countryCode' && !isMarketEnabled(value, markets)) return;
    setSelection(updateDiscoveryFilter(filters, key, value));
  }, [filters, markets]);
  const resetFilters = useCallback(() => setSelection(null), []);
  const { refetch: refetchInventory, fetchNextPage } = inventory;
  const { refetch: refetchMarkets } = marketQuery;
  const resetAndRefetchInventory = useCallback(() => {
    queryClient.setQueryData(inventoryKey, (current: typeof inventory.data) => current ? {
      ...current,
      pages: current.pages.slice(0, 1),
      pageParams: current.pageParams.slice(0, 1),
    } : current);
    void refetchInventory();
  }, [inventory.data, inventoryKey, queryClient, refetchInventory]);
  const refresh = useCallback(() => { resetAndRefetchInventory(); }, [resetAndRefetchInventory]);
  const refreshIfStale = useCallback(() => {
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
    if (inventory.hasNextPage && !inventory.isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, inventory.hasNextPage, inventory.isFetchingNextPage]);
  return { equipment, filters, markets, setFilter, resetFilters, refresh, refreshIfStale, loadMore,
    hasMore: inventory.hasNextPage, loadingMore: inventory.isFetchingNextPage,
    loading: inventory.isPending || marketQuery.isPending,
    refreshing: inventory.isRefetching && !inventory.isFetchingNextPage, error: inventory.isError,
    hasFilters: !!(filters.region || filters.city || filters.category || filters.text || filters.countryCode !== defaultCountry) };
}

const DiscoveryContext = createContext<ReturnType<typeof useDiscoveryState> | null>(null);

export function DiscoveryProvider({ children }: { children: React.ReactNode }) {
  const value = useDiscoveryState();
  return <DiscoveryContext.Provider value={value}>{children}</DiscoveryContext.Provider>;
}

export function useDiscovery() {
  const value = useContext(DiscoveryContext);
  if (!value) throw new Error('DiscoveryProvider is required');
  // Tab screens stay mounted; focus only revalidates stale shared data.
  useFocusEffect(useCallback(() => { value.refreshIfStale(); }, [value.refreshIfStale]));
  return value;
}