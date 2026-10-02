import { describe, expect, test } from 'bun:test';
import { TapPaymentProvider, quoteForRequest, quoteFromCommercial, canTransition, stateForProvider, tapConfig, tapCredentials, tapEnvironmentStatus, normalizeTapEnvironment, invoiceNumberForPayment, tapCustomerFromAccount, tapProviderReferences, TAP_REDIRECT_URL, TAP_WEBHOOK_URL } from './payment';

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
    expect(stateForProvider('PENDING')).toBe('pending');
    expect(stateForProvider('FAILED')).toBe('failed');
    expect(stateForProvider('CANCELLED')).toBe('cancelled');
    expect(stateForProvider('REFUNDED')).toBe('refunded');
    expect(stateForProvider('PARTIALLY_REFUNDED')).toBe('partially_refunded');
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
  test('Tap adapter sends canonical customer, callbacks, references and uses transaction URL only', async () => {
    const calls: RequestInit[] = [];
    const provider = new TapPaymentProvider('test-credential', 'merchant-test-id', (async (_url, init) => {
      calls.push(init || {});
      return new Response(JSON.stringify({ id: 'chg_1', status: 'INITIATED', amount: 11.51, currency: 'SAR', transaction: { url: 'https://checkout.payments.tap.company/session' }, redirect: { url: 'https://merchant.invalid/not-checkout' } }));
    }) as typeof fetch);
    const customer = { first_name: 'Test', last_name: 'Customer', email: 'customer@example.test' };
    const input = { amount: 11.51, currency: 'SAR', idempotencyKey: 'k', requestId: 'request_1', customerUid: 'customer_1', customer, metadata: { requestId: 'request_1' } };
    const p = await provider.create(input);
    expect(p.id).toBe('chg_1');
    expect(p.checkoutUrl).toBe('https://checkout.payments.tap.company/session');
    expect(p.checkoutUrl).not.toBe('https://merchant.invalid/not-checkout');
    expect(new Headers(calls[0].headers).get('Idempotency-Key')).toBe('k');
    expect(JSON.parse(String(calls[0].body)).metadata.requestId).toBe('request_1');
    const payload = JSON.parse(String(calls[0].body));
    expect(payload.merchant).toEqual({ id: 'merchant-test-id' });
    expect(payload.customer).toEqual(customer);
    expect(payload.post).toEqual({ url: TAP_WEBHOOK_URL });
    expect(payload.redirect).toEqual({ url: `${TAP_REDIRECT_URL}?requestId=request_1` });
    expect(payload.reference).toEqual(await tapProviderReferences('customer_1', 'request_1'));
    expect(payload.reference.idempotent).toBe((await tapProviderReferences('customer_1', 'request_1')).idempotent);
    expect(payload.threeDSecure).toBe(true);
    expect(payload.customer_initiated).toBe(true);
    expect(payload.save_card).toBe(false);
    expect(payload.amount).toBe(11.51);
    expect(payload.currency).toBe('SAR');
    expect(tapConfig(true).environment).toBe('TEST');
  });
  test('Tap provider references are stable for retries and account customer data is validated', async () => {
    expect(await tapProviderReferences('customer_1', 'request_1')).toEqual(await tapProviderReferences('customer_1', 'request_1'));
    expect((await tapProviderReferences('customer_1', 'request_1')).order).not.toBe((await tapProviderReferences('customer_1', 'request_2')).order);
    expect(tapCustomerFromAccount({ nameEn: 'Test Customer', email: 'customer@example.test', countryCode: 'SA' })).toEqual({ first_name: 'Test', last_name: 'Customer', email: 'customer@example.test' });
    expect(tapCustomerFromAccount({ nameAr: 'عميل اختبار', phone: '+966551234567', countryCode: 'SA' })).toEqual({ first_name: 'عميل', last_name: 'اختبار', phone: { country_code: '966', number: '551234567' } });
    expect(() => tapCustomerFromAccount({ nameEn: 'Single', email: 'customer@example.test' })).toThrow('PAYMENT_PROFILE_INCOMPLETE');
    expect(() => tapCustomerFromAccount({ nameEn: 'Test Customer' })).toThrow('PAYMENT_PROFILE_INCOMPLETE');
  });
  test('Tap retrieval also uses transaction.url and rejects redirect.url as checkout', async () => {
    const provider = new TapPaymentProvider('test-credential', 'merchant-test-id', (async () => new Response(JSON.stringify({
      id: 'chg_TS123456', status: 'INITIATED', amount: 11.51, currency: 'SAR',
      transaction: { url: 'https://checkout.payments.tap.company/retrieved' },
      redirect: { url: 'https://merchant.invalid/return' },
    }))) as typeof fetch);
    expect((await provider.retrieve('chg_TS123456')).checkoutUrl).toBe('https://checkout.payments.tap.company/retrieved');
  });
  test('Tap environment selection is explicit and incomplete configuration fails closed', () => {
    const env = { TAP_SECRET_KEY_TEST: 'test-credential', TAP_SECRET_KEY_LIVE: 'live-credential', TAP_MERCHANT_ID: 'merchant-id' };
    expect(tapCredentials(env, 'TEST').secret).toBe('test-credential');
    expect(tapCredentials(env, 'LIVE').secret).toBe('live-credential');
    expect(tapCredentials(env, 'LIVE').merchantId).toBe('merchant-id');
    expect(normalizeTapEnvironment(undefined)).toBe('TEST');
    expect(normalizeTapEnvironment('invalid')).toBe('TEST');
    expect(tapEnvironmentStatus({ TAP_SECRET_KEY_TEST: 'test-credential' }, 'TEST').configured).toBe(false);
    expect(() => tapCredentials({ TAP_MERCHANT_ID: 'merchant-id' }, 'TEST')).toThrow('Tap configuration unavailable');
    expect(() => tapCredentials({ TAP_SECRET_KEY_LIVE: 'live-credential', TAP_MERCHANT_ID: 'merchant-id' }, 'TEST')).toThrow('Tap configuration unavailable');
    expect(() => tapCredentials({ TAP_SECRET_KEY_TEST: 'test-credential', TAP_MERCHANT_ID: 'merchant-id' }, 'LIVE')).toThrow('Tap configuration unavailable');
  });
  test('invoice numbers are deterministic and payment-scoped', () => {
    expect(invoiceNumberForPayment('request-1', 'charge-abcdef123456')).toBe('INV-request-1-ef123456');
    expect(invoiceNumberForPayment('request-1', 'charge-abcdef123456')).toBe(invoiceNumberForPayment('request-1', 'charge-abcdef123456'));
    expect(invoiceNumberForPayment('request-2', 'charge-abcdef123456') === invoiceNumberForPayment('request-1', 'charge-abcdef123456')).toBe(false);
  });
});
