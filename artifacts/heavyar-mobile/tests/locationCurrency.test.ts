import { describe, expect, it } from 'vitest';
import { citiesForLocation, filterListingsByLocation, regionsForCountry } from '../services/locationHierarchy';
import { formatNativeAmount, formatListingDailyPrice, listingCurrency } from '../services/currency';

describe('GCC location hierarchy', () => {
  it('keeps Saudi regions scoped to Saudi', () => {
    expect(regionsForCountry('SA', [{ code: 'SA', enabled: true }]).some(region => region.id === 'riyadh_region')).toBe(true);
    expect(regionsForCountry('AE', [{ code: 'AE', enabled: true }]).some(region => region.id === 'riyadh_region')).toBe(false);
  });
  it('does not expose disabled market locations and filters custom cities', () => {
    expect(regionsForCountry('AE', [{ code: 'AE', enabled: false }])).toEqual([]);
    const listings = [
      { countryCode: 'AE', region: 'ae_main', city: 'ae_dubai', customCity: '' },
      { countryCode: 'SA', region: 'riyadh_region', city: 'custom', customCity: 'Al Ula' },
    ];
    expect(filterListingsByLocation(listings, { countryCode: 'SA', city: 'Al Ula' })).toHaveLength(1);
    expect(citiesForLocation('AE', 'ae_main', [{ code: 'AE', enabled: true }])).toHaveLength(3);
  });
});

describe('native listing currency', () => {
  it.each([['SA', 'SAR'], ['AE', 'AED'], ['KW', 'KWD'], ['QA', 'QAR'], ['BH', 'BHD'], ['OM', 'OMR']])('uses %s native currency', (country, currency) => {
    expect(listingCurrency(undefined, country)).toBe(currency);
  });
  it('formats without conversion', () => {
    expect(formatNativeAmount(1250, 'AED')).toBe('1,250 AED');
    expect(formatListingDailyPrice(1250, { countryCode: 'AE' })).toBe('1,250 AED');
    expect(formatListingDailyPrice(1250, { countryCode: 'OM' })).toBe('1,250 OMR');
  });
});