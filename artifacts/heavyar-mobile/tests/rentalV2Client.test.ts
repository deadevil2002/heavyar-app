import { describe, expect, it } from 'vitest';
import {
  buildRentalRequestPayload,
  calendarDayCount,
  currencyDecimals,
  decodeCommercialSnapshot,
  decodeFinalRentalSnapshot,
  decodeRentalPricingSnapshot,
  decodeRentalSummary,
  liveRentalEstimateMinor,
  marketDateTimeToUtc,
  marketDateToUtc,
  multiplyDailyMinor,
  normalizeEstimate,
  prorateHourlyMinor,
  rentalRequestPricingState,
} from '../services/rentalV2';
import type { RentalSummary } from '../types';
import { safeErrorMessage } from '../services/errorMessages';

describe('rental V2 client contract', () => {
  const valid = {
    equipmentId: 'eq_1',
    pricingModelVersion: 2 as const,
    rentalMode: 'hourly' as const,
    rateUnit: 'hourly' as const,
    expectedRateAmountMinor: 12_000,
    requestedStartAt: '2026-09-20T05:00:00.000Z',
    requestedEndAt: '2026-09-20T07:00:00.000Z',
    notes: '  Gate B  ',
  };

  it('serializes only the server contract and never sends client totals', () => {
    const payload = buildRentalRequestPayload({
      ...valid,
      ...({ baseAmountMinor: 1, finalAmountMinor: 1, durationMinutes: 1 } as Record<string, unknown>),
    });
    expect(payload).toEqual({ ...valid, notes: 'Gate B' });
    expect(payload).not.toHaveProperty('baseAmountMinor');
    expect(payload).not.toHaveProperty('finalAmountMinor');
    expect(payload).not.toHaveProperty('durationMinutes');
  });

  it('converts GCC market clock fields without device-timezone ambiguity', () => {
    expect(marketDateTimeToUtc('2026-09-20', '08:00', 180)).toBe('2026-09-20T05:00:00.000Z');
    expect(marketDateToUtc('2026-09-23', 180)).toBe('2026-09-22T21:00:00.000Z');
    expect(calendarDayCount('2026-09-20', '2026-09-23')).toBe(3);
  });

  it('uses correct currency precision and integer half-up minute proration', () => {
    expect(currencyDecimals('SAR')).toBe(2);
    expect(currencyDecimals('KWD')).toBe(3);
    expect(prorateHourlyMinor(12_000, 1)).toBe(200);
    expect(prorateHourlyMinor(1, 30)).toBe(1);
    expect(prorateHourlyMinor(950, 60)).toBe(950);
  });

  it.each([
    9.5,
    NaN,
    Infinity,
    -1,
    Number.MAX_SAFE_INTEGER + 1,
    '950',
    null,
  ])('rejects invalid hourly minor-unit rate %p before BigInt', (rate) => {
    expect(() => prorateHourlyMinor(rate as number, 60)).toThrow('INVALID_RENTAL_MONEY_INPUT');
  });

  it('accepts the safe-integer boundary and rejects overflow without lossy conversion', () => {
    expect(prorateHourlyMinor(Number.MAX_SAFE_INTEGER, 60)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => multiplyDailyMinor(Number.MAX_SAFE_INTEGER, 2)).toThrow('RENTAL_MONEY_OVERFLOW');
    expect(() => prorateHourlyMinor(950, 1.5)).toThrow('INVALID_RENTAL_MONEY_INPUT');
  });

  const pricingSnapshot = (currency = 'SAR', rateAmountMinor: unknown = 950, rateUnit: 'hourly' | 'daily' = 'hourly') => ({
    calculationVersion: 2,
    rateUnit,
    rateAmountMinor,
    currency,
    currencyDecimals: currencyDecimals(currency),
    marketTimezone: currency === 'SAR' ? 'Asia/Riyadh' : 'Asia/Kuwait',
  });

  const commercialSnapshot = (currency = 'SAR') => ({
    ruleVersion: 'rule-1', ruleStatus: 'active', mode: 'percentage', percentageBps: 1000,
    fixedAmountMinor: 0, minimumFeeMinor: 0, maximumFeeMinor: null, payer: 'provider', customerShareBps: 0,
    scope: { countryCode: null, categoryId: null, providerUid: null }, baseAmountMinor: 950,
    platformFeeMinor: 95, customerFeeMinor: 0, providerFeeMinor: 95, providerReceivableMinor: 855,
    customerPayableMinor: 950, taxAmountMinor: null, gatewayFeeMinor: null, currency,
    countryCode: 'SA', categoryId: 'other', providerUid: 'provider-1', calculatedAt: '2026-09-20T05:00:00.000Z',
  });

  const validSummary = (snapshot: unknown = pricingSnapshot()): unknown => ({
    requestId: 'request-1', pricingModelVersion: 2, status: 'in_progress', rentalMode: 'hourly',
    requestedStartAt: '2026-09-20T05:00:00.000Z', requestedEndAt: '2026-09-20T07:00:00.000Z',
    actualStartAt: '2026-09-20T05:00:00.000Z', actualEndAt: null, pricingSnapshot: snapshot,
    duration: { elapsedMinutes: 60, billableMinutes: 60, billableUnits: 1, unit: 'minute' },
    currentEstimate: { asOf: '2026-09-20T06:00:00.000Z', baseAmountMinor: 950, commercial: commercialSnapshot() },
    final: null, serverNow: '2026-09-20T06:00:00.000Z',
  });

  it('strictly decodes valid V2 money for two- and three-decimal GCC currencies', () => {
    expect(decodeRentalPricingSnapshot(pricingSnapshot('SAR'))?.rateAmountMinor).toBe(950);
    for (const currency of ['KWD', 'BHD', 'OMR']) {
      expect(decodeRentalPricingSnapshot(pricingSnapshot(currency, 9_500))?.currencyDecimals).toBe(3);
    }
    expect(decodeCommercialSnapshot(commercialSnapshot())).not.toBeNull();
    expect(decodeFinalRentalSnapshot({
      actualStartAt: '2026-09-20T05:00:00.000Z', actualEndAt: '2026-09-20T06:00:00.000Z',
      durationMinutes: 60, billableMinutes: 60, amountMinor: 950,
      breakdown: { baseAmountMinor: 950, platformCommissionMinor: 95, taxAmountMinor: null },
    })?.amountMinor).toBe(950);
  });

  it.each([9.5, NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1, '950', null])(
    'rejects malformed pricing snapshot rate %p without unit reinterpretation',
    (rate) => expect(decodeRentalPricingSnapshot(pricingSnapshot('SAR', rate))).toBeNull(),
  );

  it('rejects missing and malformed RentalSummary structures', () => {
    expect(decodeRentalPricingSnapshot(undefined)).toBeNull();
    expect(decodeRentalSummary(null)).toBeNull();
    expect(decodeRentalSummary({ ...validSummary() as object, duration: null })).toBeNull();
    expect(decodeRentalSummary(validSummary(pricingSnapshot('SAR', 9.5)))).toBeNull();
    expect(decodeRentalSummary(validSummary())).not.toBeNull();
  });

  it('returns no live estimate for invalid hourly or daily rates', () => {
    const valid = decodeRentalSummary(validSummary())!;
    const invalidHourly = { ...valid, pricingSnapshot: { ...valid.pricingSnapshot, rateAmountMinor: 9.5 } } as RentalSummary;
    const invalidDaily = {
      ...valid,
      rentalMode: 'daily',
      pricingSnapshot: { ...valid.pricingSnapshot, rateUnit: 'daily', rateAmountMinor: 9.5 },
    } as RentalSummary;
    expect(liveRentalEstimateMinor(invalidHourly, 60)).toBeNull();
    expect(liveRentalEstimateMinor(invalidDaily, 1440)).toBeNull();
    expect(liveRentalEstimateMinor(valid, 60)).toBe(950);
  });

  it('keeps legacy V1 separate and marks malformed V2 pricing unavailable', () => {
    expect(rentalRequestPricingState({ pricingModelVersion: undefined, pricingSnapshot: undefined })).toEqual({ kind: 'legacy' });
    expect(rentalRequestPricingState({ pricingModelVersion: 2, pricingSnapshot: undefined })).toEqual({ kind: 'unavailable' });
    expect(rentalRequestPricingState({
      pricingModelVersion: 2,
      pricingSnapshot: pricingSnapshot('SAR', 9.5) as never,
    })).toEqual({ kind: 'unavailable' });
    expect(rentalRequestPricingState({
      pricingModelVersion: 2,
      pricingSnapshot: pricingSnapshot() as never,
    }).kind).toBe('v2');
  });

  it('rejects zero durations and open-ended requests with an end', () => {
    expect(() => buildRentalRequestPayload({ ...valid, requestedEndAt: valid.requestedStartAt })).toThrow('INVALID_TIME_RANGE');
    expect(() => buildRentalRequestPayload({ ...valid, rentalMode: 'open_ended', requestedEndAt: valid.requestedEndAt })).toThrow('INVALID_TIME_RANGE');
  });

  it('keeps daily and open-ended mode payloads exact', () => {
    expect(buildRentalRequestPayload({
      ...valid,
      rentalMode: 'daily',
      rateUnit: 'daily',
      expectedRateAmountMinor: 150_000,
      requestedStartAt: '2026-09-19T21:00:00.000Z',
      requestedEndAt: '2026-09-22T21:00:00.000Z',
    })).toMatchObject({
      rentalMode: 'daily',
      rateUnit: 'daily',
      expectedRateAmountMinor: 150_000,
    });
    expect(buildRentalRequestPayload({
      ...valid,
      rentalMode: 'open_ended',
      requestedEndAt: null,
    })).toMatchObject({
      rentalMode: 'open_ended',
      rateUnit: 'hourly',
      requestedEndAt: null,
    });
  });

  it('normalizes the canonical estimate envelope and preserves serverNow', () => {
    const estimate = {
      pricingModelVersion: 2 as const,
      calculationVersion: 2 as const,
      rentalMode: 'hourly' as const,
      rateUnit: 'hourly' as const,
      rateAmountMinor: 12_000,
      currency: 'SAR',
      currencyDecimals: 2,
      marketTimezone: 'Asia/Riyadh',
      requestedStartAt: valid.requestedStartAt,
      requestedEndAt: valid.requestedEndAt,
      duration: { elapsedMinutes: 120, billableMinutes: 120, billableUnits: 120, unit: 'minute' as const },
      baseAmountMinor: 24_000,
      commercial: null,
      estimated: true as const,
    };
    expect(normalizeEstimate({ estimate, serverNow: '2026-09-18T12:00:00.000Z' })).toEqual({
      ...estimate,
      serverNow: '2026-09-18T12:00:00.000Z',
    });
  });

  it('maps canonical backend errors to professional localized text', () => {
    for (const code of ['PAST_START_TIME', 'INVALID_RENTAL_INTERVAL', 'INVALID_START_TIME', 'RENTAL_UNIT_UNAVAILABLE', 'REQUEST_CHANGED', 'REGULATORY_CAPABILITY_REQUIRED', 'DOCUMENT_EXPIRED', 'TRANSITION_NOT_ALLOWED']) {
      expect(safeErrorMessage({ errorCode: code }, 'en')).not.toContain(code);
      expect(safeErrorMessage({ errorCode: code }, 'ar')).not.toContain(code);
    }
    expect(safeErrorMessage({ errorCode: 'PRIVATE_INTERNAL_CODE' }, 'en')).toBe('Unable to complete this right now. Please try again shortly.');
  });
});
