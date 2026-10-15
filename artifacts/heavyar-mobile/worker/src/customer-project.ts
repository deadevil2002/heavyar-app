import { currencyDecimals, majorToMinor, verifiedStoredCommercial } from './commercial';

export const CUSTOMER_PROJECT_PRODUCTION_ACTIVATION = 'disabled_pending_owner_release_approval' as const;
export const CUSTOMER_PROJECT_PAGE_SIZE = 20;
export const CUSTOMER_PROJECT_ID = /^project_[A-Za-z0-9_-]{43}$/;
export const CUSTOMER_PROJECT_LINK_ID = /^project_link_[A-Za-z0-9_-]{43}$/;
export const CUSTOMER_PROJECT_MUTATION_ID = /^project_mutation_[A-Za-z0-9_-]{43}$/;
export const CUSTOMER_PROJECT_SOURCE_ID = /^[A-Za-z0-9_-]{8,128}$/;

export type CustomerProjectSourceKind = 'rental' | 'service_rfq';
export type CustomerProjectStatus = 'active' | 'archived';

export class CustomerProjectError extends Error {
  constructor(readonly code: string) { super(code); }
}

export function parseCustomerProjectText(value: unknown, maximum: number, required = false) {
  if (typeof value !== 'string') throw new CustomerProjectError('INVALID_CUSTOMER_PROJECT');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if ((required && !normalized) || normalized.length > maximum) throw new CustomerProjectError('INVALID_CUSTOMER_PROJECT');
  return normalized;
}

export function parseCustomerProjectSource(kind: unknown, id: unknown) {
  if (!['rental', 'service_rfq'].includes(String(kind)) || typeof id !== 'string' || !CUSTOMER_PROJECT_SOURCE_ID.test(id)) {
    throw new CustomerProjectError('INVALID_CUSTOMER_PROJECT_SOURCE');
  }
  if (kind === 'service_rfq' && !/^rfq_[A-Za-z0-9_-]{43}$/.test(id)) {
    throw new CustomerProjectError('INVALID_CUSTOMER_PROJECT_SOURCE');
  }
  return { sourceKind: kind as CustomerProjectSourceKind, sourceId: id };
}

export function assertProjectRevision(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new CustomerProjectError('INVALID_CUSTOMER_PROJECT_REVISION');
  return Number(value);
}

export function assertProjectIdempotencyKey(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{8,128}$/.test(value)) {
    throw new CustomerProjectError('INVALID_CUSTOMER_PROJECT_IDEMPOTENCY');
  }
  return value;
}

export type CustomerProjectFinancialState = 'estimate' | 'paid' | 'final' | 'pending_quote' | 'provisional_non_binding' | 'unavailable';
export type CustomerProjectFinancialProjection = {
  state: CustomerProjectFinancialState;
  currency: string | null;
  currencyDecimals: 2 | 3 | null;
  amountMinor: number | null;
};

function unavailableFinancial(state: 'pending_quote' | 'unavailable' = 'unavailable'): CustomerProjectFinancialProjection {
  return { state, currency: null, currencyDecimals: null, amountMinor: null };
}

function supportedCurrency(value: unknown): { currency: string; decimals: 2 | 3 } | null {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) return null;
  try { return { currency: value, decimals: currencyDecimals(value) }; } catch { return null; }
}

function sourceCurrenciesAgree(source: Record<string, unknown>, currency: string) {
  const snapshots = ['pricingSnapshot', 'commercialSnapshot', 'finalCommercialSnapshot', 'paidCommercialSnapshot']
    .map(key => source[key])
    .filter(value => value && typeof value === 'object' && !Array.isArray(value)) as Record<string, unknown>[];
  const explicit = [source.currency, source.nativeCurrency, ...snapshots.map(value => value.currency)]
    .filter(value => value !== undefined && value !== null && value !== '');
  return explicit.every(value => supportedCurrency(value)?.currency === currency);
}

function commercialProjection(source: Record<string, unknown>, field: 'finalCommercialSnapshot' | 'paidCommercialSnapshot', state: 'final' | 'paid') {
  const snapshot = source[field];
  const currency = supportedCurrency((snapshot as Record<string, unknown> | null)?.currency);
  if (!currency || !sourceCurrenciesAgree(source, currency.currency)) return unavailableFinancial();
  const commercial = verifiedStoredCommercial(snapshot, currency.currency);
  return commercial
    ? { state, currency: currency.currency, currencyDecimals: currency.decimals, amountMinor: commercial.customerPayableMinor } as CustomerProjectFinancialProjection
    : unavailableFinancial();
}

function hasAuthoritativePaidEvidence(source: Record<string, unknown>) {
  return source.status === 'completed' && source.paymentStatus === 'paid' && source.paymentState === 'paid' &&
    typeof source.paymentId === 'string' && source.paymentId.length > 0 &&
    typeof source.invoiceId === 'string' && source.invoiceId.length > 0 &&
    typeof source.paidAt === 'string' && Number.isFinite(Date.parse(source.paidAt));
}

export function projectFinancialState(source: Record<string, unknown>): CustomerProjectFinancialProjection {
  const hasPaidMarker = source.paymentStatus === 'paid' || source.paymentState === 'paid' || source.paidCommercialSnapshot !== undefined;
  if (hasPaidMarker) return hasAuthoritativePaidEvidence(source)
    ? commercialProjection(source, 'paidCommercialSnapshot', 'paid')
    : unavailableFinancial();

  if (source.status === 'completed') return commercialProjection(source, 'finalCommercialSnapshot', 'final');

  const pricing = source.pricingSnapshot && typeof source.pricingSnapshot === 'object' && !Array.isArray(source.pricingSnapshot)
    ? source.pricingSnapshot as Record<string, unknown> : null;
  const currency = supportedCurrency(pricing?.currency ?? source.currency ?? source.nativeCurrency);
  const amountMinor = pricing?.baseAmountMinor;
  if (pricing && currency && Number.isSafeInteger(amountMinor) && Number(amountMinor) >= 0 &&
      (pricing.currencyDecimals === undefined || pricing.currencyDecimals === currency.decimals) && sourceCurrenciesAgree(source, currency.currency)) {
    return { state: 'estimate', currency: currency.currency, currencyDecimals: currency.decimals, amountMinor: Number(amountMinor) };
  }

  const legacyCurrency = supportedCurrency(source.currency ?? source.nativeCurrency);
  const legacyMajor = source.amount;
  if (legacyCurrency && (typeof legacyMajor === 'string' || typeof legacyMajor === 'number') && sourceCurrenciesAgree(source, legacyCurrency.currency)) {
    try {
      return { state: 'estimate', currency: legacyCurrency.currency, currencyDecimals: legacyCurrency.decimals, amountMinor: majorToMinor(legacyMajor, legacyCurrency.currency) };
    } catch { /* malformed legacy money is intentionally unavailable */ }
  }
  return unavailableFinancial();
}

export function projectProvisionalFinancialState(snapshot: unknown): CustomerProjectFinancialProjection {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return unavailableFinancial();
  const value = snapshot as Record<string, unknown>, currency = supportedCurrency(value.currency);
  if (!currency || !Number.isSafeInteger(value.quotedServicePriceMinor) || Number(value.quotedServicePriceMinor) < 0) return unavailableFinancial();
  return { state: 'provisional_non_binding', currency: currency.currency, currencyDecimals: currency.decimals, amountMinor: Number(value.quotedServicePriceMinor) };
}

export function projectPendingQuoteFinancialState() { return unavailableFinancial('pending_quote'); }
