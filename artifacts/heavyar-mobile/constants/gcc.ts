export type GccCountryCode = 'SA' | 'AE' | 'KW' | 'QA' | 'BH' | 'OM';

export type GccCountry = {
  code: GccCountryCode;
  dialCode: string;
  currency: string;
  nameAr: string;
  nameEn: string;
  regions: { id: string; nameAr: string; nameEn: string; cities: { id: string; nameAr: string; nameEn: string }[] }[];
};
import { saudiRegions } from '../mocks/saudiRegions';

const simpleRegions = (country: GccCountryCode, entries: [string, string, string][]) => [
  { id: `${country.toLowerCase()}_main`, nameAr: entries[0]?.[1] || 'المنطقة الرئيسية', nameEn: entries[0]?.[2] || 'Main region', cities: entries.map(([id, ar, en]) => ({ id: `${country.toLowerCase()}_${id}`, nameAr: ar, nameEn: en })) },
];

export const GCC_COUNTRIES: GccCountry[] = [
  { code: 'SA', dialCode: '+966', currency: 'SAR', nameAr: 'السعودية', nameEn: 'Saudi Arabia', regions: saudiRegions },
  { code: 'AE', dialCode: '+971', currency: 'AED', nameAr: 'الإمارات', nameEn: 'United Arab Emirates', regions: simpleRegions('AE', [['dubai', 'دبي', 'Dubai'], ['abudhabi', 'أبوظبي', 'Abu Dhabi'], ['sharjah', 'الشارقة', 'Sharjah']]) },
  { code: 'KW', dialCode: '+965', currency: 'KWD', nameAr: 'الكويت', nameEn: 'Kuwait', regions: simpleRegions('KW', [['kuwait', 'مدينة الكويت', 'Kuwait City'], ['hawalli', 'حولي', 'Hawalli'], ['ahmadi', 'الأحمدي', 'Ahmadi']]) },
  { code: 'QA', dialCode: '+974', currency: 'QAR', nameAr: 'قطر', nameEn: 'Qatar', regions: simpleRegions('QA', [['doha', 'الدوحة', 'Doha'], ['rayyan', 'الريان', 'Al Rayyan'], ['wakrah', 'الوكرة', 'Al Wakrah']]) },
  { code: 'BH', dialCode: '+973', currency: 'BHD', nameAr: 'البحرين', nameEn: 'Bahrain', regions: simpleRegions('BH', [['manama', 'المنامة', 'Manama'], ['muharraq', 'المحرق', 'Muharraq'], ['riffa', 'الرفاع', 'Riffa']]) },
  { code: 'OM', dialCode: '+968', currency: 'OMR', nameAr: 'عُمان', nameEn: 'Oman', regions: simpleRegions('OM', [['muscat', 'مسقط', 'Muscat'], ['salalah', 'صلالة', 'Salalah'], ['sohar', 'صحار', 'Sohar']]) },
];

// Preserve the existing Saudi region/city IDs and labels for old profiles.
export function countryFor(code: string | undefined): GccCountry {
  return GCC_COUNTRIES.find(country => country.code === code) || GCC_COUNTRIES[0];
}

const localMobilePatterns: Record<GccCountryCode, RegExp> = {
  SA: /^5\d{8}$/,
  AE: /^5\d{8}$/,
  KW: /^[569]\d{7}$/,
  QA: /^[3567]\d{7}$/,
  BH: /^[36]\d{7}$/,
  OM: /^[79]\d{7}$/,
};

export function normalizePhoneForCountry(value: string, countryCode: GccCountryCode = 'SA'): string | null {
  const country = countryFor(countryCode);
  const compact = value.trim().replace(/[^\d+]/g, '');
  const digits = compact.replace(/^\+/, '').replace(/^00/, '');
  const prefix = country.dialCode.slice(1);
  const national = digits.startsWith(prefix) ? digits.slice(prefix.length) : digits.startsWith('0') ? digits.slice(1) : digits;
  if (!localMobilePatterns[country.code].test(national)) return null;
  return `${country.dialCode}${national}`;
}

export function normalizeGccPhone(value: string): string | null {
  const compact = value.trim().replace(/[^\d+]/g, '');
  const hasInternationalPrefix = compact.startsWith('+') || compact.startsWith('00');
  const international = compact.replace(/^\+/, '').replace(/^00/, '');
  const direct = GCC_COUNTRIES.find(country => international.startsWith(country.dialCode.slice(1)));
  if (direct && hasInternationalPrefix) return normalizePhoneForCountry(compact, direct.code);
  // Saudi remains the backwards-compatible default for national aliases.
  if (!hasInternationalPrefix) return normalizePhoneForCountry(compact, 'SA');
  return null;
}

export function isGccPhone(value: string): boolean {
  return normalizeGccPhone(value) !== null;
}

export function defaultDisplayCurrency(countryCode: string | undefined): string {
  return countryFor(countryCode).currency;
}
