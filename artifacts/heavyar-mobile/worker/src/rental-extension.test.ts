import { describe, expect, it } from 'bun:test';
import { quoteRentalExtension } from './rental-extension';

const hourly = {
  pricingModelVersion: 2,
  status: 'accepted',
  rentalMode: 'hourly',
  rateUnit: 'hourly',
  requestedStartAt: '2030-09-20T05:00:00.000Z',
  requestedEndAt: '2030-09-20T07:00:00.000Z',
  countryCode: 'SA',
  pricingSnapshot: { rateAmountMinor: 9_500, currency: 'SAR', currencyDecimals: 2 },
};

describe('Rental V2 extension quote', () => {
  it('prices only the extra hourly interval from immutable minor-unit terms', () => {
    expect(quoteRentalExtension(hourly, '2030-09-20T08:30:00.000Z', '2030-09-19T00:00:00.000Z')).toMatchObject({
      originalEndAt: '2030-09-20T07:00:00.000Z',
      proposedEndAt: '2030-09-20T08:30:00.000Z',
      additionalDurationMinutes: 90,
      additionalBillableUnits: 90,
      additionalBaseAmountMinor: 14_250,
      currency: 'SAR',
    });
  });

  it('prices end-exclusive daily extensions and supports three-decimal currencies', () => {
    const result = quoteRentalExtension({
      ...hourly,
      rentalMode: 'daily', rateUnit: 'daily', countryCode: 'KW',
      requestedStartAt: '2030-09-19T21:00:00.000Z', requestedEndAt: '2030-09-21T21:00:00.000Z',
      pricingSnapshot: { rateAmountMinor: 12_345, currency: 'KWD', currencyDecimals: 3 },
    }, '2030-09-23T21:00:00.000Z', '2030-09-19T00:00:00.000Z');
    expect(result).toMatchObject({ additionalDurationMinutes: 2_880, additionalBillableUnits: 2, additionalBaseAmountMinor: 24_690, currency: 'KWD' });
  });

  it('rejects legacy, open-ended, expired, non-later, excessive, and malformed-money requests', () => {
    expect(() => quoteRentalExtension({ ...hourly, pricingModelVersion: 1 }, '2030-09-20T08:00:00.000Z', '2030-09-19T00:00:00.000Z')).toThrow('EXTENSION_NOT_AVAILABLE');
    expect(() => quoteRentalExtension({ ...hourly, rentalMode: 'open_ended' }, '2030-09-20T08:00:00.000Z', '2030-09-19T00:00:00.000Z')).toThrow('EXTENSION_NOT_AVAILABLE');
    expect(() => quoteRentalExtension(hourly, '2030-09-20T08:00:00.000Z', '2030-09-20T07:00:00.000Z')).toThrow('EXTENSION_RENTAL_EXPIRED');
    expect(() => quoteRentalExtension(hourly, hourly.requestedEndAt, '2030-09-19T00:00:00.000Z')).toThrow('EXTENSION_INVALID_END');
    expect(() => quoteRentalExtension(hourly, '2032-09-20T08:00:00.000Z', '2030-09-19T00:00:00.000Z')).toThrow('EXTENSION_INVALID_END');
    expect(() => quoteRentalExtension({ ...hourly, pricingSnapshot: { ...hourly.pricingSnapshot, rateAmountMinor: 9.5 } }, '2030-09-20T08:00:00.000Z', '2030-09-19T00:00:00.000Z')).toThrow('EXTENSION_PRICING_UNAVAILABLE');
  });

  it('caps provider review at the original end and never changes the source request', () => {
    const source = structuredClone(hourly);
    const result = quoteRentalExtension(source, '2030-09-20T08:00:00.000Z', '2030-09-20T06:30:00.000Z');
    expect(result.expiresAt).toBe(hourly.requestedEndAt);
    expect(source).toEqual(hourly);
  });
});
