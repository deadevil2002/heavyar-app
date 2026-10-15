export const SERVICE_QUOTE_COMPARISON_VERSION = 1 as const;
export const SERVICE_QUOTE_COMPARISON_PAGE_MAX = 20;

const SAFE_RFQ_ID = /^rfq_[A-Za-z0-9_-]{43}$/;
const SAFE_QUOTE_ID = /^quote_[A-Za-z0-9_-]{43}$/;
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export type ServiceQuoteSummary = {
  quoteId: string;
  quoteVersion: number;
  serviceKind: 'operator' | 'transporter';
  serviceScope: string;
  schedule: { startAt: string; endAt: string };
  inclusions: readonly string[];
  exclusions: readonly string[];
  serviceCategory: string;
  availability: 'declared_available' | 'declared_limited';
  currency: 'SAR';
  baseServicePriceMinor: number;
  optionalComponents: readonly { code: string; label: string; amountMinor: number }[];
  quotedServicePriceMinor: number;
  expiresAt: string;
  status: 'active' | 'expired' | 'provisionally_selected';
  eligibility: 'verified_by_future_authoritative_source';
};

export type ServiceQuoteComparisonPage = {
  contractVersion: 1;
  rfqId: string;
  rfqVersion: 1;
  serviceKind: 'operator' | 'transporter';
  quotes: readonly ServiceQuoteSummary[];
  nextCursor: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) return null;
  const normalized = value.trim();
  return normalized.length >= min && normalized.length <= max ? normalized : null;
}

function iso(value: unknown): string | null {
  return typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}

function minor(value: unknown, allowZero = false): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1) ? value : null;
}

function checkedSum(values: readonly number[]) {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || total > Number.MAX_SAFE_INTEGER - value) return null;
    total += value;
  }
  return total;
}

function textList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > 12) return null;
  const result = value.map(item => text(item, 1, 160));
  return result.some(item => item === null) ? null : result as string[];
}

function decodeQuote(value: unknown, serviceKind: 'operator' | 'transporter'): ServiceQuoteSummary | null {
  const raw = record(value);
  const keys = [
    'quoteId', 'quoteVersion', 'serviceKind', 'serviceScope', 'schedule', 'inclusions', 'exclusions', 'serviceCategory',
    'availability', 'currency', 'baseServicePriceMinor', 'optionalComponents', 'quotedServicePriceMinor', 'expiresAt', 'status', 'eligibility',
  ];
  if (!raw || !exactKeys(raw, keys) || typeof raw.quoteId !== 'string' || !SAFE_QUOTE_ID.test(raw.quoteId) || raw.serviceKind !== serviceKind ||
      !Number.isSafeInteger(raw.quoteVersion) || Number(raw.quoteVersion) < 1 || raw.currency !== 'SAR' ||
      !['declared_available', 'declared_limited'].includes(String(raw.availability)) ||
      !['active', 'expired', 'provisionally_selected'].includes(String(raw.status)) || raw.eligibility !== 'verified_by_future_authoritative_source') return null;
  const serviceScope = text(raw.serviceScope, 5, 500);
  const serviceCategory = typeof raw.serviceCategory === 'string' && SAFE_SLUG.test(raw.serviceCategory) ? raw.serviceCategory : null;
  const schedule = record(raw.schedule);
  const startAt = schedule && exactKeys(schedule, ['startAt', 'endAt']) ? iso(schedule.startAt) : null;
  const endAt = schedule && exactKeys(schedule, ['startAt', 'endAt']) ? iso(schedule.endAt) : null;
  const expiresAt = iso(raw.expiresAt);
  const inclusions = textList(raw.inclusions);
  const exclusions = textList(raw.exclusions);
  const baseServicePriceMinor = minor(raw.baseServicePriceMinor);
  const quotedServicePriceMinor = minor(raw.quotedServicePriceMinor);
  if (!serviceScope || !serviceCategory || !startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt) || !expiresAt ||
      !inclusions || !exclusions || baseServicePriceMinor === null || quotedServicePriceMinor === null ||
      !Array.isArray(raw.optionalComponents) || raw.optionalComponents.length > 8) return null;
  const optionalComponents: { code: string; label: string; amountMinor: number }[] = [];
  for (const item of raw.optionalComponents) {
    const component = record(item);
    if (!component || !exactKeys(component, ['code', 'label', 'amountMinor']) || typeof component.code !== 'string' || !SAFE_SLUG.test(component.code)) return null;
    const label = text(component.label, 1, 80);
    const amountMinor = minor(component.amountMinor, true);
    if (!label || amountMinor === null) return null;
    optionalComponents.push({ code: component.code, label, amountMinor });
  }
  if (new Set(optionalComponents.map(item => item.code)).size !== optionalComponents.length ||
      checkedSum([baseServicePriceMinor, ...optionalComponents.map(item => item.amountMinor)]) !== quotedServicePriceMinor) return null;
  return {
    quoteId: raw.quoteId,
    quoteVersion: raw.quoteVersion as number,
    serviceKind,
    serviceScope,
    schedule: { startAt, endAt },
    inclusions,
    exclusions,
    serviceCategory,
    availability: raw.availability as ServiceQuoteSummary['availability'],
    currency: 'SAR',
    baseServicePriceMinor,
    optionalComponents,
    quotedServicePriceMinor,
    expiresAt,
    status: raw.status as ServiceQuoteSummary['status'],
    eligibility: 'verified_by_future_authoritative_source',
  };
}

export function decodeSyntheticQuoteComparisonPage(value: unknown): ServiceQuoteComparisonPage {
  const raw = record(value);
  if (!raw || !exactKeys(raw, ['contractVersion', 'rfqId', 'rfqVersion', 'serviceKind', 'quotes', 'nextCursor']) ||
      raw.contractVersion !== SERVICE_QUOTE_COMPARISON_VERSION || raw.rfqVersion !== 1 || typeof raw.rfqId !== 'string' || !SAFE_RFQ_ID.test(raw.rfqId) ||
      !['operator', 'transporter'].includes(String(raw.serviceKind)) || !Array.isArray(raw.quotes) || raw.quotes.length > SERVICE_QUOTE_COMPARISON_PAGE_MAX ||
      raw.nextCursor !== null && (typeof raw.nextCursor !== 'string' || raw.nextCursor.length < 1 || raw.nextCursor.length > 800)) {
    throw new Error('INVALID_SERVICE_QUOTE_COMPARISON');
  }
  const serviceKind = raw.serviceKind as 'operator' | 'transporter';
  const quotes = raw.quotes.map(item => decodeQuote(item, serviceKind));
  if (quotes.some(item => item === null) || new Set(quotes.map(item => item!.quoteId)).size !== quotes.length) {
    throw new Error('INVALID_SERVICE_QUOTE_COMPARISON');
  }
  return {
    contractVersion: 1,
    rfqId: raw.rfqId,
    rfqVersion: 1,
    serviceKind,
    quotes: quotes as ServiceQuoteSummary[],
    nextCursor: raw.nextCursor as string | null,
  };
}

export class QuoteComparisonScopeGuard {
  private generation = 0;
  private controller: AbortController | null = null;
  private scope = '';

  begin(uid: string, organizationId?: string) {
    this.controller?.abort();
    this.generation += 1;
    this.controller = new AbortController();
    this.scope = `${uid}|${organizationId || 'individual'}`;
    return { generation: this.generation, scope: this.scope, signal: this.controller.signal };
  }

  isCurrent(value: { generation: number; scope: string }) {
    return value.generation === this.generation && value.scope === this.scope && !this.controller?.signal.aborted;
  }

  cancel() {
    this.controller?.abort();
    this.controller = null;
    this.generation += 1;
    this.scope = '';
  }
}

export function formatSyntheticQuoteMoney(amountMinor: number, language: 'ar' | 'en') {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return '';
  const locale = language === 'ar' ? 'ar-SA' : 'en-SA';
  const exactMinor = BigInt(amountMinor);
  const wholeSar = Number(exactMinor / 100n);
  const halalas = Number(exactMinor % 100n);
  if (!Number.isSafeInteger(wholeSar)) return '';

  const localizedHalalas = new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumIntegerDigits: 2,
    maximumFractionDigits: 0,
  }).format(halalas);
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Keep BigInt out of Intl for Android/Hermes compatibility. The whole-SAR
  // portion remains a safe integer, while the exact halala remainder replaces
  // Intl's synthetic fraction without any floating-point division.
  return formatter.formatToParts(wholeSar)
    .map(part => part.type === 'fraction' ? localizedHalalas : part.value)
    .join('');
}
