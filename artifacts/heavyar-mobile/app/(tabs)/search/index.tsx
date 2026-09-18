import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search as SearchIcon, SlidersHorizontal, X, Grid2X2, List } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDiscovery } from '@/contexts/DiscoveryContext';
import DiscoveryFilters from '@/components/DiscoveryFilters';
import EquipmentCard from '@/components/EquipmentCard';
import EmptyState from '@/components/EmptyState';
import { Equipment } from '@/types';
import { loadEquipmentView, saveEquipmentView, type EquipmentView } from '@/services/equipmentViewPreference';

export default function SearchScreen() {
  const { isRTL, t } = useLanguage();
  const { equipment: filteredEquipment, filters, markets, setFilter, resetFilters, hasFilters, loading, refreshing, error, refresh } = useDiscovery();
  const query = filters.text;
  const setQuery = (text: string) => setFilter('text', text);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [view, setView] = useState<EquipmentView>('list');

  useEffect(() => {
    void loadEquipmentView().then(setView);
  }, []);

  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

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

        <View style={[styles.searchRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.searchInput, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <SearchIcon size={20} color={Colors.textMuted} />
            <TextInput
              style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
              placeholder={t('search_placeholder')}
              placeholderTextColor={Colors.textMuted}
              value={query}
              onChangeText={setQuery}
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
          <DiscoveryFilters filters={filters} markets={markets} setFilter={setFilter} includeCategories />
        </ScrollView>}
        {hasFilters && <Pressable accessibilityRole="button" style={styles.clearButton} onPress={resetFilters}>
          <Text style={styles.clearText}>{t('reset_filters')}</Text>
        </Pressable>}

        <View style={[styles.resultsHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={styles.resultsText}>{filters.countryCode} · {loading ? t('loading') : `${filteredEquipment.length} ${t('results')}`}</Text>
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
          data={error || loading ? [] : filteredEquipment}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          key={view}
          numColumns={view === 'grid' ? 2 : 1}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing && !loading}
          onRefresh={refresh}
          ListEmptyComponent={loading ? <ActivityIndicator size="large" color={Colors.gold} /> : error ? <View>
            <EmptyState title={t('discovery_load_error')} />
            <Pressable accessibilityRole="button" onPress={refresh} style={styles.clearButton}><Text style={styles.clearText}>{t('discovery_retry')}</Text></Pressable>
          </View> : <EmptyState title={hasFilters ? t('no_results') : t('no_equipment')} />}
        />
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
    maxWidth: '50%',
    paddingHorizontal: 4,
  },
});
