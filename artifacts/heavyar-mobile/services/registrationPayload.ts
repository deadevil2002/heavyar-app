import { GccCountryCode, normalizePhoneForCountry } from '../constants/gcc';

export type RegistrationProfileInput = {
  nameAr: string; nameEn: string; phone: string; countryCode?: GccCountryCode;
  region: string; city: string; customCity: string; role: 'customer' | 'provider' | 'driver'; crNumber?: string;
};

export function buildRegistrationProfilePayload(profileData: RegistrationProfileInput) {
  return {
    nameAr: profileData.nameAr,
    nameEn: profileData.nameEn,
    phone: profileData.phone ? normalizePhoneForCountry(profileData.phone, profileData.countryCode || 'SA') || profileData.phone : '',
    countryCode: profileData.countryCode || 'SA',
    region: profileData.region,
    city: profileData.city,
    customCity: profileData.customCity,
    role: profileData.role,
    requestedRole: profileData.role,
    crNumber: profileData.crNumber,
    termsAccepted: true,
  };
}