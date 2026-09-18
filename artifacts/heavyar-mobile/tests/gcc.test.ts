import { describe, expect, it } from 'vitest';
import { normalizeGccPhone, normalizePhoneForCountry } from '../constants/gcc';
import { approximateDisplayPrice } from '../services/currency';
import { buildRegistrationProfilePayload } from '../services/registrationPayload';
import { registrationErrorMessage } from '../services/registrationErrors';

describe('GCC mobile aliases', () => {
  it.each([
    ['SA', '0501234567', '+966501234567'],
    ['AE', '0501234567', '+971501234567'],
    ['KW', '55123456', '+96555123456'],
    ['QA', '55123456', '+97455123456'],
    ['BH', '33123456', '+97333123456'],
    ['OM', '91234567', '+96891234567'],
  ] as const)('normalizes %s local numbers to E.164', (country, input, expected) => {
    expect(normalizePhoneForCountry(input, country)).toBe(expected);
  });

  it('accepts supported international aliases without creating another identity', () => {
    expect(normalizeGccPhone('+971501234567')).toBe('+971501234567');
    expect(normalizeGccPhone('0097455123456')).toBe('+97455123456');
    expect(normalizeGccPhone('not-a-phone')).toBeNull();
    expect(normalizeGccPhone('501234567')).toBe('+966501234567');
    expect(normalizeGccPhone('50123456')).toBeNull();
  });

  it('sends only the register-profile allowlisted fields', () => {
    const payload = buildRegistrationProfilePayload({
      nameAr: 'Test', nameEn: 'Test', phone: '0501234567', countryCode: 'SA',
      region: 'riyadh', city: 'riyadh', customCity: '', role: 'customer',
    });
    expect(Object.keys(JSON.parse(JSON.stringify(payload))).sort()).toEqual([
      'city', 'countryCode', 'customCity', 'nameAr', 'nameEn',
      'phone', 'region', 'requestedRole', 'role', 'termsAccepted',
    ]);
    expect(payload).not.toHaveProperty('displayCurrency');
    expect(payload).not.toHaveProperty('nativeCurrency');
  });
  it('includes provider type and CR only for providers', () => {
    const provider = buildRegistrationProfilePayload({
      nameAr: 'Provider', nameEn: 'Provider', phone: '', countryCode: 'SA',
      region: 'riyadh', city: 'riyadh', customCity: '', role: 'provider',
      providerType: 'company', crNumber: '1234567890',
    });
    expect(provider).toMatchObject({ providerType: 'company', crNumber: '1234567890' });
    const customer = buildRegistrationProfilePayload({
      nameAr: 'Customer', nameEn: 'Customer', phone: '', countryCode: 'SA',
      region: 'riyadh', city: 'riyadh', customCity: '', role: 'customer',
      providerType: 'company', crNumber: '1234567890',
    });
    expect(customer).not.toHaveProperty('providerType');
    expect(customer).not.toHaveProperty('crNumber');
  });
});

describe('display currency safety', () => {
  it('keeps native money when no backend FX snapshot exists', () => {
    expect(approximateDisplayPrice(200, 'AED', 'SAR', undefined)).toEqual({
      amount: 200, currency: 'AED', isApproximate: false,
    });
  });

  it('marks backend-provided conversion as approximate only', () => {
    expect(approximateDisplayPrice(200, 'AED', 'SAR', {
      sourceCurrency: 'AED', displayCurrency: 'SAR', rate: 1.02,
      timestamp: '2026-01-01T00:00:00.000Z', source: 'backend',
    })).toMatchObject({ amount: 204, currency: 'SAR', isApproximate: true });
  });
});

describe('registration errors', () => {
  it.each(['INVALID_REGISTRATION_DETAILS', 'COUNTRY_DISABLED', 'PROVIDER_ONBOARDING_UNAVAILABLE',
    'INVALID_PHONE', 'PHONE_RESERVATION_UNAVAILABLE', 'PHONE_ALREADY_IN_USE',
    'REGISTRATION_RETRY_REQUIRED', 'NETWORK_UNAVAILABLE'] as const)('maps %s in both locales', code => {
    expect(registrationErrorMessage({ errorCode: code }, 'ar')).not.toBe('فشل إنشاء الحساب');
    expect(registrationErrorMessage({ errorCode: code }, 'en')).not.toBe('Unable to create account');
  });
  it.each(['auth/email-already-in-use', 'auth/weak-password', 'auth/invalid-email', 'auth/network-request-failed'] as const)('maps Firebase %s by language', code => {
    expect(registrationErrorMessage({ code }, 'ar')).not.toBe(registrationErrorMessage({ code }, 'en'));
  });
  it('keeps unknown and network failures safe', () => {
    expect(registrationErrorMessage({ code: 'unknown' }, 'en')).toBe('Unable to create account');
    expect(registrationErrorMessage(new TypeError('fetch failed'), 'en')).toBe('Unable to create account');
    expect(registrationErrorMessage({ code: 'auth/network-request-failed' }, 'en')).toContain('Service unavailable');
  });
});