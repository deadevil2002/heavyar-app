import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDiscoveryMarkets } from '@/contexts/DiscoveryContext';
import { searchDrivers, type DriverPublicProfile } from '@/services/workerClient';
import DriverCard from './DriverCard';
import EmptyState from './EmptyState';
import { GCC_COUNTRIES } from '@/constants/gcc';
import { regionsForCountry, citiesForLocation } from '@/services/locationHierarchy';
import { isMarketEnabled } from '@/services/locationHierarchy';
import { mockCategories } from '@/mocks/categories';
import { defaultDriverCountry, resetDriverSearchFilters } from '@/services/driverUtils';
import { LatestRequestGuard, mergeUniqueById } from '@/services/driverLiveSync';
import HeavyarSearchBar from './ui/HeavyarSearchBar';
import { HeavyarChip, HeavyarChipText } from './ui/heavyar';

const DRIVER_SEARCH_STALE_MS = 2 * 60_000;

export default function DriverSearchTab() {
  const { isRTL, t } = useLanguage();
  const markets = useDiscoveryMarkets();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [countryCode, setCountryCode] = useState('SA');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [equipment, setEquipment] = useState('');
  const [availability, setAvailability] = useState('');

  const [drivers, setDrivers] = useState<DriverPublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const nextCursorRef = useRef<string | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadedPagesRef = useRef(1);
  const queryKeyRef = useRef('');
  const lastFetchedAtRef = useRef(0);
  const guardRef = useRef(new LatestRequestGuard());
  const loadingMoreRef = useRef(false);

  const hasFilters = region !== '' || city !== '' || equipment !== '' || q !== '' || countryCode !== 'SA' || availability !== '';

  const resetFilters = () => {
    const reset = resetDriverSearchFilters(markets);
    setCountryCode(reset.countryCode); setRegion(reset.region); setCity(reset.city);
    setEquipment(reset.equipment); setQ(reset.q); setDebouncedQ(reset.q); setAvailability(reset.availability);
  };

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(timeout);
  }, [q]);

  useEffect(() => {
    if (isMarketEnabled(countryCode, markets)) return;
    setCountryCode(defaultDriverCountry(markets));
    setRegion('');
    setCity('');
  }, [countryCode, markets]);

  const fetchDrivers = useCallback(async (append = false, silent = false) => {
    if (append && (!nextCursorRef.current || loadingMoreRef.current)) return;

    const request = guardRef.current.begin();
    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      loadingMoreRef.current = false;
      setLoadingMore(false);
      if (silent) setRefreshing(true);
      else setLoading(true);
    }
    setError(false);

    try {
      const params = { q: debouncedQ, countryCode, region, city, equipment, availabilityStatus: availability, limit: 20 };
      const queryKey = JSON.stringify(params);
      if (append) {
        const result = await searchDrivers({ ...params, cursor: nextCursorRef.current }, request.signal);
        if (!guardRef.current.isCurrent(request.generation)) return;
        setDrivers(previous => mergeUniqueById(previous, result.drivers));
        loadedPagesRef.current += 1;
        nextCursorRef.current = result.nextCursor;
        setNextCursor(result.nextCursor);
      } else {
        const page = await searchDrivers(params, request.signal);
        if (!guardRef.current.isCurrent(request.generation)) return;
        setDrivers(mergeUniqueById([], page.drivers));
        queryKeyRef.current = queryKey;
        loadedPagesRef.current = 1;
        nextCursorRef.current = page.nextCursor;
        setNextCursor(page.nextCursor);
        lastFetchedAtRef.current = Date.now();
      }
    } catch (e: unknown) {
      if (!guardRef.current.isCurrent(request.generation)) return;
      setError(true);
      setDrivers([]);
      nextCursorRef.current = undefined;
      setNextCursor(undefined);
      loadedPagesRef.current = 1;
    } finally {
      if (guardRef.current.isCurrent(request.generation)) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
        loadingMoreRef.current = false;
      }
    }
  }, [debouncedQ, countryCode, region, city, equipment, availability]);

  useFocusEffect(
    useCallback(() => {
       const params = JSON.stringify({ q: debouncedQ, countryCode, region, city, equipment, availabilityStatus: availability, limit: 20 });
       if (queryKeyRef.current !== params || Date.now() - lastFetchedAtRef.current >= DRIVER_SEARCH_STALE_MS) {
         void fetchDrivers(false, drivers.length > 0);
       }
      return () => {
        guardRef.current.cancel();
        loadingMoreRef.current = false;
      };
    }, [availability, city, countryCode, debouncedQ, drivers.length, equipment, fetchDrivers, region])
  );

  const renderFilterChips = (items: {id: string, nameAr: string, nameEn: string, disabled?: boolean}[], selected: string, onSelect: (id: string) => void) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      {items.map(item => (
        <HeavyarChip key={item.id} selected={selected === item.id} accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(item.disabled), selected: selected === item.id }}
          disabled={item.disabled} opacity={item.disabled ? 0.45 : 1}
          onPress={() => onSelect(item.id === selected ? '' : item.id)}>
          <HeavyarChipText selected={selected === item.id}>{isRTL ? item.nameAr : item.nameEn}</HeavyarChipText>
        </HeavyarChip>
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <HeavyarSearchBar
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => setDebouncedQ(q.trim())}
        onClear={() => setQ('')}
        placeholder={isRTL ? 'ابحث باسم السائق...' : 'Search driver by name...'}
        filterLabel={isRTL ? 'تصفية السائقين' : 'Filter drivers'}
        filtersExpanded={showFilters}
        onFilterPress={() => setShowFilters(value => !value)}
        isRTL={isRTL}
      />

      {showFilters && (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.filtersScroll} contentContainerStyle={styles.filtersContainer}>
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('country')}</Text>
            {renderFilterChips(GCC_COUNTRIES.map(c => {
                const disabled = !isMarketEnabled(c.code, markets);
               return { id: c.code, nameAr: c.nameAr, nameEn: c.nameEn, disabled };
            }), countryCode, (id) => { if(id) { setCountryCode(id); setRegion(''); setCity(''); } })}
          </View>
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('region')}</Text>
            {renderFilterChips(regionsForCountry(countryCode, markets).map(r => ({ id: r.id, nameAr: r.nameAr, nameEn: r.nameEn })), region, (id) => { setRegion(id); setCity(''); })}
          </View>
          {region ? (
            <View style={styles.filterSection}>
              <Text style={[styles.filterLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{t('city')}</Text>
              {renderFilterChips(citiesForLocation(countryCode, region, markets).map(c => ({ id: c.id, nameAr: c.nameAr, nameEn: c.nameEn })), city, setCity)}
            </View>
          ) : null}
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'الحالة' : 'Availability'}</Text>
            {renderFilterChips([
              { id: 'available', nameAr: 'متاح', nameEn: 'Available' },
              { id: 'busy', nameAr: 'مشغول', nameEn: 'Busy' },
              { id: 'offline', nameAr: 'غير متصل', nameEn: 'Offline' }
            ], availability, setAvailability)}
          </View>
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{isRTL ? 'المعدات' : 'Equipment Type'}</Text>
            {renderFilterChips(mockCategories.map(c => ({id: c.id, nameAr: c.nameAr, nameEn: c.nameEn})), equipment, setEquipment)}
          </View>
        </ScrollView>
      )}

      {hasFilters && (
        <Pressable style={styles.clearButton} onPress={resetFilters}>
          <Text style={styles.clearText}>{isRTL ? 'مسح الفلاتر' : 'Clear filters'}</Text>
        </Pressable>
      )}

      <FlatList
        showsVerticalScrollIndicator={false}
        data={loading ? [] : drivers}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, !loading && drivers.length === 0 && styles.emptyListContent]}
        onEndReached={() => { if (drivers.length > 0) void fetchDrivers(true); }}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={() => void fetchDrivers(false, true)}
        ListFooterComponent={loadingMore
          ? <ActivityIndicator size="small" color={Colors.gold} style={{marginVertical: 20}} />
          : nextCursor
            ? <Pressable accessibilityRole="button" accessibilityLabel={isRTL ? 'تحميل المزيد من السائقين' : 'Load more drivers'} onPress={() => void fetchDrivers(true)} style={styles.loadMoreButton}><Text style={styles.loadMoreText}>{isRTL ? 'تحميل المزيد' : 'Load more'}</Text></Pressable>
            : null}
        ListEmptyComponent={
          loading ? <ActivityIndicator size="large" color={Colors.gold} style={{marginTop: 40}} /> :
          error ? (
            <View style={{marginTop: 40}}>
              <EmptyState title={isRTL ? 'حدث خطأ أثناء تحميل السائقين' : 'Failed to load drivers'} />
              <Pressable onPress={() => fetchDrivers()} style={styles.clearButton}><Text style={styles.clearText}>{isRTL ? 'إعادة المحاولة' : 'Retry'}</Text></Pressable>
            </View>
          ) : (
            <View>
              <EmptyState title={isRTL ? 'لا يوجد سائقون متاحون حاليًا حسب خيارات البحث.' : 'No drivers are currently available for these filters.'} />
              {!hasFilters && <Pressable accessibilityRole="button" onPress={resetFilters} style={styles.clearButton}><Text style={styles.clearText}>{isRTL ? 'مسح الفلاتر' : 'Clear filters'}</Text></Pressable>}
            </View>
          )
        }
        renderItem={({ item }) => <DriverCard driver={item} onPress={() => router.push(`/driver/${item.id}`)} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filtersContainer: { paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  filtersScroll: { maxHeight: '45%', flexGrow: 0, flexShrink: 1 },
  filterSection: { gap: 8 },
  filterLabel: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
  chipRow: { gap: 8 },
  clearButton: { alignSelf: 'center', paddingVertical: 6, marginBottom: 8 },
  clearText: { color: Colors.error, fontSize: 13, fontWeight: '600' },
  loadMoreButton: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, marginVertical: 12 },
  loadMoreText: { color: Colors.gold, fontSize: 14, fontWeight: '700' },
  listContent: { paddingHorizontal: 20, paddingBottom: 20 },
  emptyListContent: { flexGrow: 1, justifyContent: 'center' },
});
