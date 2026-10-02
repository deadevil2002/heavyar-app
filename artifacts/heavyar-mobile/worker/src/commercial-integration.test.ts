import { afterEach, describe, expect, test } from 'bun:test';
import { __test, type Env } from './index';
import { buildLegacyCatalog, type CommissionRule } from './commercial';
import { quoteFromCommercial } from './payment';

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

  test('the effective legacy Saudi rule produces the audited commercial matrix in minor units', async () => {
    __test.setFirestore((collection, id) => collection === 'commercialSettings' && id === 'catalog'
      ? buildLegacyCatalog(0.10)
      : null);
    for (const row of [
      { base: 100, baseMinor: 10_000, feeMinor: 1_000, taxMinor: 1_500, payableMinor: 11_500, receivableMinor: 9_000 },
      { base: 500, baseMinor: 50_000, feeMinor: 5_000, taxMinor: 7_500, payableMinor: 57_500, receivableMinor: 45_000 },
      { base: 1_000, baseMinor: 100_000, feeMinor: 10_000, taxMinor: 15_000, payableMinor: 115_000, receivableMinor: 90_000 },
      { base: 2_500, baseMinor: 250_000, feeMinor: 25_000, taxMinor: 37_500, payableMinor: 287_500, receivableMinor: 225_000 },
      { base: 10_000, baseMinor: 1_000_000, feeMinor: 100_000, taxMinor: 150_000, payableMinor: 1_150_000, receivableMinor: 900_000 },
    ]) {
      const snapshot = await __test.authoritativeCommercialSnapshot(
        env,
        { providerUid: 'provider-1' },
        equipment,
        row.base,
        '2026-10-02T00:00:00.000Z',
      );
      expect(snapshot.ruleVersion).toBe('legacy-commission-v1');
      expect(snapshot.percentageBps).toBe(1_000);
      expect(snapshot.payer).toBe('provider');
      expect(snapshot.customerShareBps).toBe(0);
      expect(snapshot.baseAmountMinor).toBe(row.baseMinor);
      expect(snapshot.platformFeeMinor).toBe(row.feeMinor);
      expect(snapshot.customerFeeMinor).toBe(0);
      expect(snapshot.providerFeeMinor).toBe(row.feeMinor);
      expect(snapshot.taxAmountMinor).toBe(row.taxMinor);
      expect(snapshot.customerPayableMinor).toBe(row.payableMinor);
      expect(snapshot.providerReceivableMinor).toBe(row.receivableMinor);
      expect(snapshot.gatewayFeeMinor).toBeNull();
    }
  });

  test('the intended versioned 20 percent provider-paid draft produces the required Saudi matrix', async () => {
    const intended = rule('20000000-0000-4000-8000-000000000020', 2000);
    __test.setFirestore((collection, id) => collection === 'commercialSettings' && id === 'catalog'
      ? { revision: 2, rules: [intended] }
      : null);
    for (const row of [
      { base: 100, fee: 2_000, provider: 8_000, vat: 1_500, customer: 11_500 },
      { base: 500, fee: 10_000, provider: 40_000, vat: 7_500, customer: 57_500 },
      { base: 1_000, fee: 20_000, provider: 80_000, vat: 15_000, customer: 115_000 },
      { base: 2_500, fee: 50_000, provider: 200_000, vat: 37_500, customer: 287_500 },
      { base: 10_000, fee: 200_000, provider: 800_000, vat: 150_000, customer: 1_150_000 },
    ]) {
      const snapshot = await __test.authoritativeCommercialSnapshot(env, { providerUid: 'provider-1' }, equipment, row.base, '2026-10-02T00:00:00.000Z');
      expect(snapshot.ruleVersion).toBe(intended.version);
      expect(snapshot.percentageBps).toBe(2000);
      expect(snapshot.payer).toBe('provider');
      expect(snapshot.customerShareBps).toBe(0);
      expect(snapshot.platformFeeMinor).toBe(row.fee);
      expect(snapshot.providerReceivableMinor).toBe(row.provider);
      expect(snapshot.taxAmountMinor).toBe(row.vat);
      expect(snapshot.customerPayableMinor).toBe(row.customer);
      const quote = quoteFromCommercial(snapshot, `r-${row.base}`, 0);
      expect(quote).toMatchObject({
        subtotal: row.base,
        platformFee: row.fee / 100,
        providerAmount: row.provider / 100,
        vatAmount: row.vat / 100,
        total: row.customer / 100,
        policyVersion: intended.version,
      });
    }
  });

  test('new rental pricing fails closed when the authoritative catalog is absent', async () => {
    __test.setFirestore(() => null);
    await expect(__test.authoritativeCommercialSnapshot(env, { providerUid: 'provider-1' }, equipment, 100, '2026-10-02T00:00:00.000Z'))
      .rejects.toThrow('Commercial configuration unavailable');
  });

  test('historical 10 percent and new 20 percent snapshots keep their own terms after later catalog changes', async () => {
    let catalog = { revision: 1, rules: [rule('10000000-0000-4000-8000-000000000010', 1000)] };
    __test.setFirestore((collection, id) => collection === 'commercialSettings' && id === 'catalog' ? catalog : null);
    const historical = await __test.authoritativeCommercialSnapshot(env, { providerUid: 'provider-1' }, equipment, 1000, '2026-10-02T00:00:00.000Z');
    catalog = { revision: 2, rules: [rule('20000000-0000-4000-8000-000000000020', 2000)] };
    const intended = await __test.authoritativeCommercialSnapshot(env, { providerUid: 'provider-1' }, equipment, 1000, '2026-10-03T00:00:00.000Z');
    catalog = { revision: 3, rules: [rule('30000000-0000-4000-8000-000000000030', 3000)] };
    const lockedHistorical = __test.recalculateLockedCommercial(env, historical, 1000, '2026-10-04T00:00:00.000Z');
    const lockedIntended = __test.recalculateLockedCommercial(env, intended, 1000, '2026-10-04T00:00:00.000Z');
    expect(lockedHistorical.percentageBps).toBe(1000);
    expect(lockedHistorical.platformFeeMinor).toBe(10_000);
    expect(lockedIntended.percentageBps).toBe(2000);
    expect(lockedIntended.platformFeeMinor).toBe(20_000);
  });

  test('a paid Rental V2 invoice agrees with request, payment and locked commercial snapshot', async () => {
    const intended = rule('20000000-0000-4000-8000-000000000020', 2000);
    __test.setFirestore((collection, id) => collection === 'commercialSettings' && id === 'catalog'
      ? { revision: 2, rules: [intended] }
      : null);
    const snapshot = await __test.authoritativeCommercialSnapshot(env, { providerUid: 'provider-1' }, equipment, 1000, '2026-10-02T00:00:00.000Z');
    const invoiceId = 'INV-r-charge-v2';
    __test.setFirestore((collection, id) => {
      if (collection === 'invoices' && id === invoiceId) return {
        invoiceNumber: invoiceId, requestId: 'r', equipmentId: 'e', providerId: 'provider-1', customerId: 'customer-1',
        sellerName: 'Provider', buyerName: 'Customer', subtotal: 1000, platformFee: 200, providerAmount: 800,
        vatAmount: 150, totalAmount: 1150, currency: 'SAR', status: 'paid', paymentReference: 'charge-v2',
        createdAt: '2026-10-02T00:00:00.000Z', commercialSnapshot: snapshot,
      };
      if (collection === 'equipmentRequests') return {
        pricingModelVersion: 2, customerUid: 'customer-1', providerUid: 'provider-1', equipmentId: 'e',
        paymentStatus: 'paid', paymentState: 'paid', invoiceId, currency: 'SAR', paymentId: 'charge-v2',
        publicRequestNumber: 'HV-REQ-000001', finalBaseAmountMinor: 100_000, paidCommercialSnapshot: snapshot,
      };
      if (collection === 'payments') return {
        requestId: 'r', state: 'paid', invoiceId, customerUid: 'customer-1', currency: 'SAR',
        providerReference: 'charge-v2', amount: 1150, commercialSnapshot: snapshot,
      };
      if (collection === 'equipment') return { titleEn: 'Excavator' };
      return null;
    });
    const source = await __test.trustedInvoiceSource({}, invoiceId);
    expect(source).toMatchObject({ subtotal: 1000, platformFee: 200, providerReceivable: 800, vatAmount: 150, total: 1150, commissionConfigVersion: intended.version });
  });

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
