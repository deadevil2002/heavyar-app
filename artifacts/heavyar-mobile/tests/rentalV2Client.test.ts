import { describe, expect, it } from 'vitest';
import {
  buildRentalRequestPayload,
  calendarDayCount,
  currencyDecimals,
  marketDateTimeToUtc,
  marketDateToUtc,
  normalizeEstimate,
  prorateHourlyMinor,
} from '../services/rentalV2';
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
    for (const code of ['PAST_START_TIME', 'INVALID_RENTAL_INTERVAL', 'INVALID_START_TIME', 'RENTAL_UNIT_UNAVAILABLE', 'REQUEST_CHANGED']) {
      expect(safeErrorMessage({ errorCode: code }, 'en')).not.toContain(code);
      expect(safeErrorMessage({ errorCode: code }, 'ar')).not.toContain(code);
    }
    expect(safeErrorMessage({ errorCode: 'PRIVATE_INTERNAL_CODE' }, 'en')).toBe('Unable to complete this right now. Please try again shortly.');
  });
});