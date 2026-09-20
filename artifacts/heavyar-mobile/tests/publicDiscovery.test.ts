import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { QueryClient } from '@tanstack/react-query';
import type { Equipment } from '../types';
import { defaultDiscoveryCountry, isPublicEquipment, PUBLIC_EQUIPMENT_QUERY_KEY, resetDiscoveryFilters, selectPublicEquipment, updateDiscoveryFilter } from '../services/publicDiscovery';
import { isMarketEnabled, listingCountryCode, type MarketAvailability } from '../services/locationHierarchy';

const markets: MarketAvailability[] = [
  { code: 'SA', enabled: true, marketplaceAvailable: true },
  { code: 'AE', enabled: false, marketplaceAvailable: false },
];
const eligible: Equipment = {
  id: 'eligible', ownerUid: 'owner', titleAr: 'حفارة الجبيل', titleEn: 'Jubail excavator',
  descriptionAr: 'حفارة للإيجار', descriptionEn: 'Heavy excavation equipment',
  category: 'excavators', region: 'eastern', city: 'jubail', customCity: '', district: '',
  location: { lat: 0, lng: 0 }, pricePerDay: 100, images: [], availability: false,
  isActive: true, visibility: 'visible', moderationStatus: 'approved', countryCode: 'SA', createdAt: '', updatedAt: '',
};
const inventory: Equipment[] = [
  eligible,
  { ...eligible, id: 'dammam', city: 'dammam', category: 'cranes', titleAr: 'رافعة', titleEn: 'Crane', descriptionEn: '' },
  { ...eligible, id: 'riyadh', region: 'riyadh', city: 'riyadh' },
  { ...eligible, id: 'dubai', countryCode: 'AE', region: 'ae_main', city: 'ae_dubai' },
  { ...eligible, id: 'pending', moderationStatus: 'pending_review' },
  { ...eligible, id: 'hidden', visibility: 'hidden' },
  { ...eligible, id: 'inactive', isActive: false },
];
const defaults = resetDiscoveryFilters('SA');
const ids = (items: Equipment[]) => items.map(item => item.id);
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('canonical mobile public discovery', () => {
  it('shows every eligible listing by default, even unavailable or without createdAt', () => {
    expect(ids(selectPublicEquipment(inventory, defaults, markets))).toEqual(['eligible', 'dammam', 'riyadh']);
    expect(selectPublicEquipment(Array.from({ length: 15 }, (_, i) => ({ ...eligible, id: String(i) })), defaults, markets)).toHaveLength(15);
  });

  it.each([
    { isActive: false }, { visibility: 'hidden' }, { visibility: 'archived' },
    { moderationStatus: 'pending_review' }, { moderationStatus: 'suspended' }, { moderationStatus: 'rejected' },
    { visibility: undefined }, { moderationStatus: undefined },
  ] as Partial<Equipment>[])('fails closed for non-public state %j', patch => {
    expect(isPublicEquipment({ ...eligible, ...patch })).toBe(false);
  });

  it('uses enabled profile country, otherwise Saudi Arabia (also for guests)', () => {
    expect(defaultDiscoveryCountry('AE', markets)).toBe('SA');
    expect(defaultDiscoveryCountry(undefined, markets)).toBe('SA');
    expect(defaultDiscoveryCountry('AE')).toBe('SA');
    const enabled = [...markets.slice(0, 1), { code: 'AE' as const, enabled: true }];
    expect(defaultDiscoveryCountry('AE', enabled)).toBe('AE');
    expect(defaultDiscoveryCountry('AE', [{ code: 'AE', enabled: true, marketplaceAvailable: false }])).toBe('SA');
    expect(isMarketEnabled('AE', markets)).toBe(false);
  });

  it('does not invent Saudi inventory if Admin explicitly disables Saudi Arabia', () => {
    expect(selectPublicEquipment(inventory, defaults, [{ code: 'SA', enabled: false }])).toEqual([]);
  });

  it('narrows by enabled country and never expands into a disabled market', () => {
    const filters = { ...defaults, countryCode: 'AE' };
    expect(selectPublicEquipment(inventory, filters, markets)).toEqual([]);
    expect(ids(selectPublicEquipment(inventory, filters, [{ code: 'AE', enabled: true }]))).toEqual(['dubai']);
  });

  it('includes authentic pre-GCC Saudi location shapes without inventing a country for unknown locations', () => {
    // Read-only production QA found these location pairs on three eligible
    // documents, all missing countryCode (2026-09-18). No listing content copied.
    const legacy = [
      { ...eligible, id: 'legacy-eastern', countryCode: undefined, region: 'eastern', city: 'jubail' },
      { ...eligible, id: 'legacy-najran', countryCode: undefined, region: 'najran_region', city: 'najran' },
      { ...eligible, id: 'legacy-riyadh', countryCode: undefined, region: 'riyadh_region', city: 'shaqra' },
    ];
    expect(ids(selectPublicEquipment(legacy, defaults, markets))).toEqual(legacy.map(item => item.id));
    expect(ids(selectPublicEquipment(legacy, { ...defaults, region: 'eastern', city: 'jubail' }, markets))).toEqual(['legacy-eastern']);
    expect(listingCountryCode({ region: 'unknown', city: 'unknown' })).toBeUndefined();
    expect(listingCountryCode({ countryCode: 'AE', region: 'eastern', city: 'jubail' })).toBe('AE');
    expect(listingCountryCode({ region: 'eastern', city: 'ae_dubai' })).toBeUndefined();
  });

  it('narrows by region', () => {
    expect(ids(selectPublicEquipment(inventory, { ...defaults, region: 'eastern' }, markets))).toEqual(['eligible', 'dammam']);
  });
  it('narrows by city, including explicit custom-city matches', () => {
    expect(ids(selectPublicEquipment(inventory, { ...defaults, city: 'jubail' }, markets))).toEqual(['eligible']);
    expect(selectPublicEquipment([{ ...eligible, city: 'other', customCity: 'jubail' }], { ...defaults, city: 'jubail' }, markets)).toHaveLength(1);
  });
  it('narrows by category', () => {
    expect(ids(selectPublicEquipment(inventory, { ...defaults, category: 'cranes' }, markets))).toEqual(['dammam']);
  });
  it('intersects all filters and trims bilingual text, without creating matches', () => {
    const filters = { ...defaults, region: 'eastern', city: 'jubail', category: 'excavators', text: ' EXCAVATOR ' };
    expect(ids(selectPublicEquipment(inventory, filters, markets))).toEqual(['eligible']);
    expect(selectPublicEquipment(inventory, { ...filters, text: 'حفارة' }, markets)).toHaveLength(1);
    expect(selectPublicEquipment(inventory, { ...filters, category: 'cranes' }, markets)).toEqual([]);
    expect(selectPublicEquipment(inventory, { ...filters, text: 'no match' }, markets)).toEqual([]);
  });
  it('clears dependent locations and reset restores all eligible default-market listings', () => {
    const filtered = { ...defaults, region: 'eastern', city: 'jubail', category: 'excavators', text: 'excavator' };
    expect(updateDiscoveryFilter(filtered, 'countryCode', 'AE')).toMatchObject({ countryCode: 'AE', region: '', city: '' });
    expect(updateDiscoveryFilter(filtered, 'region', 'riyadh')).toMatchObject({ region: 'riyadh', city: '' });
    expect(ids(selectPublicEquipment(inventory, resetDiscoveryFilters('SA'), markets))).toEqual(['eligible', 'dammam', 'riyadh']);
  });
  it('shares one updated public cache between Home and Search instead of mount-time snapshots', async () => {
    const cache = new QueryClient();
    cache.setQueryData(PUBLIC_EQUIPMENT_QUERY_KEY, []);
    await cache.fetchQuery({ queryKey: PUBLIC_EQUIPMENT_QUERY_KEY, queryFn: async () => [eligible], staleTime: 0 });
    const home = selectPublicEquipment(cache.getQueryData<Equipment[]>(PUBLIC_EQUIPMENT_QUERY_KEY)!, defaults, markets);
    const search = selectPublicEquipment(cache.getQueryData<Equipment[]>(PUBLIC_EQUIPMENT_QUERY_KEY)!, defaults, markets);
    expect(ids(home)).toEqual(['eligible']);
    expect(search).toEqual(home);
    cache.clear();
  });
  it('wires both actual screens to shared discovery and retains no ten-item Home truncation', () => {
    for (const path of ['../app/(tabs)/(home)/index.tsx', '../app/(tabs)/search/index.tsx']) {
      const screen = source(path);
      expect(screen).toContain('useDiscovery()');
      expect(screen).not.toContain('fetchEquipmentList');
      expect(screen).not.toContain('slice(0, 10)');
      expect(screen).toContain('discovery_load_error');
    }
    const context = source('../contexts/DiscoveryContext.tsx');
    expect(context).toContain('useFocusEffect');
    expect(context).not.toContain('refetchInterval');
    expect(context).toContain('useInfiniteQuery');
    expect(context).toContain('refreshIfStale');
    expect(context).toContain('MARKET_STALE_MS');
    expect(context).toContain('INVENTORY_STALE_MS');
    expect(source('../app/(tabs)/(home)/index.tsx')).toContain("router.push('/(tabs)/search?mode=equipment')");
    expect(source('../app/(tabs)/search/index.tsx')).toContain("router.setParams({ mode: 'equipment' })");
    expect(source('../app/(tabs)/search/index.tsx')).toContain("router.setParams({ mode: 'drivers' })");
  });
  it('uses bounded Worker discovery instead of direct public Firestore collection reads', () => {
    const service = source('../services/firestoreService.ts');
    expect(service).not.toContain('export async function fetchEquipmentList()');
    const searchService = source('../services/equipmentSearchService.ts');
    expect(searchService).toContain('/api/equipment/search');
    expect(searchService).toContain('limit = 20');
    expect(source('../app/(tabs)/search/index.tsx')).toContain('equipment-load-more');
    expect(source('../app/(tabs)/(home)/index.tsx')).toContain('home-equipment-load-more');
  });

  it('removes permanent Driver Search polling and keeps stale-on-focus plus manual refresh', () => {
    const driverSearch = source('../components/DriverSearchTab.tsx');
    expect(driverSearch).not.toContain('setInterval');
    expect(driverSearch).toContain('DRIVER_SEARCH_STALE_MS');
    expect(driverSearch).toContain('onRefresh');
  });
  it('keeps horizontal Home scrolling but hides web and native indicators', () => {
    const home = source('../app/(tabs)/(home)/index.tsx');
    const horizontalRows = home.match(/<ScrollView\b[^>]*\bhorizontal\b[^>]*>/g) || [];
    expect(horizontalRows).toHaveLength(2);
    for (const row of horizontalRows) {
      expect(row).toContain('showsHorizontalScrollIndicator={false}');
      expect(row).not.toContain('scrollEnabled={false}');
    }
    const categories = horizontalRows.find(row => row.includes('home-category-scroll'));
    expect(categories).toContain("flexDirection: isRTL ? 'row-reverse' : 'row'");
    expect(categories).toContain('styles.categoriesScroll');
  });
  it('wraps full country labels in both directions and never restores fake category counts', () => {
    const filters = source('../components/DiscoveryFilters.tsx');
    expect(filters).toContain("flexWrap: 'wrap'");
    expect(filters).not.toContain('ScrollView');
    expect(filters).toContain("maxWidth: '100%'");
    expect(filters).toContain("'row-reverse'");
    expect(filters).toContain("t('inactive')");
    expect(source('../components/CategoryCard.tsx')).not.toMatch(/category\.count|equipmentCount/);
  });
});