import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { HeavyarChip, HeavyarChipText, useHeavyarDirection } from '@/components/ui/heavyar';
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
  const { t, localizedText } = useLanguage();
  const { rowDirection, textAlign } = useHeavyarDirection();
  const chip = (key: keyof Filters, value: string, label: string, disabled = false) => {
    const selected = filters[key] === value;
    return <HeavyarChip key={value} accessibilityRole="button" accessibilityState={{ disabled, selected }}
      disabled={disabled} testID={`filter-${key}-${value}`}
      selected={selected} opacity={disabled ? 0.42 : 1}
      onPress={() => setFilter(key, key !== 'countryCode' && selected ? '' : value)}>
      <HeavyarChipText selected={selected} numberOfLines={1}>{label}</HeavyarChipText>
    </HeavyarChip>;
  };
  return <YStack gap="$sm">
    <Text fontSize={13} color="$colorMuted" fontWeight="700" mt="$xs" text={textAlign}>{t('country')}</Text>
    <XStack flexDirection={rowDirection} flexWrap="wrap" gap="$sm" width="100%">{GCC_COUNTRIES.map(country => {
      const disabled = !isMarketEnabled(country.code, markets);
      return chip('countryCode', country.code, `${localizedText(country.nameAr, country.nameEn)}${disabled ? ` (${t('inactive')})` : ''}`, disabled);
    })}</XStack>
    {includeCategories && <>
      <Text fontSize={13} color="$colorMuted" fontWeight="700" mt="$xs" text={textAlign}>{t('category')}</Text>
      <XStack flexDirection={rowDirection} flexWrap="wrap" gap="$sm" width="100%">{mockCategories.map(category => chip('category', category.id, localizedText(category.nameAr, category.nameEn)))}</XStack>
    </>}
    <Text fontSize={13} color="$colorMuted" fontWeight="700" mt="$xs" text={textAlign}>{t('region')}</Text>
    <XStack flexDirection={rowDirection} flexWrap="wrap" gap="$sm" width="100%">{regionsForCountry(filters.countryCode, markets).map(region => chip('region', region.id, localizedText(region.nameAr, region.nameEn)))}</XStack>
    {!!filters.region && <>
      <Text fontSize={13} color="$colorMuted" fontWeight="700" mt="$xs" text={textAlign}>{t('city')}</Text>
      <XStack flexDirection={rowDirection} flexWrap="wrap" gap="$sm" width="100%">{citiesForLocation(filters.countryCode, filters.region, markets).map(city => chip('city', city.id, localizedText(city.nameAr, city.nameEn)))}</XStack>
    </>}
  </YStack>;
}
