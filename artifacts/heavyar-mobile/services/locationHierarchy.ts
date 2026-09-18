import { GCC_COUNTRIES, GccCountryCode } from '../constants/gcc';

export type LocationOption = { id: string; nameAr: string; nameEn: string };
export type MarketAvailability = { code: GccCountryCode; enabled: boolean; marketplaceAvailable?: boolean };

/** Returns only locations belonging to the selected country (never Saudi data for other markets). */
export function regionsForCountry(countryCode?: string, markets?: readonly MarketAvailability[]): LocationOption[] {
  const country = GCC_COUNTRIES.find(item => item.code === countryCode);
  if (!country || !isMarketEnabled(country.code, markets)) return [];
  return country.regions.map(({ id, nameAr, nameEn }) => ({ id, nameAr, nameEn }));
}

export function citiesForLocation(countryCode: string | undefined, regionId: string | undefined, markets?: readonly MarketAvailability[]): LocationOption[] {
  const country = GCC_COUNTRIES.find(item => item.code === countryCode);
  if (!country || !isMarketEnabled(country.code, markets)) return [];
  return country.regions.find(region => region.id === regionId)?.cities ?? [];
}

export function isMarketEnabled(countryCode: string, markets?: readonly MarketAvailability[]): boolean {
  // An omitted config is treated as the launch default; supplied config is authoritative.
  if (!markets) return countryCode === 'SA';
  return markets.some(market => market.code === countryCode && market.enabled === true && market.marketplaceAvailable !== false);
}

export type ListingLocation = { countryCode?: string; region?: string; city?: string; customCity?: string };
export type LocationFilter = { countryCode?: string; region?: string; city?: string };

export function listingMatchesLocation(listing: ListingLocation, filter: LocationFilter): boolean {
  if (filter.countryCode && listing.countryCode !== filter.countryCode) return false;
  if (filter.region && listing.region !== filter.region) return false;
  if (filter.city && listing.city !== filter.city && listing.customCity !== filter.city) return false;
  return true;
}

export function filterListingsByLocation<T extends ListingLocation>(listings: readonly T[], filter: LocationFilter): T[] {
  return listings.filter(listing => listingMatchesLocation(listing, filter));
}