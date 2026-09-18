import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search as SearchIcon, SlidersHorizontal, X, Grid2X2, List } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { mockCategories } from '@/mocks/categories';
import { GCC_COUNTRIES } from '@/constants/gcc';
import { citiesForLocation, filterListingsByLocation, regionsForCountry } from '@/services/locationHierarchy';
import { fetchMarketConfig, type MarketConfig } from '@/services/authService';
import { fetchEquipmentList } from '@/services/firestoreService';
import EquipmentCard from '@/components/EquipmentCard';
import EmptyState from '@/components/EmptyState';
import { Equipment } from '@/types';
import { loadEquipmentView, saveEquipmentView, type EquipmentView } from '@/services/equipmentViewPreference';

export default function SearchScreen() {
  const { isRTL, t, localizedText } = useLanguage();
  const [query, setQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [markets, setMarkets] = useState<MarketConfig[]>([]);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([]);
  const [view, setView] = useState<EquipmentView>('list');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const items = await fetchEquipmentList();
        if (mounted) setAllEquipment(items);
      } catch (e) {
      }
    };
    void load();
    return () => { mounted = false; };
  }, []);
  useEffect(() => { void fetchMarketConfig().then(setMarkets); }, []);

  useEffect(() => {
    void loadEquipmentView().then(setView);
  }, []);

  const filteredEquipment = useMemo(() => {
    const locationFiltered = filterListingsByLocation(allEquipment, { countryCode: selectedCountry || undefined, region: selectedRegion || undefined, city: selectedCity || undefined });
    return locationFiltered.filter(eq => {
      if (!eq.isActive) return false;
      if (query) {
        const searchText = `${eq.titleAr} ${eq.titleEn} ${eq.descriptionAr} ${eq.descriptionEn}`.toLowerCase();
        if (!searchText.includes(query.toLowerCase())) return false;
      }
      if (selectedCategory && eq.category !== selectedCategory) return false;
      return true;
    });
  }, [query, selectedCategory, selectedCountry, selectedRegion, selectedCity, allEquipment]);

  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedCategory(null);
    setSelectedCountry(null);
    setSelectedRegion(null);
    setSelectedCity(null);
    setQuery('');
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
          <Pressable style={[styles.filterButton, showFilters && styles.filterActive]} onPress={toggleFilters}>
            <SlidersHorizontal size={20} color={showFilters ? Colors.primary : Colors.gold} />
          </Pressable>
        </View>

        {showFilters && (
          <View style={styles.filtersContainer}>
            <View style={[styles.filterSection, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={styles.filterLabel}>{t('country')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={styles.chipRow}>{GCC_COUNTRIES.map(country => {
                const enabled = markets.find(m => m.code === country.code)?.enabled === true;
                const chosen = selectedCountry === country.code;
                return <Pressable key={country.code} disabled={!enabled} accessibilityState={{ disabled: !enabled }} style={[styles.chip, chosen && styles.chipSelected, !enabled && styles.chipDisabled]} onPress={() => { setSelectedCountry(chosen ? null : country.code); setSelectedRegion(null); setSelectedCity(null); }}>
                  <Text style={[styles.chipText, chosen && styles.chipTextSelected, !enabled && styles.chipTextDisabled]}>{localizedText(country.nameAr, country.nameEn)}{!enabled ? ` (${t('inactive')})` : ''}</Text>
                </Pressable>;
              })}</View></ScrollView>
            </View>
            <View style={[styles.filterSection, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={styles.filterLabel}>{t('category')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {mockCategories.map(cat => (
                    <Pressable
                      key={cat.id}
                      style={[styles.chip, selectedCategory === cat.id && styles.chipSelected]}
                      onPress={() => setSelectedCategory(prev => prev === cat.id ? null : cat.id)}
                    >
                      <Text style={[styles.chipText, selectedCategory === cat.id && styles.chipTextSelected]}>
                        {localizedText(cat.nameAr, cat.nameEn)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View style={[styles.filterSection, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
              <Text style={styles.filterLabel}>{t('region')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {regionsForCountry(selectedCountry || undefined, markets).map(r => (
                    <Pressable
                      key={r.id}
                      style={[styles.chip, selectedRegion === r.id && styles.chipSelected]}
                      onPress={() => { setSelectedRegion(prev => prev === r.id ? null : r.id); setSelectedCity(null); }}
                    >
                      <Text style={[styles.chipText, selectedRegion === r.id && styles.chipTextSelected]}>
                        {localizedText(r.nameAr, r.nameEn)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
            {selectedRegion && <View style={[styles.filterSection, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}><Text style={styles.filterLabel}>{t('city')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={styles.chipRow}>{citiesForLocation(selectedCountry || undefined, selectedRegion, markets).map(city => <Pressable key={city.id} style={[styles.chip, selectedCity === city.id && styles.chipSelected]} onPress={() => setSelectedCity(prev => prev === city.id ? null : city.id)}><Text style={[styles.chipText, selectedCity === city.id && styles.chipTextSelected]}>{localizedText(city.nameAr, city.nameEn)}</Text></Pressable>)}</View></ScrollView></View>}
            {(selectedCategory || selectedCountry || selectedRegion || selectedCity) && (
              <Pressable style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearText}>{t('reset_filters')}</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={[styles.resultsHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={styles.resultsText}>{filteredEquipment.length} {t('results')}</Text>
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
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState title={t('no_results')} />}
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
