import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import { GCC_COUNTRIES } from '@/constants/gcc';
import { useLanguage } from '@/contexts/LanguageContext';
import { citiesForLocation, isMarketEnabled, regionsForCountry, type MarketAvailability } from '@/services/locationHierarchy';
import type { DiscoveryFilters as Filters } from '@/services/publicDiscovery';
import { mockCategories } from '@/mocks/categories';

type Props = {
  filters: Filters;
  markets?: readonly MarketAvailability[];
  setFilter: (key: keyof Filters, value: string) => void;
  includeCategories?: boolean;
};

export default function DiscoveryFilters({ filters, markets, setFilter, includeCategories }: Props) {
  const { isRTL, t, localizedText } = useLanguage();
  const row = { flexDirection: isRTL ? 'row-reverse' as const : 'row' as const };
  const chip = (key: keyof Filters, value: string, label: string, disabled = false) => {
    const selected = filters[key] === value;
    return <Pressable key={value} accessibilityRole="button" accessibilityState={{ disabled, selected }}
      disabled={disabled} testID={`filter-${key}-${value}`}
      style={[styles.chip, selected && styles.selected, disabled && styles.disabled]}
      onPress={() => setFilter(key, key !== 'countryCode' && selected ? '' : value)}>
      <Text style={[styles.chipText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>;
  };
  return <View style={styles.container}>
    <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('country')}</Text>
    <View style={[styles.row, row]}>{GCC_COUNTRIES.map(country => {
      const disabled = !isMarketEnabled(country.code, markets);
      return chip('countryCode', country.code, `${localizedText(country.nameAr, country.nameEn)}${disabled ? ` (${t('inactive')})` : ''}`, disabled);
    })}</View>
    {includeCategories && <>
      <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('category')}</Text>
      <View style={[styles.row, row]}>{mockCategories.map(category => chip('category', category.id, localizedText(category.nameAr, category.nameEn)))}</View>
    </>}
    <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('region')}</Text>
    <View style={[styles.row, row]}>{regionsForCountry(filters.countryCode, markets).map(region => chip('region', region.id, localizedText(region.nameAr, region.nameEn)))}</View>
    {!!filters.region && <>
      <Text style={[styles.label, { textAlign: isRTL ? 'right' : 'left' }]}>{t('city')}</Text>
      <View style={[styles.row, row]}>{citiesForLocation(filters.countryCode, filters.region, markets).map(city => chip('city', city.id, localizedText(city.nameAr, city.nameEn)))}</View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  label: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600', marginTop: 4 },
  row: { flexWrap: 'wrap', gap: 8, width: '100%' },
  chip: { maxWidth: '100%', minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  selected: { backgroundColor: Colors.gold, borderColor: Colors.gold },
  disabled: { opacity: 0.5 },
  chipText: { fontSize: 12, color: Colors.textSecondary, flexShrink: 1 },
  selectedText: { color: Colors.primary, fontWeight: '700' },
});