import { currencyDecimals } from './commercial';

export type RateUnit = 'hourly' | 'daily';
export type RentalMode = RateUnit | 'open_ended';
export type ListingPricing = {
  currency: string;
  hourly: { enabled: boolean; amountMinor?: number };
  daily: { enabled: boolean; amountMinor?: number };
};
export type V2RequestInput = {
  pricingModelVersion: 2;
  equipmentId: string;
  rentalMode: RentalMode;
  rateUnit: RateUnit;
  requestedStartAt: string;
  requestedEndAt: string | null;
  expectedRateAmountMinor: number;
  notes?: string;
};
export type RentalDuration = {
  elapsedMinutes: number | null;
  billableMinutes: number | null;
  billableUnits: number | null;
  unit: 'minute' | 'day';
};
export type RentalCalculation = {
  duration: RentalDuration;
  baseAmountMinor: number | null;
};

const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const FORBIDDEN_COMMERCIAL_FIELDS = new Set([
  'amount', 'total', 'duration', 'numberOfDays', 'baseAmount', 'baseAmountMinor',
  'finalAmount', 'finalAmountMinor', 'platformFee', 'commission', 'tax',
  'providerAmount', 'providerReceivable', 'customerPayable', 'actualStartAt',
  'actualEndAt', 'startedAt', 'endedAt',
]);
const INPUT_FIELDS = new Set([
  'pricingModelVersion', 'equipmentId', 'rentalMode', 'rateUnit',
  'requestedStartAt', 'requestedEndAt', 'expectedRateAmountMinor', 'notes',
  // Accepted only as a compatibility alias; it must agree with rentalMode.
  'requestMode',
]);
const MARKET: Record<string, { timezone: string; offsetMinutes: number; currency: string }> = {
  SA: { timezone: 'Asia/Riyadh', offsetMinutes: 180, currency: 'SAR' },
  AE: { timezone: 'Asia/Dubai', offsetMinutes: 240, currency: 'AED' },
  OM: { timezone: 'Asia/Muscat', offsetMinutes: 240, currency: 'OMR' },
  QA: { timezone: 'Asia/Qatar', offsetMinutes: 180, currency: 'QAR' },
  KW: { timezone: 'Asia/Kuwait', offsetMinutes: 180, currency: 'KWD' },
  BH: { timezone: 'Asia/Bahrain', offsetMinutes: 180, currency: 'BHD' },
};
export const V2_SERVER_OWNED_FIELDS = [
  'status', 'pricingSnapshot', 'commercialSnapshot', 'finalCommercialSnapshot',
  'actualStartAt', 'actualEndAt', 'finalBaseAmountMinor', 'finalDuration',
  'completionRequestedBy', 'cancelledBy', 'paymentStatus', 'paymentState',
] as const;

/** Supports security audits of legacy/direct mutation paths; it is not a Rules substitute. */
export function auditV2ProtectedMutation(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  if (before.pricingModelVersion !== 2 && after.pricingModelVersion !== 2) return [];
  return V2_SERVER_OWNED_FIELDS.filter(field => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

export function buildFinalPaymentHandoff(
  commercialSnapshotId: string,
  snapshot: {
    currency: string;
    baseAmountMinor: number;
    platformFeeMinor: number;
    taxAmountMinor: number | null;
    gatewayFeeMinor: number | null;
    customerPayableMinor: number;
    providerReceivableMinor: number;
  },
) {
  if (!/^rental-v2:[A-Za-z0-9_-]{1,128}:final$/.test(commercialSnapshotId)) throw new Error('Invalid final commercial snapshot ID');
  for (const [name, amount] of Object.entries({
    baseAmount: snapshot.baseAmountMinor,
    platformCommission: snapshot.platformFeeMinor,
    customerPayable: snapshot.customerPayableMinor,
    providerReceivable: snapshot.providerReceivableMinor,
  })) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`Invalid ${name}`);
  }
  if (snapshot.taxAmountMinor !== null && (!Number.isSafeInteger(snapshot.taxAmountMinor) || snapshot.taxAmountMinor < 0)) throw new Error('Invalid tax');
  if (snapshot.gatewayFeeMinor !== null && (!Number.isSafeInteger(snapshot.gatewayFeeMinor) || snapshot.gatewayFeeMinor < 0)) throw new Error('Invalid gateway fee');
  return {
    amountUnit: 'minor' as const,
    currency: snapshot.currency,
    baseAmount: snapshot.baseAmountMinor,
    platformCommission: snapshot.platformFeeMinor,
    tax: snapshot.taxAmountMinor,
    gatewayFee: snapshot.gatewayFeeMinor,
    customerPayable: snapshot.customerPayableMinor,
    providerReceivable: snapshot.providerReceivableMinor,
    commercialSnapshotId,
    settlementEnabled: false as const,
  };
}

function safe(value: bigint, label: string): number {
  if (value < 0n || value > MAX) throw new Error(`${label} is outside the safe integer range`);
  return Number(value);
}
function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new Error(`${label} must be a safe integer of at least ${minimum}`);
  return Number(value);
}
function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UTC.test(value)) throw new Error(`${label} must be an ISO UTC timestamp`);
  const parsed = new Date(value);
  const normalized = /\.\d{3}Z$/.test(value) ? value : value.replace(/Z$/, '.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== normalized) throw new Error(`${label} must be a real ISO UTC timestamp`);
  return parsed.toISOString();
}
function halfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function marketForCountry(countryCode: unknown) {
  const market = MARKET[String(countryCode || '').toUpperCase()];
  if (!market) throw new Error('Unsupported market timezone');
  return market;
}

export function legacyMarketProjection(listing: Record<string, any>): { countryCode: string; nativeCurrency: string } {
  const countryCode = listing.countryCode === undefined || listing.countryCode === null || listing.countryCode === ''
    ? 'SA'
    : String(listing.countryCode).toUpperCase();
  const market = marketForCountry(countryCode);
  const nativeCurrency = listing.nativeCurrency === undefined || listing.nativeCurrency === null || listing.nativeCurrency === ''
    ? (listing.currency === undefined || listing.currency === null || listing.currency === '' ? market.currency : String(listing.currency).toUpperCase())
    : String(listing.nativeCurrency).toUpperCase();
  currencyDecimals(nativeCurrency);
  return { countryCode, nativeCurrency };
}

export function validateListingPricing(value: unknown, expectedCurrency?: string): ListingPricing {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('pricing must be an object');
  const pricing = value as Record<string, any>;
  if (Object.keys(pricing).some(key => !['currency', 'hourly', 'daily'].includes(key))) throw new Error('Unsupported pricing field');
  const currency = String(pricing.currency || '').toUpperCase();
  currencyDecimals(currency);
  if (expectedCurrency && currency !== expectedCurrency.toUpperCase()) throw new Error('Pricing currency must match listing market');
  const read = (unit: RateUnit) => {
    const raw = pricing[unit];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['enabled', 'amountMinor'].includes(key)) || typeof raw.enabled !== 'boolean') {
      throw new Error(`Invalid ${unit} pricing`);
    }
    if (raw.enabled) return { enabled: true, amountMinor: integer(raw.amountMinor, `${unit} amountMinor`, 1) };
    if (raw.amountMinor !== undefined && raw.amountMinor !== null) integer(raw.amountMinor, `${unit} amountMinor`, 0);
    return { enabled: false, ...(raw.amountMinor == null ? {} : { amountMinor: Number(raw.amountMinor) }) };
  };
  const hourly = read('hourly'), daily = read('daily');
  if (!hourly.enabled && !daily.enabled) throw new Error('At least one rental rate must be enabled');
  return { currency, hourly, daily };
}

export function legacyPricingProjection(listing: Record<string, any>): { pricingModelVersion: 1; pricing: ListingPricing } {
  const currency = legacyMarketProjection(listing).nativeCurrency;
  const raw = listing.nativePricePerDay ?? listing.pricePerDay;
  if (typeof raw !== 'number' && typeof raw !== 'string') throw new Error('Legacy daily rate unavailable');
  const text = String(raw);
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('Legacy daily rate unavailable');
  const decimals = currencyDecimals(currency), [whole, fraction = ''] = text.split('.');
  const scale = 10n ** BigInt(decimals);
  let amount = BigInt(whole) * scale + BigInt(fraction.slice(0, decimals).padEnd(decimals, '0') || '0');
  if (fraction.length > decimals && Number(fraction[decimals]) >= 5) amount += 1n;
  return { pricingModelVersion: 1, pricing: { currency, hourly: { enabled: false }, daily: { enabled: true, amountMinor: safe(amount, 'legacy daily rate') } } };
}

export function parseV2RequestInput(value: unknown): V2RequestInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid V2 request');
  const raw = value as Record<string, any>;
  const unknown = Object.keys(raw).find(key => !INPUT_FIELDS.has(key));
  if (unknown) throw new Error(FORBIDDEN_COMMERCIAL_FIELDS.has(unknown) ? 'Client commercial totals and duration are forbidden' : `Unsupported request field: ${unknown}`);
  if (raw.pricingModelVersion !== 2) throw new Error('pricingModelVersion must be 2');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(raw.equipmentId || ''))) throw new Error('Invalid equipmentId');
  if (!['hourly', 'daily', 'open_ended'].includes(raw.rentalMode)) throw new Error('Unsupported rental mode');
  if (!['hourly', 'daily'].includes(raw.rateUnit)) throw new Error('Unsupported rate unit');
  if (raw.rentalMode !== 'open_ended' && raw.rateUnit !== raw.rentalMode) throw new Error('Rate unit does not match rental mode');
  if (raw.requestMode !== undefined && raw.requestMode !== raw.rentalMode) throw new Error('requestMode does not match rentalMode');
  const requestedStartAt = timestamp(raw.requestedStartAt, 'requestedStartAt');
  const requestedEndAt = raw.requestedEndAt === null ? null : timestamp(raw.requestedEndAt, 'requestedEndAt');
  if (raw.rentalMode === 'open_ended' ? requestedEndAt !== null : requestedEndAt === null) throw new Error('Invalid requested end for rental mode');
  if (requestedEndAt && requestedEndAt <= requestedStartAt) throw new Error('Requested end must be after start');
  const notes = raw.notes === undefined ? undefined : String(raw.notes);
  if (notes !== undefined && (notes.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes))) throw new Error('Invalid request notes');
  return {
    pricingModelVersion: 2, equipmentId: String(raw.equipmentId),
    rentalMode: raw.rentalMode, rateUnit: raw.rateUnit,
    requestedStartAt, requestedEndAt,
    expectedRateAmountMinor: integer(raw.expectedRateAmountMinor, 'expectedRateAmountMinor', 1),
    ...(notes === undefined ? {} : { notes }),
  };
}

export function rateFor(pricing: ListingPricing, unit: RateUnit): number {
  const rate = pricing[unit];
  if (!rate.enabled || !Number.isSafeInteger(rate.amountMinor) || Number(rate.amountMinor) < 1) throw new Error(`${unit} rental is unavailable`);
  return Number(rate.amountMinor);
}

function dailyBoundary(iso: string, countryCode: string): number {
  const instant = Date.parse(iso), { offsetMinutes } = marketForCountry(countryCode);
  const local = new Date(instant + offsetMinutes * 60_000);
  if (local.getUTCHours() || local.getUTCMinutes() || local.getUTCSeconds() || local.getUTCMilliseconds()) {
    throw new Error('Daily rentals require market-midnight boundaries');
  }
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

export function calculateRental(input: {
  mode: RentalMode; unit: RateUnit; rateAmountMinor: number; startAt: string; endAt: string; countryCode: string;
}): RentalCalculation {
  const start = timestamp(input.startAt, 'startAt'), end = timestamp(input.endAt, 'endAt');
  const elapsedMs = Date.parse(end) - Date.parse(start);
  if (elapsedMs <= 0) throw new Error('Rental duration must be positive');
  const rate = BigInt(integer(input.rateAmountMinor, 'rateAmountMinor', 1));
  if (input.mode === 'daily') {
    const days = (dailyBoundary(end, input.countryCode) - dailyBoundary(start, input.countryCode)) / 86_400_000;
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Daily rental duration must be from 1 to 365 days');
    return { duration: { elapsedMinutes: elapsedMs / 60_000, billableMinutes: null, billableUnits: days, unit: 'day' }, baseAmountMinor: safe(rate * BigInt(days), 'base amount') };
  }
  if (input.unit === 'hourly') {
    const minutes = Math.max(1, Math.ceil(elapsedMs / 60_000));
    return { duration: { elapsedMinutes: elapsedMs / 60_000, billableMinutes: minutes, billableUnits: minutes / 60, unit: 'minute' }, baseAmountMinor: safe(halfUp(rate * BigInt(minutes), 60n), 'base amount') };
  }
  const days = Math.max(1, Math.ceil(elapsedMs / 86_400_000));
  return { duration: { elapsedMinutes: elapsedMs / 60_000, billableMinutes: null, billableUnits: days, unit: 'day' }, baseAmountMinor: safe(rate * BigInt(days), 'base amount') };
}

export function estimateRental(input: V2RequestInput, pricing: ListingPricing, countryCode: string, nowIso: string) {
  const serverNow = timestamp(nowIso, 'serverNow');
  if (Date.parse(input.requestedStartAt) < Date.parse(serverNow)) throw new Error('Requested start is in the past');
  const rateAmountMinor = rateFor(pricing, input.rateUnit);
  if (input.expectedRateAmountMinor !== rateAmountMinor) throw new Error('RATE_CHANGED');
  const marketTimezone = marketForCountry(countryCode).timezone;
  const calculation = input.requestedEndAt
    ? calculateRental({ mode: input.rentalMode, unit: input.rateUnit, rateAmountMinor, startAt: input.requestedStartAt, endAt: input.requestedEndAt, countryCode })
    : { duration: { elapsedMinutes: null, billableMinutes: null, billableUnits: null, unit: input.rateUnit === 'hourly' ? 'minute' as const : 'day' as const }, baseAmountMinor: null };
  return {
    pricingModelVersion: 2 as const, calculationVersion: 2 as const,
    rentalMode: input.rentalMode, rateUnit: input.rateUnit, rateAmountMinor,
    currency: pricing.currency, currencyDecimals: currencyDecimals(pricing.currency),
    marketTimezone, requestedStartAt: input.requestedStartAt, requestedEndAt: input.requestedEndAt,
    ...calculation, estimated: true as const,
  };
}

export function intervalsOverlap(left: { startAt: string; endAt: string | null }, right: { startAt: string; endAt: string | null }): boolean {
  const leftStart = Date.parse(timestamp(left.startAt, 'startAt')), rightStart = Date.parse(timestamp(right.startAt, 'startAt'));
  const leftEnd = left.endAt === null ? Number.POSITIVE_INFINITY : Date.parse(timestamp(left.endAt, 'endAt'));
  const rightEnd = right.endAt === null ? Number.POSITIVE_INFINITY : Date.parse(timestamp(right.endAt, 'endAt'));
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function activeInterval(request: Record<string, any>): { startAt: string; endAt: string | null } | null {
  const activeStates = request.pricingModelVersion === 2
    ? ['accepted', 'in_progress', 'completion_requested', 'payment_pending', 'paid']
    : ['pending', 'accepted', 'in_progress', 'completion_requested', 'payment_pending', 'paid'];
  if (!activeStates.includes(String(request.status)) && request.paymentState !== 'paid') return null;
  if (request.pricingModelVersion === 2) {
    const startAt = request.rentalMode === 'open_ended' && request.actualStartAt ? request.actualStartAt : request.requestedStartAt;
    return typeof startAt === 'string' ? { startAt, endAt: request.actualEndAt || request.requestedEndAt || null } : null;
  }
  const legacyInstant = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  };
  const start = legacyInstant(request.actualStartAt)
    || legacyInstant(request.startedAt)
    || legacyInstant(request.startDate)
    || legacyInstant(request.createdAt)
    // An active historical record with no trustworthy lower bound must block
    // conservatively rather than disappear from availability.
    || '1970-01-01T00:00:00.000Z';
  if (request.requestMode === 'open_ended' || request.rentalMode === 'open_ended') return { startAt: start, endAt: null };
  const end = typeof request.endDate === 'string' && /^\d{4}-\d\d-\d\d$/.test(request.endDate)
    ? new Date(Date.parse(`${request.endDate}T00:00:00.000Z`) + 86_400_000).toISOString()
    : legacyInstant(request.actualEndAt) || legacyInstant(request.endDate);
  return { startAt: start, endAt: end };
}

export function v2TransitionAllowed(request: Record<string, any>, action: string, actorUid: string, admin = false) {
  const provider = request.providerUid === actorUid || admin, customer = request.customerUid === actorUid;
  if (!provider && !customer) return false;
  if (action === 'accept' || action === 'reject') return provider && request.status === 'pending';
  if (action === 'start') return provider && request.status === 'accepted';
  if (action === 'cancel') return (provider || customer) && ['pending', 'accepted'].includes(String(request.status)) && !request.actualStartAt;
  if (action === 'request_completion') return (provider || customer) && request.status === 'in_progress';
  if (action === 'complete') return request.status === 'completion_requested' && request.completionRequestedBy !== actorUid && (provider || customer);
  return false;
}

/** Start is bounded to avoid silently displacing a booked fixed interval. */
export function validateServerStart(request: Record<string, any>, nowIso: string) {
  const now = Date.parse(timestamp(nowIso, 'serverNow')), requested = Date.parse(timestamp(request.requestedStartAt, 'requestedStartAt'));
  const lateAllowance = 24 * 60 * 60_000;
  if (now < requested || now > requested + lateAllowance) throw new Error('Rental start is outside the allowed timing window');
  if (request.rentalMode !== 'open_ended' && request.requestedEndAt && now >= Date.parse(request.requestedEndAt)) throw new Error('Fixed rental interval has ended');
}