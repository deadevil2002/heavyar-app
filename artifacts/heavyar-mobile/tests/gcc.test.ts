import { describe, expect, it } from 'vitest';
import { normalizeGccPhone, normalizePhoneForCountry } from '../constants/gcc';
import { approximateDisplayPrice } from '../services/currency';
import { buildRegistrationProfilePayload } from '../services/registrationPayload';

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