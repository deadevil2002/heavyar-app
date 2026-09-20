import { describe, expect, it } from 'vitest';
import {
  buildListingPricing,
  currencyMinorDigits,
  decimalAmountToMinor,
  formatMinorCurrency,
  minorAmountToDecimal,
  pricingInputFromListing,
  resolveListingPricing,
} from '../services/listingPricing';

describe('listing pricing decimal conversion', () => {
  it.each([
    ['SAR', '120', 12000],
    ['AED', '12.50', 1250],
    ['QAR', '0.01', 1],
    ['KWD', '12.345', 12345],
    ['BHD', '0.001', 1],
    ['OMR', '1500.125', 1500125],
  ])('converts %s %s exactly to minor units', (currency, input, expected) => {
    expect(decimalAmountToMinor(input, currency)).toBe(expected);
    expect(decimalAmountToMinor(minorAmountToDecimal(expected, currency), currency)).toBe(expected);
  });

  it('supports Arabic digits and rejects ambiguous or imprecise values', () => {
    expect(decimalAmountToMinor('١٢٠٫٥٠', 'SAR')).toBe(12050);
    expect(decimalAmountToMinor('1,200', 'SAR')).toBeNull();
    expect(decimalAmountToMinor('1.001', 'SAR')).toBeNull();
    expect(decimalAmountToMinor('1e3', 'SAR')).toBeNull();
    expect(decimalAmountToMinor('0', 'SAR')).toBeNull();
    expect(currencyMinorDigits('KWD')).toBe(3);
    expect(currencyMinorDigits('SAR')).toBe(2);
  });
});

describe('listing pricing model', () => {
  it('accepts hourly-only, daily-only, and both rates', () => {
    expect(buildListingPricing({
      hourlyEnabled: true, hourlyAmount: '120', dailyEnabled: false, dailyAmount: '',
    }, 'SAR')).toMatchObject({ ok: true, pricing: { hourly: { enabled: true, amountMinor: 12000 }, daily: { enabled: false } } });

    expect(buildListingPricing({
      hourlyEnabled: false, hourlyAmount: '', dailyEnabled: true, dailyAmount: '1500',
    }, 'SAR')).toMatchObject({ ok: true, pricing: { hourly: { enabled: false }, daily: { enabled: true, amountMinor: 150000 } } });

    expect(buildListingPricing({
      hourlyEnabled: true, hourlyAmount: '12.345', dailyEnabled: true, dailyAmount: '100.500',
    }, 'KWD')).toMatchObject({ ok: true, pricing: { currency: 'KWD', hourly: { amountMinor: 12345 }, daily: { amountMinor: 100500 } } });

    expect(buildListingPricing({
      hourlyEnabled: false, hourlyAmount: '', dailyEnabled: false, dailyAmount: '',
    }, 'SAR')).toEqual({ ok: false, field: 'rates', reason: 'RATE_REQUIRED' });
  });

  it('adapts legacy daily rates without changing the source record', () => {
    const legacy = { pricePerDay: 1500.25, nativeCurrency: 'SAR' };
    expect(resolveListingPricing(legacy)).toEqual({
      currency: 'SAR',
      hourly: { enabled: false, amountMinor: 0 },
      daily: { enabled: true, amountMinor: 150025 },
    });
    expect(legacy).toEqual({ pricePerDay: 1500.25, nativeCurrency: 'SAR' });
    expect(pricingInputFromListing(legacy)).toEqual({
      hourlyEnabled: false,
      hourlyAmount: '',
      dailyEnabled: true,
      dailyAmount: '1500.25',
    });
  });

  it('uses the country currency for legacy listings without a currency field', () => {
    expect(resolveListingPricing({ pricePerDay: 10.125, countryCode: 'KW' })).toMatchObject({
      currency: 'KWD',
      daily: { enabled: true, amountMinor: 10125 },
    });
    expect(resolveListingPricing({ pricePerDay: 10.5, countryCode: 'AE' })).toMatchObject({
      currency: 'AED',
      daily: { enabled: true, amountMinor: 1050 },
    });
  });

  it('fails closed instead of reinterpreting malformed explicit V2 as legacy', () => {
    expect(resolveListingPricing({
      pricingModelVersion: 2,
      pricePerDay: 1500,
      nativeCurrency: 'SAR',
      pricing: {
        currency: 'SAR',
        hourly: { enabled: true, amountMinor: 0 },
        daily: { enabled: false, amountMinor: 0 },
      },
    })).toBeNull();
    expect(resolveListingPricing({
      pricingModelVersion: 2,
      pricePerDay: 1500,
      nativeCurrency: 'SAR',
    })).toBeNull();
  });

  it('uses authoritative v2 currency and minor values', () => {
    expect(resolveListingPricing({
      pricingModelVersion: 2,
      nativeCurrency: 'SAR',
      pricePerDay: 1,
      pricing: {
        currency: 'OMR',
        hourly: { enabled: true, amountMinor: 1250 },
        daily: { enabled: true, amountMinor: 20000 },
      },
    })).toEqual({
      currency: 'OMR',
      hourly: { enabled: true, amountMinor: 1250 },
      daily: { enabled: true, amountMinor: 20000 },
    });
  });

  it('formats Arabic SAR once without appending an English currency code', () => {
    const formatted = formatMinorCurrency(150000, 'SAR', 'ar');
    expect(formatted).not.toContain('SAR');
    expect(formatted.match(/ر\.س\./g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it('preserves exact safe-integer minor values in decimal conversion and formatting', () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    expect(minorAmountToDecimal(maximum, 'KWD')).toBe('9007199254740.991');
    const formatted = formatMinorCurrency(maximum, 'KWD', 'en');
    expect(formatted).toContain('9,007,199,254,740.991');
  });
});