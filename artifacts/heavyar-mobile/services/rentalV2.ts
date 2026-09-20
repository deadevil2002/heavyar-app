import type {
  Equipment,
  ListingPricingV2,
  RentalEstimate,
  RentalRateUnit,
} from '@/types';
import { currencyMinorDigits, formatMinorCurrency, resolveListingPricing } from './listingPricing';

export type RentalModeV2 = 'hourly' | 'daily' | 'open_ended';

export interface RentalRequestInput {
  equipmentId: string;
  pricingModelVersion: 2;
  rentalMode: RentalModeV2;
  rateUnit: RentalRateUnit;
  expectedRateAmountMinor: number;
  requestedStartAt: string;
  requestedEndAt: string | null;
  notes?: string;
}

const COUNTRY_TIMEZONE: Record<string, { timezone: string; offsetMinutes: number }> = {
  SA: { timezone: 'Asia/Riyadh', offsetMinutes: 180 },
  AE: { timezone: 'Asia/Dubai', offsetMinutes: 240 },
  KW: { timezone: 'Asia/Kuwait', offsetMinutes: 180 },
  QA: { timezone: 'Asia/Qatar', offsetMinutes: 180 },
  BH: { timezone: 'Asia/Bahrain', offsetMinutes: 180 },
  OM: { timezone: 'Asia/Muscat', offsetMinutes: 240 },
};

export function currencyDecimals(currency: string): number {
  return currencyMinorDigits(currency);
}

export function formatMinorAmount(amountMinor: number, currency: string, language: 'ar' | 'en'): string {
  return formatMinorCurrency(amountMinor, currency, language);
}

export function listingPricing(equipment: Equipment): ListingPricingV2 {
  return resolveListingPricing(equipment) || {
    currency: (equipment.nativeCurrency || 'SAR').toUpperCase(),
    hourly: { enabled: false, amountMinor: 0 },
    daily: { enabled: false, amountMinor: 0 },
  };
}

export function marketClock(equipment: Pick<Equipment, 'countryCode' | 'marketTimezone'>) {
  const fallback = COUNTRY_TIMEZONE[equipment.countryCode || 'SA'] || COUNTRY_TIMEZONE.SA;
  return { timezone: equipment.marketTimezone || fallback.timezone, offsetMinutes: fallback.offsetMinutes };
}

function parseDate(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('INVALID_RENTAL_DATE');
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Converts an unambiguous market calendar date/time to UTC without using device timezone. GCC markets have no DST. */
export function marketDateTimeToUtc(date: string, time: string, offsetMinutes: number): string {
  const [year, month, day] = parseDate(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!timeMatch) throw new Error('INVALID_RENTAL_TIME');
  return new Date(Date.UTC(year, month - 1, day, Number(timeMatch[1]), Number(timeMatch[2])) - offsetMinutes * 60_000).toISOString();
}

export function marketDateToUtc(date: string, offsetMinutes: number): string {
  return marketDateTimeToUtc(date, '00:00', offsetMinutes);
}

export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function calendarDayCount(startDate: string, endDateExclusive: string): number {
  const [sy, sm, sd] = parseDate(startDate);
  const [ey, em, ed] = parseDate(endDateExclusive);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
}

export function buildRentalRequestPayload(input: RentalRequestInput): RentalRequestInput {
  if (!input.equipmentId || input.pricingModelVersion !== 2) throw new Error('INVALID_RENTAL_REQUEST');
  if (!['hourly', 'daily', 'open_ended'].includes(input.rentalMode)) throw new Error('UNSUPPORTED_RENTAL_MODE');
  if (!['hourly', 'daily'].includes(input.rateUnit)) throw new Error('UNSUPPORTED_RATE_UNIT');
  if (!Number.isSafeInteger(input.expectedRateAmountMinor) || input.expectedRateAmountMinor <= 0) throw new Error('INVALID_RENTAL_RATE');
  if (!Number.isFinite(Date.parse(input.requestedStartAt))) throw new Error('INVALID_TIME_RANGE');
  if (input.rentalMode === 'open_ended') {
    if (input.requestedEndAt !== null) throw new Error('INVALID_TIME_RANGE');
  } else if (!input.requestedEndAt || Date.parse(input.requestedEndAt) <= Date.parse(input.requestedStartAt)) {
    throw new Error('INVALID_TIME_RANGE');
  }
  const notes = input.notes?.trim();
  return {
    equipmentId: input.equipmentId,
    pricingModelVersion: 2,
    rentalMode: input.rentalMode,
    rateUnit: input.rateUnit,
    expectedRateAmountMinor: input.expectedRateAmountMinor,
    requestedStartAt: new Date(input.requestedStartAt).toISOString(),
    requestedEndAt: input.requestedEndAt ? new Date(input.requestedEndAt).toISOString() : null,
    ...(notes ? { notes } : {}),
  };
}

export function normalizeEstimate(raw: RentalEstimate | { estimate: RentalEstimate; serverNow?: string }): RentalEstimate {
  if ('estimate' in raw) return { ...raw.estimate, serverNow: raw.serverNow };
  return raw;
}

export function prorateHourlyMinor(rateAmountMinor: number, billableMinutes: number): number {
  const numerator = BigInt(rateAmountMinor) * BigInt(billableMinutes);
  return Number((numerator + 30n) / 60n);
}