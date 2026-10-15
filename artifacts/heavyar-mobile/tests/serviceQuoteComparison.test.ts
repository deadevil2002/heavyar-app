import { describe, expect, it } from 'vitest';
import {
  QuoteComparisonScopeGuard,
  decodeSyntheticQuoteComparisonPage,
  formatSyntheticQuoteMoney,
} from '@/services/serviceQuoteComparison';

const RFQ_ID = `rfq_${'R'.repeat(43)}`;
const QUOTE_ID = `quote_${'Q'.repeat(43)}`;
const quote = {
  quoteId: QUOTE_ID,
  quoteVersion: 1,
  serviceKind: 'operator',
  serviceScope: 'Synthetic operator service scope',
  schedule: { startAt: '2026-11-01T05:00:00.000Z', endAt: '2026-11-01T13:00:00.000Z' },
  inclusions: ['Operator time'],
  exclusions: ['Equipment rental'],
  serviceCategory: 'excavators',
  availability: 'declared_available',
  currency: 'SAR',
  baseServicePriceMinor: 120_000,
  optionalComponents: [{ code: 'travel', label: 'Travel allowance', amountMinor: 10_000 }],
  quotedServicePriceMinor: 130_000,
  expiresAt: '2026-10-20T12:00:00.000Z',
  status: 'active',
  eligibility: 'verified_by_future_authoritative_source',
};
const page = {
  contractVersion: 1,
  rfqId: RFQ_ID,
  rfqVersion: 1,
  serviceKind: 'operator',
  quotes: [quote],
  nextCursor: null,
};

function normalizeLocalizedNumber(value: string) {
  const digits: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  };
  return value
    .replace(/[٠-٩]/g, digit => digits[digit])
    .replace(/٬/g, ',')
    .replace(/٫/g, '.');
}

describe('M2-D4 mobile synthetic quote comparison contract', () => {
  it('strictly decodes a bounded sanitized page and exact money totals', () => {
    const decoded = decodeSyntheticQuoteComparisonPage(page);
    expect(decoded).toEqual(page);
    expect(normalizeLocalizedNumber(formatSyntheticQuoteMoney(decoded.quotes[0].baseServicePriceMinor, 'en'))).toContain('1,200.00');
    expect(normalizeLocalizedNumber(formatSyntheticQuoteMoney(decoded.quotes[0].optionalComponents[0].amountMinor, 'en'))).toContain('100.00');
    expect(normalizeLocalizedNumber(formatSyntheticQuoteMoney(decoded.quotes[0].quotedServicePriceMinor, 'en'))).toContain('1,300.00');
    const multiComponentQuote = {
      ...quote,
      baseServicePriceMinor: 1,
      optionalComponents: [
        { code: 'travel', label: 'Travel allowance', amountMinor: 99 },
        { code: 'ppe', label: 'PPE allowance', amountMinor: 1 },
      ],
      quotedServicePriceMinor: 101,
    };
    const decodedMulti = decodeSyntheticQuoteComparisonPage({ ...page, quotes: [multiComponentQuote] });
    expect(normalizeLocalizedNumber(formatSyntheticQuoteMoney(decodedMulti.quotes[0].quotedServicePriceMinor, 'en'))).toContain('1.01');
    expect(() => decodeSyntheticQuoteComparisonPage({ ...page, customerUid: 'private' })).toThrow('INVALID_SERVICE_QUOTE_COMPARISON');
    expect(() => decodeSyntheticQuoteComparisonPage({ ...page, quotes: [{ ...quote, providerUid: 'private' }] })).toThrow('INVALID_SERVICE_QUOTE_COMPARISON');
    expect(() => decodeSyntheticQuoteComparisonPage({ ...page, quotes: [{ ...quote, quotedServicePriceMinor: 129_999 }] })).toThrow('INVALID_SERVICE_QUOTE_COMPARISON');
    expect(() => decodeSyntheticQuoteComparisonPage({ ...page, quotes: Array.from({ length: 21 }, (_, index) => ({ ...quote, quoteId: `quote_${String(index).padStart(43, 'A')}` })) })).toThrow('INVALID_SERVICE_QUOTE_COMPARISON');
  });

  it('rejects private location and identity fields rather than silently projecting them', () => {
    for (const forbidden of [
      { workSite: { lat: 24.7, lng: 46.6 } },
      { origin: { pin: { lat: 24.7, lng: 46.6 } } },
      { customerEmail: 'private@example.test' },
      { organizationId: `org_${'O'.repeat(43)}` },
    ]) {
      expect(() => decodeSyntheticQuoteComparisonPage({ ...page, quotes: [{ ...quote, ...forbidden }] })).toThrow('INVALID_SERVICE_QUOTE_COMPARISON');
    }
  });

  it('isolates in-flight comparison loads across account and organization switches', () => {
    const guard = new QuoteComparisonScopeGuard();
    const accountA = guard.begin('account-a');
    expect(guard.isCurrent(accountA)).toBe(true);
    const accountB = guard.begin('account-b');
    expect(accountA.signal.aborted).toBe(true);
    expect(guard.isCurrent(accountA)).toBe(false);
    expect(guard.isCurrent(accountB)).toBe(true);
    const organizationB = guard.begin('account-b', `org_${'B'.repeat(43)}`);
    expect(accountB.signal.aborted).toBe(true);
    expect(guard.isCurrent(accountB)).toBe(false);
    expect(guard.isCurrent(organizationB)).toBe(true);
    guard.cancel();
    expect(organizationB.signal.aborted).toBe(true);
    expect(guard.isCurrent(organizationB)).toBe(false);
  });

  it('formats exact integer halalas at small, grouped and upper safe-integer boundaries', () => {
    const cases: [number, string][] = [
      [1, '0.01'],
      [99, '0.99'],
      [100, '1.00'],
      [101, '1.01'],
      [12_345_678_901, '123,456,789.01'],
      [Number.MAX_SAFE_INTEGER - 2, '90,071,992,547,409.89'],
      [Number.MAX_SAFE_INTEGER - 1, '90,071,992,547,409.90'],
      [Number.MAX_SAFE_INTEGER, '90,071,992,547,409.91'],
    ];
    for (const [amountMinor, exact] of cases) {
      expect(normalizeLocalizedNumber(formatSyntheticQuoteMoney(amountMinor, 'en'))).toContain(exact);
      expect(normalizeLocalizedNumber(formatSyntheticQuoteMoney(amountMinor, 'ar'))).toContain(exact);
    }
    expect(formatSyntheticQuoteMoney(9.5, 'en')).toBe('');
    expect(formatSyntheticQuoteMoney(-1, 'en')).toBe('');
    expect(formatSyntheticQuoteMoney(Number.MAX_SAFE_INTEGER + 1, 'en')).toBe('');
    expect(formatSyntheticQuoteMoney(Number.NaN, 'ar')).toBe('');
  });
});
