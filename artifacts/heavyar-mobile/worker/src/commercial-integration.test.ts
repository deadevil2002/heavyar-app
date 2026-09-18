import { afterEach, describe, expect, test } from 'bun:test';
import { __test, type Env } from './index';
import { buildLegacyCatalog, type CommissionRule } from './commercial';

const env: Env = { PAYMENT_PLATFORM_FEE_RATE: '0.10', PAYMENT_VAT_RATE: '0.15' };
const equipment = { ownerUid: 'provider-1', category: 'excavators', countryCode: 'SA', nativeCurrency: 'SAR' };

function rule(version: string, percentageBps: number): CommissionRule {
  return {
    ...buildLegacyCatalog().rules[0],
    version,
    percentageBps,
    createdBy: 'owner-1',
    updatedBy: 'owner-1',
  };
}

describe('commercial rental and payment integration', () => {
  afterEach(() => __test.setFirestore(undefined));

  test('a rental keeps its selected terms after the current catalog changes', async () => {
    let catalog = { revision: 1, rules: [{
      ...rule('11111111-1111-4111-8111-111111111111', 500),
      effectiveFrom: '2024-12-01T00:00:00.000Z',
      notes: 'locked negotiated terms',
    }] };
    __test.setFirestore((collection, id) => collection === 'commercialSettings' && id === 'catalog' ? catalog : null);
    const selected = await __test.authoritativeCommercialSnapshot(env, { providerUid: 'provider-1' }, equipment, 100, '2025-01-01T00:00:00.000Z');

    catalog = { revision: 2, rules: [rule('22222222-2222-4222-8222-222222222222', 2000)] };
    const finalized = __test.recalculateLockedCommercial(
      { ...env, PAYMENT_VAT_RATE: '0.25' },
      selected,
      300,
      '2025-01-04T00:00:00.000Z',
    ) as typeof selected & { ruleEffectiveFrom?: string; ruleNotes?: string };
    const current = await __test.authoritativeCommercialSnapshot(env, { providerUid: 'provider-1' }, equipment, 300, '2025-01-04T00:00:00.000Z');

    expect(selected.platformFeeMinor).toBe(500);
    expect(finalized.platformFeeMinor).toBe(1500);
    expect(finalized.taxAmountMinor).toBe(4500);
    expect(finalized.ruleVersion).toBe(selected.ruleVersion);
    expect(finalized.ruleEffectiveFrom).toBe('2024-12-01T00:00:00.000Z');
    expect(finalized.ruleNotes).toBe('locked negotiated terms');
    expect(current.platformFeeMinor).toBe(6000);
  });

  test('legacy records use their stored fee rather than current configuration', () => {
    const snapshot = __test.legacyRecordCommercialSnapshot(
      { ...env, PAYMENT_PLATFORM_FEE_RATE: '0.40' },
      { amount: 100, platformFee: 7, providerUid: 'provider-1', currency: 'SAR', categoryId: 'excavators', countryCode: 'SA' },
      equipment,
      300,
      '2025-01-04T00:00:00.000Z',
    );
    expect(snapshot.platformFeeMinor).toBe(2100);
    expect(snapshot.ruleVersion).toBe('legacy-record-values');
  });

  test('non-basis-point VAT configuration fails closed', async () => {
    __test.setFirestore((collection, id) => collection === 'commercialSettings' && id === 'catalog'
      ? { revision: 1, rules: [rule('11111111-1111-4111-8111-111111111111', 500)] }
      : null);
    let rejected = false;
    try {
      await __test.authoritativeCommercialSnapshot(
        { ...env, PAYMENT_VAT_RATE: '0.15555' },
        { providerUid: 'provider-1' },
        equipment,
        100,
        '2025-01-01T00:00:00.000Z',
      );
    } catch { rejected = true; }
    expect(rejected).toBe(true);
  });

  test('stored quote snapshot and amount must agree', () => {
    const snapshot = __test.legacyRecordCommercialSnapshot(
      env,
      { amount: 100, platformFee: 10, providerUid: 'provider-1', currency: 'SAR', categoryId: 'excavators', countryCode: 'SA' },
      equipment,
      100,
      '2025-01-01T00:00:00.000Z',
    );
    let rejected = false;
    try {
      __test.quoteFromDoc({
        requestId: 'r', quoteId: 'quote:r', subtotal: 100, platformFee: 10, providerAmount: 90,
        vatAmount: 15, tax: 15, total: 999, amount: 999, currency: 'SAR',
        platformFeeRate: 0.1, vatRate: 0.15, policyVersion: snapshot.ruleVersion,
        expiresAt: '2025-01-01T00:30:00.000Z', commercialSnapshot: snapshot,
      });
    } catch { rejected = true; }
    expect(rejected).toBe(true);
  });

  for (const payerCase of [
    { payer: 'customer' as const, customerFeeMinor: 1000, providerFeeMinor: 0, providerReceivableMinor: 10000, customerPayableMinor: 12500 },
    { payer: 'split' as const, customerFeeMinor: 500, providerFeeMinor: 500, providerReceivableMinor: 9500, customerPayableMinor: 12000 },
  ]) {
    test(`${payerCase.payer} payer invoice source validates stored commercial components`, async () => {
      const snapshot = {
        ruleVersion: '11111111-1111-4111-8111-111111111111', ruleStatus: 'active' as const,
        mode: 'percentage' as const, percentageBps: 1000, fixedAmountMinor: 0,
        minimumFeeMinor: 0, maximumFeeMinor: null, payer: payerCase.payer,
        customerShareBps: payerCase.payer === 'customer' ? 10000 : 5000,
        scope: { countryCode: null, categoryId: null, providerUid: null },
        baseAmountMinor: 10000, platformFeeMinor: 1000, customerFeeMinor: payerCase.customerFeeMinor,
        providerFeeMinor: payerCase.providerFeeMinor, providerReceivableMinor: payerCase.providerReceivableMinor,
        customerPayableMinor: payerCase.customerPayableMinor, taxAmountMinor: 1500, gatewayFeeMinor: null,
        currency: 'SAR', countryCode: 'SA', categoryId: 'excavators', providerUid: 'provider-1',
        calculatedAt: '2025-01-01T00:00:00.000Z', taxReference: 'legacy-sar-vat-policy',
      };
      const total = payerCase.customerPayableMinor / 100;
      __test.setFirestore((collection, id) => {
        if (collection === 'invoices' && id === 'INV-1') return {
          invoiceNumber: 'INV-1', requestId: 'r', equipmentId: 'e', providerId: 'provider-1',
          customerId: 'customer-1', sellerName: 'Provider', buyerName: 'Customer',
          subtotal: 100, platformFee: 10, providerAmount: payerCase.providerReceivableMinor / 100,
          vatAmount: 15, totalAmount: total, currency: 'SAR', status: 'paid',
          paymentReference: 'charge-1', createdAt: '2025-01-01T00:00:00.000Z', commercialSnapshot: snapshot,
        };
        if (collection === 'equipmentRequests') return {
          customerUid: 'customer-1', providerUid: 'provider-1', equipmentId: 'e', paymentStatus: 'paid',
          paymentState: 'paid', invoiceId: 'INV-1', currency: 'SAR', paymentId: 'charge-1',
          publicRequestNumber: 'HV-REQ-000001', amount: 100, paidCommercialSnapshot: snapshot,
        };
        if (collection === 'payments') return {
          requestId: 'r', state: 'paid', invoiceId: 'INV-1', customerUid: 'customer-1',
          currency: 'SAR', providerReference: 'charge-1', amount: total, commercialSnapshot: snapshot,
        };
        if (collection === 'equipment') return { titleEn: 'Excavator' };
        return null;
      });
      const source = await __test.trustedInvoiceSource({}, 'INV-1');
      expect(source?.total).toBe(total);
      expect(source?.customerFee).toBe(payerCase.customerFeeMinor / 100);
      expect(source?.providerReceivable).toBe(payerCase.providerReceivableMinor / 100);
    });
  }
});