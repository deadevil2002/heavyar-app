import { describe, expect, test } from 'bun:test';
import { TapPaymentProvider, quoteForRequest, quoteFromCommercial, canTransition, stateForProvider, tapConfig, invoiceNumberForPayment } from './payment';

describe('payment trust core', () => {
  test('quote is rounded and exposes fee, payout, tax and expiry', () => {
    const q = quoteForRequest({ amount: 10.005 }, {}, 'r', 0);
    expect(q.subtotal).toBe(10.01);
    expect(q.platformFee).toBe(1);
    expect(q.providerAmount).toBe(9.01);
    expect(q.vatAmount).toBe(1.5);
    expect(q.platformFeeRate).toBe(0.1);
    expect(q.vatRate).toBe(0.15);
    expect(q.policyVersion).toBe('phase1-v1');
    expect(q.total).toBe(11.51);
    expect(q.currency).toBe('SAR');
    expect(q.expiresAt).toBe('1970-01-01T00:30:00.000Z');
  });
  test('transition matrix accepts legal paths and rejects regressions', () => {
    expect(canTransition(undefined, 'created')).toBe(true);
    expect(canTransition('created', 'pending')).toBe(true);
    expect(canTransition('pending', 'requires_action')).toBe(true);
    expect(canTransition('processing', 'paid')).toBe(true);
    expect(canTransition('paid', 'created')).toBe(false);
    expect(canTransition('cancelled', 'pending')).toBe(false);
    expect(canTransition('paid', 'paid')).toBe(true);
    expect(stateForProvider('CAPTURED')).toBe('paid');
    expect(stateForProvider('DECLINED')).toBe('failed');
  });
  test('payment adapter uses the authoritative commercial customer payable unchanged', () => {
    const snapshot = {
      ruleVersion: 'legacy-commission-v1', ruleStatus: 'active' as const, mode: 'percentage' as const,
      percentageBps: 1000, fixedAmountMinor: 0, minimumFeeMinor: 0, maximumFeeMinor: null,
      payer: 'split' as const, customerShareBps: 5000,
      scope: { countryCode: null, categoryId: null, providerUid: null },
      baseAmountMinor: 10000, platformFeeMinor: 1000, customerFeeMinor: 500,
      providerFeeMinor: 500, providerReceivableMinor: 9500, customerPayableMinor: 12000,
      taxAmountMinor: 1500, gatewayFeeMinor: null, currency: 'SAR', countryCode: 'SA',
      categoryId: 'excavators', providerUid: 'provider', calculatedAt: '2025-01-01T00:00:00.000Z',
    };
    const quote = quoteFromCommercial(snapshot, 'r', 0);
    expect(quote.amount).toBe(120);
    expect(quote.platformFee).toBe(10);
    expect(quote.providerAmount).toBe(95);
    expect(quote.commercialSnapshot).toBe(snapshot);
  });
  test('Tap adapter sends idempotency and normalizes response', async () => {
    const calls: RequestInit[] = [];
    const provider = new TapPaymentProvider('test', (async (_url, init) => {
      calls.push(init || {});
      return new Response(JSON.stringify({ id: 'ch_1', status: 'INITIATED', amount: 11.51, currency: 'SAR', redirect: { url: 'https://checkout' } }));
    }) as typeof fetch);
    const p = await provider.create({ amount: 11.51, currency: 'SAR', idempotencyKey: 'k', metadata: { requestId: 'r' } });
    expect(p.id).toBe('ch_1');
    expect(p.checkoutUrl).toBe('https://checkout');
    expect(new Headers(calls[0].headers).get('Idempotency-Key')).toBe('k');
    expect(JSON.parse(String(calls[0].body)).metadata.requestId).toBe('r');
    expect(tapConfig(true).environment).toBe('test');
  });
  test('invoice numbers are deterministic and payment-scoped', () => {
    expect(invoiceNumberForPayment('request-1', 'charge-abcdef123456')).toBe('INV-request-1-ef123456');
    expect(invoiceNumberForPayment('request-1', 'charge-abcdef123456')).toBe(invoiceNumberForPayment('request-1', 'charge-abcdef123456'));
    expect(invoiceNumberForPayment('request-2', 'charge-abcdef123456') === invoiceNumberForPayment('request-1', 'charge-abcdef123456')).toBe(false);
  });
});