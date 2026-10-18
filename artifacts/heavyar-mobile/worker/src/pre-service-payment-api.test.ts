import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import worker, { __test, type Env } from './index';
import { buildLegacyCatalog, calculateCommercial } from './commercial';
import { quoteFromCommercial } from './payment';
import {
  HEAVYAR_TAP_MARKETPLACE_ID,
  HEAVYAR_TAP_MERCHANT_ID,
  buildRentalPreServicePaymentPlan,
  preServicePaymentAssociation,
  preServicePaymentMetadata,
} from './pre-service-payment';

const request = (body: unknown, query = '') => new Request(`https://worker.test/api/payments/pre-service/prepare${query}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test', 'X-Enable-Payments': 'true' },
  body: JSON.stringify(body),
});

describe('Launch Packet 2 production activation boundary', () => {
  beforeEach(() => {
    __test.setAuth({ uid: 'customer-pre-service-0001', admin: false });
    __test.setPreServicePaymentActivation(undefined);
    __test.setFirestore(undefined);
    __test.captureCommits(undefined);
  });

  afterEach(() => {
    __test.setPreServicePaymentActivation(undefined);
    __test.setFirestore(undefined);
    __test.setAuth(undefined);
    __test.captureCommits(undefined);
  });

  test('direct HTTP input cannot enable pre-service payment preparation', async () => {
    const response = await worker.fetch(request({
      kind: 'equipment_rental', sourceId: 'rental_1', activation: true,
    }, '?enabled=true'), { TAP_MERCHANT_ID: '68049852' } as Env);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      errorCode: 'PRE_SERVICE_PAYMENT_NOT_ACTIVATED',
      activation: { enabled: false },
    });
  });

  test('the local-only hook still fails closed before reads when HEAVYAR merchant identity differs', async () => {
    __test.setPreServicePaymentActivation(true);
    __test.setFirestore((collection) => collection === 'paymentGateways' ? { enabled: true, environment: 'TEST' } : null);
    const response = await worker.fetch(request({ kind: 'equipment_rental', sourceId: 'rental_1' }), {
      TAP_MERCHANT_ID: 'wrong-heavyar-merchant',
    } as Env);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, errorCode: 'HEAVYAR_TAP_IDENTITY_UNVERIFIED' });
  });

  test('a rental cannot route payment to a provider who is not the authoritative equipment owner', async () => {
    __test.setPreServicePaymentActivation(true);
    __test.setFirestore((collection, id) => {
      if (collection === 'paymentGateways' && id === 'tap') return { enabled: true, environment: 'TEST' };
      if (collection === 'equipmentRequests' && id === 'rental_1') return {
        customerUid: 'customer-pre-service-0001', providerUid: 'provider-pre-service-0001', equipmentId: 'equipment_1',
      };
      if (collection === 'equipment' && id === 'equipment_1') return { ownerUid: 'different-provider' };
      if (collection === 'users' && id === 'customer-pre-service-0001') return { role: 'customer', isActive: true, accountStatus: 'active' };
      if (collection === 'users' && id === 'provider-pre-service-0001') return { role: 'provider', isActive: true, accountStatus: 'active' };
      if (collection === 'commercialSettings' && id === 'catalog') return buildLegacyCatalog();
      return null;
    });
    const response = await worker.fetch(request({ kind: 'equipment_rental', sourceId: 'rental_1' }), {
      TAP_MERCHANT_ID: '68049852',
    } as Env);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, errorCode: 'PAYMENT_ACCOUNT_NOT_AUTHORIZED' });
  });
});

const CUSTOMER = 'customer-pre-service-0001';
const PROVIDER = 'provider-pre-service-0001';
const REQUEST_ID = 'rental_1';

function commercial() {
  return calculateCommercial(buildLegacyCatalog().rules[0], {
    baseAmountMinor: 100_000,
    countryCode: 'SA',
    categoryId: 'excavators',
    providerUid: PROVIDER,
    currency: 'SAR',
    calculatedAt: '2026-10-18T08:00:00.000Z',
    taxAmountMinor: 15_000,
    taxReference: 'locked-rental-vat-evidence',
  });
}

function rental(overrides: Record<string, unknown> = {}) {
  const snapshot = commercial();
  return {
    id: REQUEST_ID,
    revision: 3,
    pricingModelVersion: 2,
    status: 'accepted',
    rentalMode: 'fixed_duration',
    requestMode: 'fixed_duration',
    customerUid: CUSTOMER,
    providerUid: PROVIDER,
    equipmentId: 'equipment_1',
    requestedStartAt: '2026-10-20T08:00:00.000Z',
    requestedEndAt: '2026-10-20T16:00:00.000Z',
    paymentStatus: 'unpaid',
    paymentState: null,
    commercialSnapshotStatus: 'estimated',
    commercialSnapshot: snapshot,
    pricingSnapshot: {
      snapshotId: `rental-v2:${REQUEST_ID}:locked`,
      baseAmountMinor: snapshot.baseAmountMinor,
      commercialTerms: snapshot,
    },
    ...overrides,
  };
}

function destination() {
  return {
    schemaVersion: 1,
    providerUid: PROVIDER,
    destinationId: '1234567890',
    merchantId: HEAVYAR_TAP_MERCHANT_ID,
    marketplaceId: HEAVYAR_TAP_MARKETPLACE_ID,
    environment: 'TEST',
    ownershipVerified: true,
    onboardingStatus: 'approved',
    payoutsEnabled: true,
    verifiedAt: '2026-10-18T10:00:00.000Z',
    validUntil: '2026-10-19T10:00:00.000Z',
  };
}

function baseFirestore(source = rental(), payment?: any, storedQuote?: any) {
  return (collection: string, id: string) => {
    if (collection === 'commercialSettings' && id === 'catalog') return buildLegacyCatalog();
    if (collection === 'paymentGateways' && id === 'tap') return { enabled: true, environment: 'TEST' };
    if (collection === 'equipmentRequests' && id === REQUEST_ID) return source;
    if (collection === 'equipment' && id === 'equipment_1') return { ownerUid: PROVIDER, currency: 'SAR', nativeCurrency: 'SAR' };
    if (collection === 'users' && id === CUSTOMER) return { uid: CUSTOMER, role: 'customer', isActive: true, accountStatus: 'active', nameEn: 'Test Customer', email: 'customer@example.test', countryCode: 'SA' };
    if (collection === 'users' && id === PROVIDER) return { uid: PROVIDER, role: 'provider', isActive: true, accountStatus: 'active', nameEn: 'Test Provider' };
    if (collection === 'tapProviderDestinations' && id === PROVIDER) return destination();
    if (collection === 'payments' && (id === REQUEST_ID || id === payment?.providerReference)) return payment || null;
    if (collection === 'paymentQuotes' && id === REQUEST_ID) return storedQuote || null;
    return null;
  };
}

const createRequest = (body: unknown) => new Request('https://worker.test/api/payments/pre-service/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
  body: JSON.stringify(body),
});

const testEnv = {
  TAP_MERCHANT_ID: HEAVYAR_TAP_MERCHANT_ID,
  TAP_SECRET_KEY_TEST: 'test-only-secret',
  FIREBASE_PROJECT_ID: 'heavyar-app',
} as Env;

function persistedAssociationFixture(sourceOverrides: Record<string, unknown> = {}) {
  const source = rental({ paymentStatus: 'pending_payment', paymentState: 'pending', paymentId: 'chg_pre_1', ...sourceOverrides });
  const plan = buildRentalPreServicePaymentPlan({
    requestId: REQUEST_ID, request: source, actorUid: CUSTOMER, environment: 'TEST', destination: destination(),
    commercialCatalog: buildLegacyCatalog(), now: '2026-10-18T12:00:00.000Z', allowExistingAttempt: true,
  });
  const association = preServicePaymentAssociation(plan, 'TEST');
  const quote = quoteFromCommercial(plan.commercialSnapshot, REQUEST_ID, Date.parse('2026-10-18T12:00:00.000Z'));
  const idempotencyKey = `heavyar-payment:${CUSTOMER}:${REQUEST_ID}`;
  const metadata = preServicePaymentMetadata(association, quote.quoteId, idempotencyKey);
  const payment = {
    ...association, sourceKind: association.kind, requestId: REQUEST_ID, sourceId: REQUEST_ID, provider: 'tap', state: 'pending',
    paymentId: `payment:${REQUEST_ID}`, quoteId: quote.quoteId, amount: quote.amount,
    idempotencyKey, attempt: 1, providerReference: 'chg_pre_1',
  };
  return { source, plan, association, quote, metadata, payment };
}

describe('Launch Packet 2 durable pre-service payment lifecycle', () => {
  beforeEach(() => {
    __test.setAuth({ uid: CUSTOMER, admin: false, email: 'customer@example.test' });
    __test.setPreServicePaymentActivation(true);
  });

  afterEach(() => {
    __test.setPreServicePaymentActivation(undefined);
    __test.setFirestore(undefined);
    __test.captureCommits(undefined);
    __test.setAuth(undefined);
  });

  test('atomically reserves the immutable rental association before the mocked Tap call', async () => {
    __test.setFirestore(baseFirestore());
    const commits: any[][] = [];
    __test.captureCommits(commits);
    const oldFetch = globalThis.fetch;
    let tapBody: any;
    globalThis.fetch = (async (_input, init) => {
      tapBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        id: 'chg_pre_1', status: 'INITIATED', amount: 1150, currency: 'SAR', metadata: tapBody.metadata,
        transaction: { url: 'https://checkout.payments.tap.company/pre-service' },
        destinations: { destination: [{ id: '1234567890', amount: 900, currency: 'SAR' }] },
      }));
    }) as typeof fetch;
    try {
      const response = await worker.fetch(createRequest({ kind: 'equipment_rental', sourceId: REQUEST_ID }), testEnv);
      expect(response.status).toBe(200);
      expect(tapBody.amount).toBe(1150);
      expect(tapBody.destinations.destination).toEqual([{ id: '1234567890', amount: 900, currency: 'SAR' }]);
      expect(tapBody.metadata).toMatchObject({
        paymentFlow: 'pre_service', sourceKind: 'equipment_rental', sourceId: REQUEST_ID,
        sourceRevision: '3', customerUid: CUSTOMER, providerUid: PROVIDER,
        merchantId: HEAVYAR_TAP_MERCHANT_ID, marketplaceId: HEAVYAR_TAP_MARKETPLACE_ID,
        destinationId: '1234567890', amount: '1150', currency: 'SAR', paymentEnvironment: 'TEST',
      });
      const reservationWrites = commits[0];
      const paymentWrite = reservationWrites.find(write => String(write.update.name).includes(`/payments/${REQUEST_ID}`));
      expect(paymentWrite.update.fields).toMatchObject({
        flow: { stringValue: 'pre_service' }, sourceKind: { stringValue: 'equipment_rental' },
        sourceRevision: { integerValue: '3' }, customerUid: { stringValue: CUSTOMER },
        providerUid: { stringValue: PROVIDER }, destinationId: { stringValue: '1234567890' },
        merchantId: { stringValue: HEAVYAR_TAP_MERCHANT_ID },
        marketplaceId: { stringValue: HEAVYAR_TAP_MARKETPLACE_ID },
        customerPayableMinor: { integerValue: '115000' }, providerReceivableMinor: { integerValue: '90000' },
        marketplaceRemainderMinor: { integerValue: '25000' },
      });
      expect('split' in (await response.json() as any).plan).toBe(false);
    } finally { globalThis.fetch = oldFetch; }
  });

  test('coalesces concurrent submissions and leaves a recoverable durable uncertain state on timeout', async () => {
    __test.setFirestore(baseFirestore());
    const commits: any[][] = [];
    __test.captureCommits(commits);
    const oldFetch = globalThis.fetch;
    let calls = 0;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    globalThis.fetch = (async () => { calls += 1; await held; throw new Error('mock timeout'); }) as typeof fetch;
    try {
      const first = worker.fetch(createRequest({ kind: 'equipment_rental', sourceId: REQUEST_ID }), testEnv);
      const second = worker.fetch(createRequest({ kind: 'equipment_rental', sourceId: REQUEST_ID }), testEnv);
      await Promise.resolve();
      release();
      const responses = await Promise.all([first, second]);
      expect(calls).toBe(1);
      expect(responses.map(response => response.status)).toEqual([502, 502]);
      const serialized = JSON.stringify(commits);
      expect(serialized).toContain('payment_creation_uncertain');
      expect(serialized).toContain('uncertain');
      expect(serialized).toContain('paymentIdempotency');
    } finally { globalThis.fetch = oldFetch; }
  });

  test('authoritative retrieval settles only the exact persisted charge association', async () => {
    const { source, quote, metadata, payment } = persistedAssociationFixture();
    expect(__test.preServiceAssociationFromPayment(payment)).toMatchObject({
      sourceId: REQUEST_ID, customerUid: CUSTOMER, providerUid: PROVIDER, customerPayableMinor: 115_000,
    });
    __test.setFirestore(baseFirestore(source, payment, { ...quote, requestId: REQUEST_ID }));
    const commits: any[][] = [];
    __test.captureCommits(commits);
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      id: 'chg_pre_1', status: 'CAPTURED', amount: 1150, currency: 'SAR', metadata,
      destinations: { destination: [{ id: '1234567890', amount: 900, currency: 'SAR' }] },
    }))) as typeof fetch;
    try {
      const response = await worker.fetch(new Request('https://worker.test/api/verify-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({ paymentId: 'chg_pre_1' }),
      }), testEnv);
      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result).toMatchObject({ success: true, paymentState: 'paid', requestId: REQUEST_ID });
      const writes = JSON.stringify(commits);
      expect(writes).toContain(`invoices/INV-${REQUEST_ID}`);
      expect(writes).toContain('paidCommercialSnapshot');
    } finally { globalThis.fetch = oldFetch; }
  });

  test('rejects forged provider destination data before any settlement write', async () => {
    const { source, quote, metadata, payment } = persistedAssociationFixture();
    __test.setFirestore(baseFirestore(source, payment, { ...quote, requestId: REQUEST_ID }));
    const commits: any[][] = [];
    __test.captureCommits(commits);
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      id: 'chg_pre_1', status: 'CAPTURED', amount: 1150, currency: 'SAR', metadata,
      destinations: { destination: [{ id: 'forged_destination', amount: 900, currency: 'SAR' }] },
    }))) as typeof fetch;
    try {
      const response = await worker.fetch(new Request('https://worker.test/api/verify-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        body: JSON.stringify({ paymentId: 'chg_pre_1' }),
      }), testEnv);
      expect(response.status).toBe(409);
      expect(commits).toHaveLength(0);
    } finally { globalThis.fetch = oldFetch; }
  });

  test('webhook reconciliation ignores untrusted status and uses the authoritative Tap charge', async () => {
    const { source, quote, metadata, payment } = persistedAssociationFixture();
    __test.setFirestore(baseFirestore(source, payment, { ...quote, requestId: REQUEST_ID }));
    const commits: any[][] = [];
    __test.captureCommits(commits);
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      id: 'chg_pre_1', status: 'PENDING', amount: 1150, currency: 'SAR', metadata,
      transaction: { url: 'https://checkout.payments.tap.company/pre-service' },
      destinations: { destination: [{ id: '1234567890', amount: 900, currency: 'SAR' }] },
    }))) as typeof fetch;
    try {
      const response = await worker.fetch(new Request('https://worker.test/api/webhooks/tap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'chg_pre_1', status: 'CAPTURED', metadata: { requestId: REQUEST_ID } }),
      }), testEnv);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ success: true, paymentState: 'pending' });
      expect(JSON.stringify(commits)).not.toContain('invoices/');
    } finally { globalThis.fetch = oldFetch; }
  });

  test('forged destination or cross-account create fails without producing an associated charge', async () => {
    __test.setFirestore(baseFirestore());
    const oldFetch = globalThis.fetch;
    let tapCalls = 0;
    globalThis.fetch = (async () => { tapCalls += 1; return new Response('{}'); }) as typeof fetch;
    try {
      __test.setAuth({ uid: 'other-customer', admin: false, email: 'other@example.test' });
      const forbidden = await worker.fetch(createRequest({ kind: 'equipment_rental', sourceId: REQUEST_ID }), testEnv);
      expect(forbidden.status).toBe(403);
      expect(tapCalls).toBe(0);
    } finally { globalThis.fetch = oldFetch; }
  });
});
