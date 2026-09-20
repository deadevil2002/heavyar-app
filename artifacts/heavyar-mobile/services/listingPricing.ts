import { defaultDisplayCurrency } from '../constants/gcc';

export const LISTING_PRICING_MODEL_VERSION = 2 as const;

export type ListingRateUnit = 'hourly' | 'daily';
export type ListingPricingRate = { enabled: boolean; amountMinor: number };
export type ListingPricing = {
  currency: string;
  hourly: ListingPricingRate;
  daily: ListingPricingRate;
};
export type ListingPricingInput = {
  hourlyEnabled: boolean;
  hourlyAmount: string;
  dailyEnabled: boolean;
  dailyAmount: string;
};

export type ListingPricingSource = {
  pricingModelVersion?: unknown;
  pricing?: unknown;
  pricePerDay?: unknown;
  nativePricePerDay?: unknown;
  nativeCurrency?: unknown;
  currency?: unknown;
  countryCode?: string;
};

const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'KWD', 'OMR']);

export function currencyMinorDigits(currency: string): number {
  return THREE_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 3 : 2;
}

export function normalizeCurrency(currency: string | undefined, fallback = 'SAR'): string {
  const normalized = currency?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : fallback;
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/٫/g, '.');
}

/**
 * Parses a provider-entered decimal amount without using floating-point math.
 * Grouping separators, signs, exponents, and excess decimal places are rejected.
 */
export function decimalAmountToMinor(value: string, currency: string): number | null {
  const precision = currencyMinorDigits(currency);
  const normalized = normalizeDigits(value.trim());
  const match = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2]?.length ?? 0) > precision) return null;
  const fraction = (match[2] ?? '').padEnd(precision, '0');
  const amount = BigInt(match[1]) * (10n ** BigInt(precision)) + BigInt(fraction || '0');
  if (amount <= 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(amount);
}

export function minorAmountToDecimal(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return '';
  const precision = currencyMinorDigits(currency);
  const amount = BigInt(amountMinor);
  const scale = 10n ** BigInt(precision);
  const whole = amount / scale;
  const fraction = String(amount % scale).padStart(precision, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export type PricingValidationResult =
  | { ok: true; pricingModelVersion: 2; pricing: ListingPricing }
  | { ok: false; field: 'rates' | 'hourly' | 'daily'; reason: 'RATE_REQUIRED' | 'INVALID_RATE' };

export function buildListingPricing(
  input: ListingPricingInput,
  currencyValue: string,
): PricingValidationResult {
  const currency = normalizeCurrency(currencyValue);
  if (!input.hourlyEnabled && !input.dailyEnabled) {
    return { ok: false, field: 'rates', reason: 'RATE_REQUIRED' };
  }
  const hourlyMinor = input.hourlyEnabled ? decimalAmountToMinor(input.hourlyAmount, currency) : 0;
  if (input.hourlyEnabled && hourlyMinor === null) {
    return { ok: false, field: 'hourly', reason: 'INVALID_RATE' };
  }
  const dailyMinor = input.dailyEnabled ? decimalAmountToMinor(input.dailyAmount, currency) : 0;
  if (input.dailyEnabled && dailyMinor === null) {
    return { ok: false, field: 'daily', reason: 'INVALID_RATE' };
  }
  return {
    ok: true,
    pricingModelVersion: LISTING_PRICING_MODEL_VERSION,
    pricing: {
      currency,
      hourly: { enabled: input.hourlyEnabled, amountMinor: hourlyMinor ?? 0 },
      daily: { enabled: input.dailyEnabled, amountMinor: dailyMinor ?? 0 },
    },
  };
}

function validRate(value: unknown): ListingPricingRate | null {
  if (!value || typeof value !== 'object') return null;
  const rate = value as { enabled?: unknown; amountMinor?: unknown };
  if (rate.enabled === false) {
    return rate.amountMinor === 0 ? { enabled: false, amountMinor: 0 } : null;
  }
  if (rate.enabled !== true) return null;
  return Number.isSafeInteger(rate.amountMinor) && (rate.amountMinor as number) > 0
    ? { enabled: true, amountMinor: rate.amountMinor as number }
    : null;
}

/** Read adapter only: legacy daily listings are never rewritten by this function. */
export function resolveListingPricing(source: ListingPricingSource): ListingPricing | null {
  const raw = source.pricing;
  if (source.pricingModelVersion === 2) {
    if (!raw || typeof raw !== 'object') return null;
    const pricing = raw as { currency?: unknown; hourly?: unknown; daily?: unknown };
    const hourly = validRate(pricing.hourly);
    const daily = validRate(pricing.daily);
    const explicitCurrency = typeof pricing.currency === 'string'
      && /^[A-Za-z]{3}$/.test(pricing.currency.trim())
      ? pricing.currency
      : null;
    if (explicitCurrency && hourly && daily && (hourly.enabled || daily.enabled)) {
      return {
        currency: normalizeCurrency(explicitCurrency),
        hourly,
        daily,
      };
    }
    // An explicit V2 marker is authoritative. Never reinterpret malformed V2
    // data as a legacy daily listing, even when a legacy field is also present.
    return null;
  }

  const currency = normalizeCurrency(
    typeof source.nativeCurrency === 'string'
      ? source.nativeCurrency
      : typeof source.currency === 'string'
        ? source.currency
        : defaultDisplayCurrency(source.countryCode),
  );
  const legacyMajor = typeof source.nativePricePerDay === 'number'
    ? source.nativePricePerDay
    : source.pricePerDay;
  if (typeof legacyMajor !== 'number' || !Number.isFinite(legacyMajor) || legacyMajor <= 0) return null;
  const dailyMinor = decimalAmountToMinor(String(legacyMajor), currency);
  if (dailyMinor === null) return null;
  return {
    currency,
    hourly: { enabled: false, amountMinor: 0 },
    daily: { enabled: true, amountMinor: dailyMinor },
  };
}

export function pricingInputFromListing(source: ListingPricingSource): ListingPricingInput {
  const pricing = resolveListingPricing(source);
  return {
    hourlyEnabled: pricing?.hourly.enabled ?? false,
    hourlyAmount: pricing?.hourly.enabled ? minorAmountToDecimal(pricing.hourly.amountMinor, pricing.currency) : '',
    dailyEnabled: pricing?.daily.enabled ?? true,
    dailyAmount: pricing?.daily.enabled ? minorAmountToDecimal(pricing.daily.amountMinor, pricing.currency) : '',
  };
}

export function formatMinorCurrency(
  amountMinor: number,
  currencyValue: string,
  locale: 'ar' | 'en',
): string {
  const currency = normalizeCurrency(currencyValue);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return '';
  const precision = currencyMinorDigits(currency);
  const scale = 10n ** BigInt(precision);
  const amount = BigInt(amountMinor);
  const whole = amount / scale;
  const fraction = String(amount % scale).padStart(precision, '0').replace(/0+$/, '');
  const localeCode = locale === 'ar' ? 'ar-SA' : 'en';
  const formatter = new Intl.NumberFormat(localeCode, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const parts = formatter.formatToParts(whole);
  if (!fraction) return parts.map(part => part.value).join('');

  const decimalSeparator = new Intl.NumberFormat(localeCode, {
    useGrouping: false,
    minimumFractionDigits: 1,
  }).formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.';
  const localizedFraction = fraction.replace(/\d/g, digit =>
    new Intl.NumberFormat(localeCode, { useGrouping: false }).format(Number(digit)),
  );
  const lastNumberPart = parts.reduce(
    (last, part, index) => part.type === 'integer' || part.type === 'group' ? index : last,
    -1,
  );
  return parts.map((part, index) =>
    index === lastNumberPart
      ? `${part.value}${decimalSeparator}${localizedFraction}`
      : part.value,
  ).join('');
}
