import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search as SearchIcon, SlidersHorizontal, X, Grid2X2, List } from 'lucide-react-native';
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

export default function SearchScreen() {
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

        <View style={[styles.segmentedControl, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable accessibilityRole="button" onPress={() => { setMode('equipment'); router.setParams({ mode: 'equipment' }); }} style={[styles.segment, mode === 'equipment' && styles.segmentActive]}>
            <Text style={[styles.segmentText, mode === 'equipment' && styles.segmentTextActive]}>{isRTL ? 'المعدات' : 'Equipment'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setMode('drivers'); router.setParams({ mode: 'drivers' }); }} style={[styles.segment, mode === 'drivers' && styles.segmentActive]}>
            <Text style={[styles.segmentText, mode === 'drivers' && styles.segmentTextActive]}>{isRTL ? 'السائقون' : 'Drivers'}</Text>
          </Pressable>
        </View>

        {mode === 'equipment' ? (
          <>
            <View style={[styles.searchRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.searchInput, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <SearchIcon size={20} color={Colors.textMuted} />
            <TextInput
              style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={t('search_placeholder')}
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={commitText}
              testID="search-input"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <X size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('filters')} accessibilityState={{ expanded: showFilters }}
            style={[styles.filterButton, showFilters && styles.filterActive]} onPress={toggleFilters}>
            <SlidersHorizontal size={20} color={showFilters ? Colors.primary : Colors.gold} />
          </Pressable>
        </View>

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
          <View style={[styles.viewToggle, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('list_view')} onPress={() => { setView('list'); void saveEquipmentView('list'); }} style={[styles.viewButton, view === 'list' && styles.viewButtonSelected]}>
              <List size={18} color={view === 'list' ? Colors.primary : Colors.gold} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('grid_view')} onPress={() => { setView('grid'); void saveEquipmentView('grid'); }} style={[styles.viewButton, view === 'grid' && styles.viewButtonSelected]}>
              <Grid2X2 size={18} color={view === 'grid' ? Colors.primary : Colors.gold} />
            </Pressable>
          </View>
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
          contentContainerStyle={styles.listContent}
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
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
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
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.textPrimary,
  },
  searchRow: {
    paddingHorizontal: 20,
    gap: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
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
