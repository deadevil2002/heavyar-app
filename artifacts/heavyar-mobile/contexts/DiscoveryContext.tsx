import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { fetchEquipmentList } from '@/services/firestoreService';
import { fetchMarketConfig } from '@/services/authService';
import { isMarketEnabled } from '@/services/locationHierarchy';
import { defaultDiscoveryCountry, PUBLIC_EQUIPMENT_QUERY_KEY, resetDiscoveryFilters, selectPublicEquipment, updateDiscoveryFilter, type DiscoveryFilters } from '@/services/publicDiscovery';

function useDiscoveryState() {
  const { user } = useAuth();
  const inventory = useQuery({ queryKey: PUBLIC_EQUIPMENT_QUERY_KEY, queryFn: fetchEquipmentList, staleTime: 0, refetchInterval: 30_000, retry: 1 });
  const marketQuery = useQuery({ queryKey: ['markets', 'public'], queryFn: fetchMarketConfig, staleTime: 0, refetchInterval: 30_000 });
  const markets = marketQuery.data;
  const defaultCountry = defaultDiscoveryCountry(user?.countryCode, markets);
  const [selection, setSelection] = useState<DiscoveryFilters | null>(null);
  const filters = useMemo(() => {
    if (!selection) return resetDiscoveryFilters(defaultCountry);
    // An Admin-disabled market cannot leave the user stranded in empty inventory.
    return isMarketEnabled(selection.countryCode, markets) ? selection : resetDiscoveryFilters(defaultCountry);
  }, [selection, defaultCountry, markets]);
  const equipment = useMemo(() => selectPublicEquipment(inventory.data || [], filters, markets), [inventory.data, filters, markets]);
  const setFilter = useCallback((key: keyof DiscoveryFilters, value: string) => {
    if (key === 'countryCode' && !isMarketEnabled(value, markets)) return;
    setSelection(updateDiscoveryFilter(filters, key, value));
  }, [filters, markets]);
  const resetFilters = useCallback(() => setSelection(null), []);
  const { refetch: refetchInventory } = inventory;
  const { refetch: refetchMarkets } = marketQuery;
  const refresh = useCallback(() => { void refetchInventory(); void refetchMarkets(); }, [refetchInventory, refetchMarkets]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  return { equipment, filters, markets, setFilter, resetFilters, refresh, loading: inventory.isPending || marketQuery.isPending,
    refreshing: inventory.isFetching, error: inventory.isError,
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
  // Tab screens stay mounted: refresh on focus instead of retaining independent mount-time snapshots.
  useFocusEffect(useCallback(() => { value.refresh(); }, [value.refresh]));
  return value;
}