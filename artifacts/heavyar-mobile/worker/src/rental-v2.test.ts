import { describe, expect, it } from 'bun:test';
import {
  activeInterval, auditV2ProtectedMutation, buildFinalPaymentHandoff, calculateRental, estimateRental, intervalsOverlap,
  legacyMarketProjection, legacyPricingProjection, parseV2RequestInput, validateListingPricing,
  validateServerStart, v2TransitionAllowed,
} from './rental-v2';
import worker, { __test } from './index';

const both = validateListingPricing({
  currency: 'SAR',
  hourly: { enabled: true, amountMinor: 12_000 },
  daily: { enabled: true, amountMinor: 150_000 },
}, 'SAR');

function request(overrides: Record<string, unknown> = {}) {
  return parseV2RequestInput({
    pricingModelVersion: 2,
    equipmentId: 'eq_1',
    rentalMode: 'hourly',
    rateUnit: 'hourly',
    requestedStartAt: '2030-09-20T08:00:00.000Z',
    requestedEndAt: '2030-09-20T10:00:00.000Z',
    expectedRateAmountMinor: 12_000,
    ...overrides,
  });
}

describe('Rental V2 listing contract', () => {
  it('supports hourly only, daily only, and both', () => {
    expect(validateListingPricing({ currency: 'AED', hourly: { enabled: true, amountMinor: 1 }, daily: { enabled: false, amountMinor: 0 } }).hourly.enabled).toBe(true);
    expect(validateListingPricing({ currency: 'QAR', hourly: { enabled: false, amountMinor: 0 }, daily: { enabled: true, amountMinor: 1 } }).daily.enabled).toBe(true);
    expect(both.hourly.amountMinor).toBe(12_000);
  });

  it('rejects no enabled rate, noninteger enabled rate, and market currency mismatch', () => {
    expect(() => validateListingPricing({ currency: 'SAR', hourly: { enabled: false }, daily: { enabled: false } })).toThrow();
    expect(() => validateListingPricing({ currency: 'SAR', hourly: { enabled: true, amountMinor: 1.5 }, daily: { enabled: false } })).toThrow();
    expect(() => validateListingPricing({ currency: 'SAR', hourly: { enabled: true, amountMinor: 1 }, daily: { enabled: false } }, 'AED')).toThrow();
  });

  it('adapts a legacy daily listing in native three-decimal currency without rewriting it', () => {
    const listing = { nativeCurrency: 'KWD', nativePricePerDay: 12.345 };
    expect(legacyPricingProjection(listing)).toEqual({
      pricingModelVersion: 1,
      pricing: { currency: 'KWD', hourly: { enabled: false }, daily: { enabled: true, amountMinor: 12_345 } },
    });
    expect(listing).toEqual({ nativeCurrency: 'KWD', nativePricePerDay: 12.345 });
  });

  it('defaults only sparse legacy market metadata to Saudi Arabia and SAR', () => {
    const listing = { pricePerDay: 1500 };
    expect(legacyMarketProjection(listing)).toEqual({ countryCode: 'SA', nativeCurrency: 'SAR' });
    expect(legacyPricingProjection(listing)).toMatchObject({
      pricing: { currency: 'SAR', daily: { enabled: true, amountMinor: 150_000 } },
    });
    expect(listing).toEqual({ pricePerDay: 1500 });
  });
});

describe('Rental V2 input security', () => {
  it('rejects client totals, duration, actual times, and malformed UTC instants', () => {
    for (const field of ['total', 'duration', 'finalAmountMinor', 'actualStartAt']) {
      expect(() => request({ [field]: 1 })).toThrow('forbidden');
    }
    expect(() => request({ requestedStartAt: '2030-09-20T08:00:00+03:00' })).toThrow('ISO UTC');
  });

  it('enforces mode/rate/end combinations and compatibility alias agreement', () => {
    expect(() => request({ rentalMode: 'daily', rateUnit: 'hourly' })).toThrow();
    expect(() => request({ rentalMode: 'open_ended', requestedEndAt: '2030-09-20T10:00:00.000Z' })).toThrow();
    expect(() => request({ requestMode: 'daily' })).toThrow();
    expect(request({ requestMode: 'hourly' }).rentalMode).toBe('hourly');
  });
});

describe('Rental V2 calculations', () => {
  it('calculates same-day two hours with integer minor units', () => {
    const result = calculateRental({ mode: 'hourly', unit: 'hourly', rateAmountMinor: 12_000, startAt: '2030-09-20T08:00:00.000Z', endAt: '2030-09-20T10:00:00.000Z', countryCode: 'SA' });
    expect(result.baseAmountMinor).toBe(24_000);
    expect(result.duration.billableMinutes).toBe(120);
  });

  it('calculates cross-midnight and rounds elapsed time up to a minute then money half-up', () => {
    expect(calculateRental({ mode: 'hourly', unit: 'hourly', rateAmountMinor: 101, startAt: '2030-09-20T23:59:30.000Z', endAt: '2030-09-21T00:00:01.000Z', countryCode: 'SA' })).toMatchObject({
      baseAmountMinor: 2, duration: { billableMinutes: 1 },
    });
  });

  it('calculates fixed end-exclusive market-midnight daily ranges', () => {
    const one = calculateRental({ mode: 'daily', unit: 'daily', rateAmountMinor: 150_000, startAt: '2030-09-19T21:00:00.000Z', endAt: '2030-09-20T21:00:00.000Z', countryCode: 'SA' });
    const multiple = calculateRental({ mode: 'daily', unit: 'daily', rateAmountMinor: 150_000, startAt: '2030-09-19T21:00:00.000Z', endAt: '2030-09-22T21:00:00.000Z', countryCode: 'SA' });
    expect(one.baseAmountMinor).toBe(150_000);
    expect(multiple.baseAmountMinor).toBe(450_000);
    expect(() => calculateRental({ mode: 'daily', unit: 'daily', rateAmountMinor: 1, startAt: '2030-09-20T00:00:00.000Z', endAt: '2030-09-21T00:00:00.000Z', countryCode: 'SA' })).toThrow('market-midnight');
  });

  it('calculates open-ended hourly and ceil-24-hour daily usage', () => {
    expect(calculateRental({ mode: 'open_ended', unit: 'hourly', rateAmountMinor: 12_000, startAt: '2030-09-20T08:00:00.000Z', endAt: '2030-09-20T13:32:00.000Z', countryCode: 'SA' }).baseAmountMinor).toBe(66_400);
    expect(calculateRental({ mode: 'open_ended', unit: 'daily', rateAmountMinor: 150_000, startAt: '2030-09-20T08:00:00.000Z', endAt: '2030-09-21T08:00:01.000Z', countryCode: 'SA' }).baseAmountMinor).toBe(300_000);
  });

  it('returns a null open-ended estimate and detects rate changes/device-clock past starts', () => {
    const input = request({ rentalMode: 'open_ended', requestedEndAt: null });
    expect(estimateRental(input, both, 'SA', '2030-09-20T07:00:00.000Z')).toMatchObject({ baseAmountMinor: null, duration: { elapsedMinutes: null }, marketTimezone: 'Asia/Riyadh' });
    expect(() => estimateRental(request({ expectedRateAmountMinor: 1 }), both, 'SA', '2030-09-20T07:00:00.000Z')).toThrow('RATE_CHANGED');
    expect(() => estimateRental(request(), both, 'SA', '2030-09-20T09:00:00.000Z')).toThrow('past');
  });

  it('builds a deterministic minor-unit payment handoff without enabling settlement', () => {
    expect(buildFinalPaymentHandoff('rental-v2:r_123:final', {
      currency: 'SAR', baseAmountMinor: 24_000, platformFeeMinor: 2_400,
      taxAmountMinor: 3_600, gatewayFeeMinor: null,
      customerPayableMinor: 27_600, providerReceivableMinor: 21_600,
    })).toEqual({
      amountUnit: 'minor', currency: 'SAR', baseAmount: 24_000,
      platformCommission: 2_400, tax: 3_600, gatewayFee: null,
      customerPayable: 27_600, providerReceivable: 21_600,
      commercialSnapshotId: 'rental-v2:r_123:final', settlementEnabled: false,
    });
  });
});

describe('Rental V2 availability and lifecycle', () => {
  it('uses half-open timestamp overlap and permits adjacent hourly bookings', () => {
    const existing = { startAt: '2030-09-20T08:00:00.000Z', endAt: '2030-09-20T14:00:00.000Z' };
    expect(intervalsOverlap(existing, { startAt: '2030-09-20T14:00:00.000Z', endAt: '2030-09-20T20:00:00.000Z' })).toBe(false);
    expect(intervalsOverlap(existing, { startAt: '2030-09-20T12:00:00.000Z', endAt: '2030-09-20T16:00:00.000Z' })).toBe(true);
    expect(intervalsOverlap(existing, { startAt: '2030-09-20T15:00:00.000Z', endAt: null })).toBe(false);
  });

  it('keeps V2 pending soft and uses actual start for active open-ended intervals', () => {
    expect(activeInterval({ pricingModelVersion: 2, status: 'pending', requestedStartAt: '2030-09-20T08:00:00.000Z', requestedEndAt: null })).toBeNull();
    expect(activeInterval({ pricingModelVersion: 2, status: 'in_progress', rentalMode: 'open_ended', requestedStartAt: '2030-09-20T08:00:00.000Z', actualStartAt: '2030-09-20T09:00:00.000Z', requestedEndAt: null })).toEqual({ startAt: '2030-09-20T09:00:00.000Z', endAt: null });
  });

  it('conservatively adapts historical active rentals with missing dates', () => {
    expect(activeInterval({ status: 'in_progress', requestMode: 'open_ended', startedAt: '2029-01-02T03:04:05Z', endDate: '2029-01-03' })).toEqual({
      startAt: '2029-01-02T03:04:05.000Z',
      endAt: null,
    });
    expect(activeInterval({ status: 'accepted', requestMode: 'fixed_days' })).toEqual({
      startAt: '1970-01-01T00:00:00.000Z',
      endAt: null,
    });
    expect(intervalsOverlap(
      activeInterval({ status: 'in_progress', requestMode: 'open_ended', createdAt: '2029-01-01T00:00:00Z', endDate: '2029-01-02' })!,
      { startAt: '2099-01-01T00:00:00.000Z', endAt: '2099-01-02T00:00:00.000Z' },
    )).toBe(true);
  });

  it('requires provider start and counterparty completion confirmation', () => {
    const base = { providerUid: 'p', customerUid: 'c', status: 'accepted' };
    expect(v2TransitionAllowed(base, 'start', 'p')).toBe(true);
    expect(v2TransitionAllowed(base, 'start', 'c')).toBe(false);
    const completion = { ...base, status: 'completion_requested', completionRequestedBy: 'p' };
    expect(v2TransitionAllowed(completion, 'complete', 'p')).toBe(false);
    expect(v2TransitionAllowed(completion, 'complete', 'c')).toBe(true);
  });

  it('flags protected fields for direct-write security auditing', () => {
    expect(auditV2ProtectedMutation(
      { pricingModelVersion: 2, status: 'accepted', notes: '' },
      { pricingModelVersion: 2, status: 'completed', notes: 'safe edit', actualEndAt: '2030-01-01T00:00:00.000Z' },
    )).toEqual(['status', 'actualEndAt']);
  });

  it('bounds start timing and never permits a start after fixed end', () => {
    const fixed = { requestedStartAt: '2030-09-20T08:00:00.000Z', requestedEndAt: '2030-09-20T10:00:00.000Z', rentalMode: 'hourly' };
    expect(() => validateServerStart(fixed, '2030-09-20T08:30:00.000Z')).not.toThrow();
    expect(() => validateServerStart(fixed, '2030-09-20T07:59:59.999Z')).toThrow();
    expect(() => validateServerStart(fixed, '2030-09-20T10:00:00.000Z')).toThrow();
    expect(() => validateServerStart(fixed, '2030-09-19T06:00:00.000Z')).toThrow();
  });
});

describe('Rental V2 HTTP authority boundary', () => {
  const listing = {
    ownerUid: 'provider', countryCode: 'SA', nativeCurrency: 'SAR', category: 'other',
    pricingModelVersion: 2, pricing: both,
    isActive: true, visibility: 'visible', moderationStatus: 'approved',
    availability: { from: '2029-01-01' },
  };
  const env = { FIREBASE_PROJECT_ID: 'test' };
  const authenticated = { uid: 'customer', admin: false, emailVerified: true, testInjected: true as const };

  function fixture(extra: Record<string, any> = {}, actor: any = authenticated) {
    __test.setAuth(actor);
    __test.setFirestore((collection, id) => {
      if (extra[`${collection}/${id}`] !== undefined) return extra[`${collection}/${id}`];
      if (collection === 'equipment' && id === 'eq_1') return listing;
      if (collection === 'users' && id === actor.uid) return { uid: actor.uid, role: actor.accountRole || 'customer', emailVerified: true };
      if (collection === '__queries') return extra[`__queries/${id}`] || [];
      return undefined;
    });
  }

  it('returns the documented authoritative estimate envelope', async () => {
    fixture();
    const response = await worker.fetch(new Request('https://api.test/api/requests/estimate', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request(), requestedStartAt: '2099-09-20T08:00:00.000Z', requestedEndAt: '2099-09-20T10:00:00.000Z' }),
    }), env);
    const body: any = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, estimate: { calculationVersion: 2, baseAmountMinor: 24_000, currency: 'SAR', commercial: { baseAmountMinor: 24_000 } } });
    expect(typeof body.serverNow).toBe('string');
    __test.setAuth(); __test.setFirestore();
  });

  it('rejects V2 payment initialization before any provider settlement', async () => {
    fixture({ 'equipmentRequests/r_v2': { pricingModelVersion: 2, equipmentId: 'eq_1', customerUid: 'customer' } });
    const response = await worker.fetch(new Request('https://api.test/api/create-payment', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'r_v2' }),
    }), env);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, errorCode: 'V2_SETTLEMENT_DISABLED' });
    __test.setAuth(); __test.setFirestore();
  });

  it('estimates and creates against a sparse Saudi legacy listing without rewriting it', async () => {
    const sparse = {
      ownerUid: 'provider', category: 'other', pricePerDay: 1500,
      isActive: true, visibility: 'visible', moderationStatus: 'approved',
      availability: { from: '2029-01-01' },
    };
    fixture({ 'equipment/eq_1': sparse });
    const input = {
      pricingModelVersion: 2, equipmentId: 'eq_1', rentalMode: 'daily', rateUnit: 'daily',
      requestedStartAt: '2099-09-19T21:00:00.000Z', requestedEndAt: '2099-09-20T21:00:00.000Z',
      expectedRateAmountMinor: 150_000,
    };
    const estimateResponse = await worker.fetch(new Request('https://api.test/api/requests/estimate', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }), env);
    expect(estimateResponse.status).toBe(200);
    expect(await estimateResponse.json()).toMatchObject({
      estimate: { currency: 'SAR', marketTimezone: 'Asia/Riyadh', baseAmountMinor: 150_000 },
    });
    __test.captureCommits([]);
    const createResponse = await worker.fetch(new Request('https://api.test/api/requests', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }), env);
    expect(createResponse.status).toBe(201);
    expect(await createResponse.json()).toMatchObject({
      request: { countryCode: 'SA', currency: 'SAR', nativeCurrency: 'SAR', baseAmountMinor: 150_000 },
    });
    expect(sparse).toEqual({
      ownerUid: 'provider', category: 'other', pricePerDay: 1500,
      isActive: true, visibility: 'visible', moderationStatus: 'approved',
      availability: { from: '2029-01-01' },
    });
    __test.setAuth(); __test.setFirestore(); __test.captureCommits();
  });

  it('forbids provider and driver accounts from creating a V2 rental request', async () => {
    for (const role of ['provider', 'driver']) {
      fixture({}, { uid: `${role}2`, admin: false, emailVerified: true, testInjected: true, accountRole: role });
      const response = await worker.fetch(new Request('https://api.test/api/requests', {
        method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request(), requestedStartAt: '2099-09-20T08:00:00.000Z', requestedEndAt: '2099-09-20T10:00:00.000Z' }),
      }), env);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ errorCode: 'CUSTOMER_ACCOUNT_REQUIRED' });
    }
    __test.setAuth(); __test.setFirestore();
  });

  it('fails closed when the native active-interval query reaches 101 documents', async () => {
    fixture({
      '__queries/equipmentRequests': Array.from({ length: 101 }, (_, index) => ({
        id: `active-${index}`, equipmentId: 'eq_1', pricingModelVersion: 2, status: 'accepted',
        requestedStartAt: '2098-01-01T00:00:00.000Z', requestedEndAt: '2098-01-01T01:00:00.000Z',
      })),
    });
    const response = await worker.fetch(new Request('https://api.test/api/requests/estimate', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request(), requestedStartAt: '2099-09-20T08:00:00.000Z', requestedEndAt: '2099-09-20T10:00:00.000Z' }),
    }), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ errorCode: 'AVAILABILITY_CAP_EXHAUSTED' });
    __test.setAuth(); __test.setFirestore();
  });
});