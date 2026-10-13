import { calculateRental } from './rental-v2';

export const RENTAL_EXTENSION_PROVIDER_REVIEW_TTL_MS = 72 * 60 * 60 * 1000;
export const RENTAL_EXTENSION_MAX_ADDITIONAL_MS = 365 * 24 * 60 * 60 * 1000;

export type RentalExtensionQuote = {
  originalEndAt: string;
  proposedEndAt: string;
  additionalDurationMinutes: number;
  additionalBillableUnits: number;
  additionalBaseAmountMinor: number;
  currency: string;
  currencyDecimals: number;
  rateUnit: 'hourly' | 'daily';
  expiresAt: string;
};

const instant = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(code);
  return new Date(value).toISOString();
};

const positiveSafeInteger = (value: unknown, code: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error(code);
  return value;
};

/**
 * Prices only the additional interval from the request's immutable V2 rate.
 * The original request end and commercial snapshot are never rewritten here.
 */
export function quoteRentalExtension(request: Record<string, any>, proposedEndValue: unknown, nowValue: string): RentalExtensionQuote {
  if (request.pricingModelVersion !== 2 || !['accepted', 'in_progress'].includes(String(request.status))) {
    throw new Error('EXTENSION_NOT_AVAILABLE');
  }
  if (!['hourly', 'daily'].includes(String(request.rentalMode)) || request.rateUnit !== request.rentalMode) {
    throw new Error('EXTENSION_NOT_AVAILABLE');
  }
  const startAt = instant(request.requestedStartAt, 'EXTENSION_PRICING_UNAVAILABLE');
  const originalEndAt = instant(request.requestedEndAt, 'EXTENSION_NOT_AVAILABLE');
  const proposedEndAt = instant(proposedEndValue, 'EXTENSION_INVALID_END');
  const now = Date.parse(instant(nowValue, 'EXTENSION_INVALID_END'));
  const originalEnd = Date.parse(originalEndAt);
  const proposedEnd = Date.parse(proposedEndAt);
  if (originalEnd <= now) throw new Error('EXTENSION_RENTAL_EXPIRED');
  if (proposedEnd <= originalEnd || proposedEnd - originalEnd > RENTAL_EXTENSION_MAX_ADDITIONAL_MS) {
    throw new Error('EXTENSION_INVALID_END');
  }
  const pricing = request.pricingSnapshot;
  const rateAmountMinor = positiveSafeInteger(pricing?.rateAmountMinor, 'EXTENSION_PRICING_UNAVAILABLE');
  const currency = typeof pricing?.currency === 'string' && /^[A-Z]{3}$/.test(pricing.currency)
    ? pricing.currency
    : '';
  const currencyDecimals = pricing?.currencyDecimals;
  if (!currency || !Number.isSafeInteger(currencyDecimals) || currencyDecimals < 0 || currencyDecimals > 3) {
    throw new Error('EXTENSION_PRICING_UNAVAILABLE');
  }
  let original;
  let extended;
  try {
    original = calculateRental({
      mode: request.rentalMode,
      unit: request.rateUnit,
      rateAmountMinor,
      startAt,
      endAt: originalEndAt,
      countryCode: String(request.countryCode || ''),
    });
    extended = calculateRental({
      mode: request.rentalMode,
      unit: request.rateUnit,
      rateAmountMinor,
      startAt,
      endAt: proposedEndAt,
      countryCode: String(request.countryCode || ''),
    });
  } catch {
    throw new Error('EXTENSION_INVALID_END');
  }
  const originalBase = original.baseAmountMinor;
  const extendedBase = extended.baseAmountMinor;
  // Hourly money is billed by integer minutes, while daily money is billed by
  // integer market-calendar days. Never expose fractional billing units.
  const originalUnits = request.rateUnit === 'hourly' ? original.duration.billableMinutes : original.duration.billableUnits;
  const extendedUnits = request.rateUnit === 'hourly' ? extended.duration.billableMinutes : extended.duration.billableUnits;
  if (!Number.isSafeInteger(originalBase) || !Number.isSafeInteger(extendedBase)
      || !Number.isSafeInteger(originalUnits) || !Number.isSafeInteger(extendedUnits)) {
    throw new Error('EXTENSION_PRICING_UNAVAILABLE');
  }
  const additionalBaseAmountMinor = Number(extendedBase) - Number(originalBase);
  const additionalBillableUnits = Number(extendedUnits) - Number(originalUnits);
  const additionalDurationMinutes = Math.ceil((proposedEnd - originalEnd) / 60_000);
  if (!Number.isSafeInteger(additionalBaseAmountMinor) || additionalBaseAmountMinor <= 0
      || !Number.isSafeInteger(additionalBillableUnits) || additionalBillableUnits <= 0
      || !Number.isSafeInteger(additionalDurationMinutes) || additionalDurationMinutes <= 0) {
    throw new Error('EXTENSION_PRICING_UNAVAILABLE');
  }
  const expiresAt = new Date(Math.min(originalEnd, now + RENTAL_EXTENSION_PROVIDER_REVIEW_TTL_MS)).toISOString();
  return {
    originalEndAt,
    proposedEndAt,
    additionalDurationMinutes,
    additionalBillableUnits,
    additionalBaseAmountMinor,
    currency,
    currencyDecimals,
    rateUnit: request.rateUnit,
    expiresAt,
  };
}
