import type {
  CommercialSnapshot,
  Equipment,
  EquipmentRequest,
  ListingPricingV2,
  RentalEstimate,
  RentalPricingSnapshot,
  RentalRateUnit,
  RentalSummary,
  PreciseLocation,
} from '@/types';
import { currencyMinorDigits, formatMinorCurrency, resolveListingPricing } from './listingPricing';
import { decodePreciseLocation } from './location';

export type RentalModeV2 = 'hourly' | 'daily' | 'open_ended';
export type NewRentalModeV2 = RentalRateUnit;

export interface RentalRequestInput {
  equipmentId: string;
  pricingModelVersion: 2;
  rentalMode: NewRentalModeV2;
  rateUnit: RentalRateUnit;
  expectedRateAmountMinor: number;
  requestedStartAt: string;
  requestedEndAt: string;
  notes?: string;
  workSiteLocation?: PreciseLocation;
}

type UnknownRecord = Record<string, unknown>;

export type AvailabilityCalendarState = 'available' | 'booked' | 'in_rental' | 'owner_blocked' | 'temporarily_unavailable' | 'outside_availability';
export type AvailabilityCalendarRange = { startAt: string; endAt: string | null; state: 'booked' | 'in_rental' };
export type ListingAvailabilityPolicy = {
  from: string;
  until?: string;
  blocked: { from: string; until?: string }[];
  temporarilyUnavailable: boolean;
};
export type ListingAvailabilityCalendar = {
  listingId: string;
  serverNow: string;
  window: { from: string; until: string };
  availability: ListingAvailabilityPolicy;
  activeRentals: AvailabilityCalendarRange[];
};

export type RentalMoneyDiagnosticContext =
  | 'firestore_request'
  | 'rental_summary'
  | 'request_detail'
  | 'request_card';

export type RentalMoneyDiagnostic = {
  context: RentalMoneyDiagnosticContext;
  code: 'INVALID_PRICING_SNAPSHOT' | 'INVALID_FINAL_RENTAL_SNAPSHOT' | 'INVALID_COMMERCIAL_SNAPSHOT' | 'INVALID_RENTAL_SUMMARY';
  fields: string[];
  requestId?: string;
};

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(value) && value >= minimum;
}

function optionalSafeInteger(value: unknown, minimum = 0): value is number | undefined {
  return value === undefined || safeInteger(value, minimum);
}

function nullableSafeInteger(value: unknown, minimum = 0): value is number | null {
  return value === null || safeInteger(value, minimum);
}

function nullableFiniteNumber(value: unknown, minimum = 0): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= minimum);
}

function isoString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function calendarDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function decodeAvailabilityDateRange(raw: unknown): { from: string; until?: string } | null {
  const value = record(raw);
  if (!value || !calendarDateString(value.from) || (value.until !== undefined && !calendarDateString(value.until))) return null;
  if (value.until && value.until < value.from) return null;
  return { from: value.from, ...(value.until ? { until: value.until } : {}) };
}

export function decodeListingAvailabilityCalendar(raw: unknown, expectedListingId?: string): ListingAvailabilityCalendar {
  const value = record(raw);
  const availability = record(value?.availability);
  const window = decodeAvailabilityDateRange(value?.window);
  if (!value || value.success !== true || typeof value.listingId !== 'string' || (expectedListingId && value.listingId !== expectedListingId)
    || !isoString(value.serverNow) || !window?.until || !availability || !calendarDateString(availability.from)
    || (availability.until !== undefined && !calendarDateString(availability.until))
    || (availability.until && availability.until < availability.from)
    || typeof availability.temporarilyUnavailable !== 'boolean' || !Array.isArray(availability.blocked)
    || availability.blocked.length > 366 || !Array.isArray(value.activeRentals) || value.activeRentals.length > 100) {
    throw new Error('INVALID_AVAILABILITY_RESPONSE');
  }
  const blocked = availability.blocked.map(decodeAvailabilityDateRange);
  if (blocked.some(item => !item)) throw new Error('INVALID_AVAILABILITY_RESPONSE');
  const activeRentals = value.activeRentals.map((rawRange): AvailabilityCalendarRange | null => {
    const range = record(rawRange);
    if (!range || !isoString(range.startAt) || (range.endAt !== null && !isoString(range.endAt))
      || (range.endAt && range.endAt <= range.startAt) || (range.state !== 'booked' && range.state !== 'in_rental')) return null;
    return { startAt: range.startAt, endAt: range.endAt as string | null, state: range.state };
  });
  if (activeRentals.some(item => !item)) throw new Error('INVALID_AVAILABILITY_RESPONSE');
  return {
    listingId: value.listingId,
    serverNow: value.serverNow,
    window: { from: window.from, until: window.until },
    availability: {
      from: availability.from,
      ...(availability.until ? { until: availability.until as string } : {}),
      blocked: blocked as { from: string; until?: string }[],
      temporarilyUnavailable: availability.temporarilyUnavailable,
    },
    activeRentals: activeRentals as AvailabilityCalendarRange[],
  };
}

function optionalIsoString(value: unknown): value is string | undefined {
  return value === undefined || isoString(value);
}

function nullableIsoString(value: unknown): value is string | null {
  return value === null || isoString(value);
}

function currencyCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

/** Emits schema metadata only. Values and user content are deliberately excluded. */
export function reportInvalidRentalMoney(diagnostic: RentalMoneyDiagnostic): void {
  console.warn('[rental-money] invalid runtime data', {
    context: diagnostic.context,
    code: diagnostic.code,
    fields: [...new Set(diagnostic.fields)].sort(),
    ...(diagnostic.requestId && /^[A-Za-z0-9_-]{1,128}$/.test(diagnostic.requestId)
      ? { requestId: diagnostic.requestId }
      : {}),
  });
}

export function decodeRentalPricingSnapshot(raw: unknown): RentalPricingSnapshot | null {
  const value = record(raw);
  if (!value
    || value.calculationVersion !== 2
    || (value.rateUnit !== 'hourly' && value.rateUnit !== 'daily')
    || !safeInteger(value.rateAmountMinor, 1)
    || !currencyCode(value.currency)
    || !safeInteger(value.currencyDecimals)
    || value.currencyDecimals !== currencyMinorDigits(value.currency)
    || typeof value.marketTimezone !== 'string'
    || !value.marketTimezone.trim()) return null;
  return {
    ...value,
    calculationVersion: 2,
    rateUnit: value.rateUnit,
    rateAmountMinor: value.rateAmountMinor,
    currency: value.currency,
    currencyDecimals: value.currencyDecimals,
    marketTimezone: value.marketTimezone,
  };
}

export function decodeCommercialSnapshot(raw: unknown): CommercialSnapshot | null {
  const value = record(raw);
  if (!value) return null;
  const nonNegative = [
    'percentageBps', 'fixedAmountMinor', 'minimumFeeMinor', 'customerShareBps',
    'baseAmountMinor', 'platformFeeMinor', 'customerFeeMinor', 'providerFeeMinor',
    'providerReceivableMinor', 'customerPayableMinor',
  ];
  if (nonNegative.some(field => !safeInteger(value[field]))) return null;
  if (!nullableSafeInteger(value.maximumFeeMinor)
    || !nullableSafeInteger(value.taxAmountMinor)
    || !nullableSafeInteger(value.gatewayFeeMinor)
    || (value.taxRateBps !== undefined && !nullableSafeInteger(value.taxRateBps))
    || !currencyCode(value.currency)
    || typeof value.ruleVersion !== 'string'
    || !['draft', 'active', 'scheduled', 'retired'].includes(String(value.ruleStatus))
    || !['percentage', 'fixed', 'percentage_fixed'].includes(String(value.mode))
    || !['customer', 'provider', 'split'].includes(String(value.payer))
    || !record(value.scope)
    || typeof value.countryCode !== 'string'
    || typeof value.categoryId !== 'string'
    || typeof value.providerUid !== 'string'
    || !isoString(value.calculatedAt)) return null;
  return value as unknown as CommercialSnapshot;
}

function decodeRentalBreakdown(raw: unknown): NonNullable<NonNullable<EquipmentRequest['finalRentalSnapshot']>['breakdown']> | null {
  const value = record(raw);
  if (!value || !safeInteger(value.baseAmountMinor)) return null;
  for (const field of ['platformCommissionMinor', 'customerPayableMinor', 'providerReceivableMinor', 'totalAmountMinor']) {
    if (!optionalSafeInteger(value[field])) return null;
  }
  if (value.taxAmountMinor !== undefined && !nullableSafeInteger(value.taxAmountMinor)) return null;
  if (value.gatewayFeeMinor !== undefined && !nullableSafeInteger(value.gatewayFeeMinor)) return null;
  return value as unknown as NonNullable<NonNullable<EquipmentRequest['finalRentalSnapshot']>['breakdown']>;
}

export function decodeFinalRentalSnapshot(raw: unknown): EquipmentRequest['finalRentalSnapshot'] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const value = record(raw);
  if (!value
    || !isoString(value.actualStartAt)
    || !isoString(value.actualEndAt)
    || !safeInteger(value.amountMinor)
    || !optionalSafeInteger(value.durationMinutes)
    || !optionalSafeInteger(value.billableMinutes)
    || !optionalSafeInteger(value.billableDays)
    || (value.breakdown !== undefined && decodeRentalBreakdown(value.breakdown) === null)) return undefined;
  return {
    ...value,
    actualStartAt: value.actualStartAt,
    actualEndAt: value.actualEndAt,
    amountMinor: value.amountMinor,
    ...(value.breakdown === undefined ? {} : { breakdown: decodeRentalBreakdown(value.breakdown)! }),
  } as EquipmentRequest['finalRentalSnapshot'];
}

function decodeDuration(raw: unknown): RentalSummary['duration'] | null {
  const value = record(raw);
  if (!value || (value.unit !== 'minute' && value.unit !== 'day')) return null;
  for (const field of ['elapsedMinutes', 'billableMinutes', 'billableUnits']) {
    if (!nullableFiniteNumber(value[field])) return null;
  }
  return value as unknown as RentalSummary['duration'];
}

function decodeSummaryAmount(raw: unknown): RentalSummary['currentEstimate'] | RentalSummary['final'] | null {
  if (raw === null) return null;
  const value = record(raw);
  const commercial = value ? decodeCommercialSnapshot(value.commercial) : null;
  if (!value || !safeInteger(value.baseAmountMinor) || !commercial) return null;
  if (value.asOf !== undefined && !isoString(value.asOf)) return null;
  if (value.finalizedAt !== undefined && !isoString(value.finalizedAt)) return null;
  return { ...value, commercial } as RentalSummary['currentEstimate'] | RentalSummary['final'];
}

export function decodeRentalSummary(raw: unknown): RentalSummary | null {
  const value = record(raw);
  if (!value
    || typeof value.requestId !== 'string'
    || value.pricingModelVersion !== 2
    || typeof value.status !== 'string'
    || !['hourly', 'daily', 'open_ended'].includes(String(value.rentalMode))
    || !isoString(value.requestedStartAt)
    || !nullableIsoString(value.requestedEndAt)
    || !nullableIsoString(value.actualStartAt)
    || !nullableIsoString(value.actualEndAt)
    || !decodeRentalPricingSnapshot(value.pricingSnapshot)
    || !decodeDuration(value.duration)
    || (value.currentEstimate !== null && !decodeSummaryAmount(value.currentEstimate))
    || (value.final !== null && !decodeSummaryAmount(value.final))
    || !optionalIsoString(value.serverNow)) return null;
  return {
    ...value,
    requestId: value.requestId,
    pricingModelVersion: 2,
    status: value.status,
    rentalMode: value.rentalMode as RentalSummary['rentalMode'],
    requestedStartAt: value.requestedStartAt,
    requestedEndAt: value.requestedEndAt,
    actualStartAt: value.actualStartAt,
    actualEndAt: value.actualEndAt,
    pricingSnapshot: decodeRentalPricingSnapshot(value.pricingSnapshot)!,
    duration: decodeDuration(value.duration)!,
    currentEstimate: value.currentEstimate === null ? null : decodeSummaryAmount(value.currentEstimate) as RentalSummary['currentEstimate'],
    final: value.final === null ? null : decodeSummaryAmount(value.final) as RentalSummary['final'],
    ...(value.serverNow === undefined ? {} : { serverNow: value.serverNow }),
  };
}

export type RentalRequestPricingState =
  | { kind: 'legacy' }
  | { kind: 'v2'; snapshot: RentalPricingSnapshot }
  | { kind: 'unavailable' };

export function rentalRequestPricingState(
  request: Pick<EquipmentRequest, 'pricingModelVersion' | 'pricingSnapshot'>,
  summary?: RentalSummary | null,
): RentalRequestPricingState {
  if (request.pricingModelVersion !== 2) return { kind: 'legacy' };
  const snapshot = decodeRentalPricingSnapshot(request.pricingSnapshot)
    || decodeRentalPricingSnapshot(summary?.pricingSnapshot);
  return snapshot ? { kind: 'v2', snapshot } : { kind: 'unavailable' };
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
  const result: [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(Date.UTC(result[0], result[1] - 1, result[2]));
  if (parsed.getUTCFullYear() !== result[0] || parsed.getUTCMonth() !== result[1] - 1 || parsed.getUTCDate() !== result[2]) throw new Error('INVALID_RENTAL_DATE');
  return result;
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
  if (!['hourly', 'daily'].includes(input.rentalMode)) throw new Error('FIXED_DURATION_REQUIRED');
  if (!['hourly', 'daily'].includes(input.rateUnit)) throw new Error('UNSUPPORTED_RATE_UNIT');
  if (input.rateUnit !== input.rentalMode) throw new Error('UNSUPPORTED_RATE_UNIT');
  if (!Number.isSafeInteger(input.expectedRateAmountMinor) || input.expectedRateAmountMinor <= 0) throw new Error('INVALID_RENTAL_RATE');
  if (!Number.isFinite(Date.parse(input.requestedStartAt))) throw new Error('INVALID_TIME_RANGE');
  if (!input.requestedEndAt || Date.parse(input.requestedEndAt) <= Date.parse(input.requestedStartAt)) {
    throw new Error('INVALID_TIME_RANGE');
  }
  const notes = input.notes?.trim();
  const workSiteLocation = input.workSiteLocation === undefined
    ? undefined
    : decodePreciseLocation(input.workSiteLocation);
  if (input.workSiteLocation !== undefined && !workSiteLocation) throw new Error('INVALID_WORK_SITE_LOCATION');
  return {
    equipmentId: input.equipmentId,
    pricingModelVersion: 2,
    rentalMode: input.rentalMode,
    rateUnit: input.rateUnit,
    expectedRateAmountMinor: input.expectedRateAmountMinor,
    requestedStartAt: new Date(input.requestedStartAt).toISOString(),
    requestedEndAt: new Date(input.requestedEndAt).toISOString(),
    ...(notes ? { notes } : {}),
    ...(workSiteLocation ? { workSiteLocation } : {}),
  };
}

function dateRangesOverlap(left: { from: string; until?: string }, right: { from: string; until?: string }): boolean {
  return left.from <= (right.until || '9999-12-31') && right.from <= (left.until || '9999-12-31');
}

export function marketDateAt(instant: string, offsetMinutes: number): string {
  const parsed = Date.parse(instant);
  if (!Number.isFinite(parsed)) throw new Error('INVALID_RENTAL_DATE');
  return new Date(parsed + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

function dayIntervalUtc(date: string, offsetMinutes: number): { start: number; end: number } {
  const start = Date.parse(marketDateToUtc(date, offsetMinutes));
  return { start, end: start + 86_400_000 };
}

export function availabilityStateForDate(calendar: ListingAvailabilityCalendar, date: string, offsetMinutes: number): AvailabilityCalendarState {
  parseDate(date);
  const policy = calendar.availability;
  if (policy.temporarilyUnavailable) return 'temporarily_unavailable';
  if (date < policy.from || (policy.until && date > policy.until)) return 'outside_availability';
  if (policy.blocked.some(range => dateRangesOverlap(range, { from: date, until: date }))) return 'owner_blocked';
  const day = dayIntervalUtc(date, offsetMinutes);
  let state: 'booked' | 'in_rental' | null = null;
  for (const rental of calendar.activeRentals) {
    const start = Date.parse(rental.startAt);
    const end = rental.endAt ? Date.parse(rental.endAt) : Number.POSITIVE_INFINITY;
    if (start < day.end && day.start < end) {
      if (rental.state === 'in_rental') return 'in_rental';
      state = 'booked';
    }
  }
  return state || 'available';
}

export function availabilityConflictForInterval(
  calendar: ListingAvailabilityCalendar,
  startAt: string,
  endAt: string,
  offsetMinutes: number,
): AvailabilityCalendarState | null {
  const start = Date.parse(startAt);
  const end = Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'outside_availability';
  const startDate = marketDateAt(startAt, offsetMinutes);
  const endDate = marketDateAt(new Date(end - 1).toISOString(), offsetMinutes);
  const policy = calendar.availability;
  if (policy.temporarilyUnavailable) return 'temporarily_unavailable';
  if (startDate < policy.from || (policy.until && endDate > policy.until)) return 'outside_availability';
  if (policy.blocked.some(range => dateRangesOverlap(range, { from: startDate, until: endDate }))) return 'owner_blocked';
  for (const rental of calendar.activeRentals) {
    const rentalStart = Date.parse(rental.startAt);
    const rentalEnd = rental.endAt ? Date.parse(rental.endAt) : Number.POSITIVE_INFINITY;
    if (start < rentalEnd && rentalStart < end) return rental.state;
  }
  return null;
}

export function normalizeEstimate(raw: RentalEstimate | { estimate: RentalEstimate; serverNow?: string }): RentalEstimate {
  if ('estimate' in raw) return { ...raw.estimate, serverNow: raw.serverNow };
  return raw;
}

export function prorateHourlyMinor(rateAmountMinor: number, billableMinutes: number): number {
  if (!safeInteger(rateAmountMinor, 1) || !safeInteger(billableMinutes, 1)) throw new Error('INVALID_RENTAL_MONEY_INPUT');
  const numerator = BigInt(rateAmountMinor) * BigInt(billableMinutes);
  const result = (numerator + 30n) / 60n;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('RENTAL_MONEY_OVERFLOW');
  return Number(result);
}

export function multiplyDailyMinor(rateAmountMinor: number, billableDays: number): number {
  if (!safeInteger(rateAmountMinor, 1) || !safeInteger(billableDays, 1)) throw new Error('INVALID_RENTAL_MONEY_INPUT');
  const result = BigInt(rateAmountMinor) * BigInt(billableDays);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('RENTAL_MONEY_OVERFLOW');
  return Number(result);
}

export function liveRentalEstimateMinor(summary: RentalSummary | null, elapsedMinutes: number | undefined): number | null {
  if (!summary) return null;
  if (summary.actualEndAt) return summary.final?.baseAmountMinor ?? summary.currentEstimate?.baseAmountMinor ?? null;
  if (!safeInteger(elapsedMinutes, 1)) return summary.currentEstimate?.baseAmountMinor ?? summary.final?.baseAmountMinor ?? null;
  try {
    return summary.pricingSnapshot.rateUnit === 'hourly'
      ? prorateHourlyMinor(summary.pricingSnapshot.rateAmountMinor, elapsedMinutes)
      : multiplyDailyMinor(summary.pricingSnapshot.rateAmountMinor, Math.ceil(elapsedMinutes / 1440));
  } catch {
    return null;
  }
}
