import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useLanguage } from '@/contexts/LanguageContext';
import { mockCategories, mockCities } from '@/mocks/categories';
import { fetchEquipmentList } from '@/services/firestoreService';
import EquipmentCard from '@/components/EquipmentCard';
import EmptyState from '@/components/EmptyState';
import { Equipment } from '@/types';

export default function SearchScreen() {
  const { isRTL, t, localizedText } = useLanguage();
  const [query, setQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [allEquipment, setAllEquipment] = useState<Equipment[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const items = await fetchEquipmentList();
        if (mounted) setAllEquipment(items);
      } catch (e) {
        console.log('[Search] Error fetching equipment:', e);
      }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const filteredEquipment = useMemo(() => {
    return allEquipment.filter(eq => {
      if (!eq.isActive) return false;
      if (query) {
        const searchText = `${eq.titleAr} ${eq.titleEn} ${eq.descriptionAr} ${eq.descriptionEn}`.toLowerCase();
        if (!searchText.includes(query.toLowerCase())) return false;
      }
      if (selectedCategory && eq.category !== selectedCategory) return false;
      if (selectedCity && eq.city !== selectedCity) return false;
      return true;
    });
  }, [query, selectedCategory, selectedCity, allEquipment]);

  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedCategory(null);
    setSelectedCity(null);
    setQuery('');
  }, []);

  const renderItem = useCallback(({ item }: { item: Equipment }) => (
    <EquipmentCard equipment={item} />
  ), []);

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
              <Text style={styles.filterLabel}>{t('city')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={[styles.chipRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  {mockCities.map(city => (
                    <Pressable
                      key={city.id}
                      style={[styles.chip, selectedCity === city.id && styles.chipSelected]}
                      onPress={() => setSelectedCity(prev => prev === city.id ? null : city.id)}
                    >
                      <Text style={[styles.chipText, selectedCity === city.id && styles.chipTextSelected]}>
                        {localizedText(city.nameAr, city.nameEn)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
            {(selectedCategory || selectedCity) && (
              <Pressable style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearText}>{t('reset_filters')}</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={[styles.resultsHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={styles.resultsText}>{filteredEquipment.length} {t('results')}</Text>
        </View>

        <FlatList
          data={filteredEquipment}
          renderItem={renderItem}
          keyExtractor={item => item.id}
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
  },
  resultsText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
});
