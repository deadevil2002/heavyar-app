import type { Equipment } from '../types';
import { isMarketEnabled, listingCountryCode, listingMatchesLocation, type MarketAvailability } from './locationHierarchy';

export type DiscoveryFilters = { countryCode: string; region: string; city: string; category: string; text: string };
export const PUBLIC_EQUIPMENT_QUERY_KEY = ['equipment', 'public', 'approved-visible-active'] as const;

export function defaultDiscoveryCountry(configuredCountry?: string, markets?: readonly MarketAvailability[]): string {
  return configuredCountry && isMarketEnabled(configuredCountry, markets) ? configuredCountry : 'SA';
}

export function resetDiscoveryFilters(countryCode: string): DiscoveryFilters {
  return { countryCode, region: '', city: '', category: '', text: '' };
}

export function updateDiscoveryFilter(filters: DiscoveryFilters, key: keyof DiscoveryFilters, value: string): DiscoveryFilters {
  if (key === 'countryCode') return { ...filters, countryCode: value, region: '', city: '' };
  if (key === 'region') return { ...filters, region: value, city: '' };
  return { ...filters, [key]: value };
}

export function isPublicEquipment(item: Pick<Equipment, 'isActive' | 'visibility' | 'moderationStatus'>): boolean {
  return item.isActive === true && item.visibility === 'visible' && item.moderationStatus === 'approved';
}

/** Home and Search intentionally use exactly the same inventory and intersection. */
export function selectPublicEquipment(items: readonly Equipment[], filters: DiscoveryFilters, markets?: readonly MarketAvailability[]): Equipment[] {
  const text = filters.text.trim().toLocaleLowerCase();
  return items.filter(item => isPublicEquipment(item)
    && isMarketEnabled(listingCountryCode(item) || '', markets)
    && listingMatchesLocation(item, filters)
    && (!filters.category || item.category === filters.category)
    && (!text || `${item.titleAr} ${item.titleEn} ${item.descriptionAr} ${item.descriptionEn}`.toLocaleLowerCase().includes(text)));
}