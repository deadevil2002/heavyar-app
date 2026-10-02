import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Grid2X2, List } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDiscovery, useDiscoveryDraft } from '@/contexts/DiscoveryContext';
import DiscoveryFilters from '@/components/DiscoveryFilters';
import EquipmentCard from '@/components/EquipmentCard';
import EmptyState from '@/components/EmptyState';
import { Equipment } from '@/types';
import { loadEquipmentView, saveEquipmentView, type EquipmentView } from '@/services/equipmentViewPreference';

import { useLocalSearchParams, useRouter } from 'expo-router';
import DriverSearchTab from '@/components/DriverSearchTab';
import { mobilePerformance } from '@/utils/mobilePerformance';
import { useAuth } from '@/contexts/AuthContext';
import { canBrowsePublicEquipment } from '@/services/marketplaceAccess';
import {
  HeavyarIconButton,
  HeavyarSegment,
  HeavyarSegmentedControl,
  HeavyarSegmentText,
} from '@/components/ui/heavyar';
import HeavyarSearchBar from '@/components/ui/HeavyarSearchBar';

export default function SearchScreen() {
  const auth = useAuth();
  const { isRTL, t } = useLanguage();
  if (canBrowsePublicEquipment(auth)) return <MarketplaceSearch />;
  return <View style={styles.container}><SafeAreaView edges={['top']} style={styles.safeArea}>
    <View style={styles.headerRow}><Text style={styles.title}>{auth.user?.role === 'provider' ? (isRTL ? 'البحث عن سائق' : 'Find Driver') : t('search')}</Text></View>
    {auth.isLoading ? <View style={styles.roleStateViewport}><ActivityIndicator color={Colors.gold} /></View> : auth.user?.role === 'provider' ? <DriverSearchTab /> :
      <View style={styles.roleStateViewport}><EmptyState title={isRTL ? 'تابع طلباتك من صفحة الطلبات' : 'Manage your work in Requests'} /></View>}
  </SafeAreaView></View>;
}

function MarketplaceSearch() {
  mobilePerformance.countRender('search');
  const { isRTL, t } = useLanguage();
  const params = useLocalSearchParams();
  const router = useRouter();
  const discovery = useDiscovery();
  const { equipment: filteredEquipment, filters, markets, hasFilters, loading, refreshing, error, refresh, loadMore, hasMore, loadingMore } = discovery;
  const { text: query, changeText: setQuery, commitText, draftFilters, beginFilters, changeFilter, commitFilters, resetAll } = useDiscoveryDraft(discovery);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [view, setView] = useState<EquipmentView>('list');
  const [mode, setMode] = useState<'equipment' | 'drivers'>('equipment');

  useEffect(() => {
    if (params.mode === 'drivers') setMode('drivers');
    else if (params.mode === 'equipment') setMode('equipment');
  }, [params.mode]);

  useEffect(() => {
    void loadEquipmentView().then(setView);
  }, []);

  const toggleFilters = useCallback(() => {
    if (!showFilters) beginFilters();
    setShowFilters(prev => !prev);
  }, [showFilters, beginFilters]);

  const renderItem = useCallback(({ item }: { item: Equipment }) => (
    <View style={view === 'grid' ? styles.gridItem : undefined}>
      <EquipmentCard equipment={item} compact={view === 'grid'} />
    </View>
  ), [view]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{t('search')}</Text>
        </View>

        <HeavyarSegmentedControl mx="$md" mb="$sm" p="$xxs" flexDirection={isRTL ? 'row-reverse' : 'row'}>
          <HeavyarSegment height={40} minH={40} accessibilityRole="button" selected={mode === 'equipment'}
            onPress={() => { setMode('equipment'); router.setParams({ mode: 'equipment' }); }}>
            <HeavyarSegmentText selected={mode === 'equipment'}>{isRTL ? 'المعدات' : 'Equipment'}</HeavyarSegmentText>
          </HeavyarSegment>
          <HeavyarSegment height={40} minH={40} accessibilityRole="button" selected={mode === 'drivers'}
            onPress={() => { setMode('drivers'); router.setParams({ mode: 'drivers' }); }}>
            <HeavyarSegmentText selected={mode === 'drivers'}>{isRTL ? 'السائقون' : 'Drivers'}</HeavyarSegmentText>
          </HeavyarSegment>
        </HeavyarSegmentedControl>

        {mode === 'equipment' ? (
          <>
            <HeavyarSearchBar
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={commitText}
              onClear={() => setQuery('')}
              placeholder={t('search_placeholder')}
              filterLabel={t('filters')}
              filtersExpanded={showFilters}
              onFilterPress={toggleFilters}
              isRTL={isRTL}
              testID="search-input"
            />

        {showFilters && <ScrollView style={styles.filtersScroll} contentContainerStyle={styles.filtersContainer}>
          <DiscoveryFilters filters={draftFilters} markets={markets} setFilter={changeFilter} includeCategories />
          <Pressable accessibilityRole="button" testID="search-apply-filters" onPress={() => { commitFilters(); setShowFilters(false); }} style={styles.clearButton}>
            <Text style={styles.loadMoreText}>{isRTL ? 'تطبيق الفلاتر' : 'Apply Filters'}</Text>
          </Pressable>
        </ScrollView>}
        {hasFilters && <Pressable accessibilityRole="button" style={styles.clearButton} onPress={() => { resetAll(); setShowFilters(false); }}>
          <Text style={styles.clearText}>{t('reset_filters')}</Text>
        </Pressable>}

        <View style={[styles.resultsHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={styles.resultsText}>{filters.countryCode} · {loading ? t('loading') : `${filteredEquipment.length} ${t('results')}`}</Text>
          {refreshing && <ActivityIndicator size="small" color={Colors.gold} />}
          <HeavyarSegmentedControl p="$xxs" flexDirection={isRTL ? 'row-reverse' : 'row'}>
            <HeavyarIconButton width={40} height={40} circular={false} tone={view === 'list' ? 'active' : 'ghost'} accessibilityRole="button" accessibilityLabel={t('list_view')} onPress={() => { setView('list'); void saveEquipmentView('list'); }}>
              <List size={18} color={view === 'list' ? Colors.primary : Colors.gold} />
            </HeavyarIconButton>
            <HeavyarIconButton width={40} height={40} circular={false} tone={view === 'grid' ? 'active' : 'ghost'} accessibilityRole="button" accessibilityLabel={t('grid_view')} onPress={() => { setView('grid'); void saveEquipmentView('grid'); }}>
              <Grid2X2 size={18} color={view === 'grid' ? Colors.primary : Colors.gold} />
            </HeavyarIconButton>
          </HeavyarSegmentedControl>
        </View>

        <FlatList
          data={filteredEquipment}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          key={view}
          numColumns={view === 'grid' ? 2 : 1}
          columnWrapperStyle={view === 'grid' ? { gap: 12 } : undefined}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          contentContainerStyle={[styles.listContent, filteredEquipment.length === 0 && styles.emptyListContent]}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing && !loading}
          onRefresh={refresh}
          onEndReached={() => { if (filteredEquipment.length > 0) loadMore(); }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={error && filteredEquipment.length > 0 ? <Pressable accessibilityRole="button" onPress={refresh}><Text style={styles.clearText}>{t('discovery_load_error')} · {t('discovery_retry')}</Text></Pressable> : loadingMore
            ? <ActivityIndicator size="small" color={Colors.gold} />
            : hasMore
              ? <Pressable accessibilityRole="button" accessibilityLabel={isRTL ? 'تحميل المزيد' : 'Load more'} testID="equipment-load-more" onPress={loadMore} style={styles.loadMoreButton}>
                  <Text style={styles.loadMoreText}>{isRTL ? 'تحميل المزيد' : 'Load more'}</Text>
                </Pressable>
              : null}
          ListEmptyComponent={loading ? <ActivityIndicator size="large" color={Colors.gold} /> : error ? <View>
            <EmptyState title={t('discovery_load_error')} />
            <Pressable accessibilityRole="button" onPress={refresh} style={styles.clearButton}><Text style={styles.clearText}>{t('discovery_retry')}</Text></Pressable>
          </View> : <EmptyState title={hasFilters ? t('no_results') : t('no_equipment')} />}
        />
        </>) : <DriverSearchTab />}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },
  safeArea: {
    flex: 1,
  },
  roleStateViewport: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 72,
  },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
  },
  segmentedControl: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: Colors.inputBg,
  },
  segmentText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  segmentTextActive: {
    color: Colors.gold,
  },
  title: {
    width: '100%',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800' as const,
    color: Colors.textPrimary,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterActive: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  filtersScroll: {
    maxHeight: '45%',
    flexGrow: 0,
    flexShrink: 1,
  },
  filterSection: {
    gap: 8,
  },
  filterLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  chipRow: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  chipTextSelected: {
    color: Colors.primary,
    fontWeight: '700' as const,
  },
  chipDisabled: { opacity: 0.5 },
  chipTextDisabled: { color: Colors.textMuted },
  clearButton: {
    alignSelf: 'center',
    paddingVertical: 6,
  },
  clearText: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  resultsHeader: {
    paddingHorizontal: 20,
    marginBottom: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultsText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  viewToggle: {
    gap: 6,
  },
  viewButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewButtonSelected: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  gridItem: {
    flex: 1,
    maxWidth: '48%',
  },
  loadMoreButton: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 12, marginVertical: 12 },
  loadMoreText: { color: Colors.gold, fontSize: 14, fontWeight: '700' },
});
