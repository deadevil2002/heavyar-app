import { type MarketConfig } from './authService';
import { GCC_COUNTRIES } from '../constants/gcc';
import { regionsForCountry, citiesForLocation, isMarketEnabled, type MarketAvailability } from './locationHierarchy';
import { mockCategories } from '../mocks/categories';

export type DriverSearchFilters = {
  q: string;
  countryCode: string;
  region: string;
  city: string;
  equipment: string;
  availability: '' | 'available' | 'busy' | 'offline';
};

export function defaultDriverCountry(markets?: readonly MarketAvailability[]): string {
  if (markets === undefined) return 'SA';
  return GCC_COUNTRIES.find(country => isMarketEnabled(country.code, markets))?.code ?? '';
}

export function resetDriverSearchFilters(markets?: readonly MarketAvailability[]): DriverSearchFilters {
  return {
    q: '',
    countryCode: defaultDriverCountry(markets),
    region: '',
    city: '',
    equipment: '',
    availability: '',
  };
}

export function canRequestDriver(
  isAuthenticated: boolean,
  userRole?: string,
  userStatus?: string,
  accountPurpose?: string,
): boolean {
  if (!isAuthenticated) return false;
  if (accountPurpose === 'store_review') return false;
  if (userRole !== 'customer' && userRole !== 'provider') return false;
  if (userStatus && userStatus !== 'active') return false;
  return true;
}

export function formatDriverLocation(
  countryCode: string | undefined,
  regionId: string | undefined,
  cityId: string | undefined,
  customCity: string | undefined,
  isRTL: boolean,
  markets?: MarketConfig[]
): string {
  if (!countryCode) return '';
  const country = GCC_COUNTRIES.find(c => c.code === countryCode);
  const countryName = country ? (isRTL ? country.nameAr : country.nameEn) : countryCode;

  const regions = regionsForCountry(countryCode, markets);
  const region = regions.find(r => r.id === regionId);
  const regionName = region ? (isRTL ? region.nameAr : region.nameEn) : regionId;

  let cityName = cityId;
  if (cityId && cityId !== 'custom') {
    const cities = citiesForLocation(countryCode, regionId || '', markets);
    const city = cities.find(c => c.id === cityId);
    if (city) cityName = isRTL ? city.nameAr : city.nameEn;
  } else if (customCity) {
    cityName = customCity;
  }

  return [regionName, cityName].filter(Boolean).join(' · ') || countryName;
}

export function formatEquipmentCapability(
  equipmentId: string,
  isRTL: boolean
): string {
  const cat = mockCategories.find(c => c.id === equipmentId || c.nameEn === equipmentId || c.nameAr === equipmentId);
  if (cat) return isRTL ? cat.nameAr : cat.nameEn;
  return equipmentId;
}

export function getRequestStatusLabel(status: string, isRTL: boolean): string {
  switch (status.toLowerCase()) {
    case 'open': return isRTL ? 'مفتوح' : 'Open';
    case 'accepted': return isRTL ? 'مقبول' : 'Accepted';
    case 'declined': return isRTL ? 'مرفوض' : 'Declined';
    case 'closed': return isRTL ? 'مغلق' : 'Closed';
    default: return status.toUpperCase();
  }
}

export function getAvailabilityLabel(status: string, isRTL: boolean): string {
  switch (status) {
    case 'available': return isRTL ? 'متاح' : 'Available';
    case 'busy': return isRTL ? 'مشغول' : 'Busy';
    case 'offline': return isRTL ? 'غير متصل' : 'Offline';
    default: return status;
  }
}
