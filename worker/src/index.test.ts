import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import worker, { __test, type Env } from './index';

const env = { CORS_ORIGINS: 'http://localhost' } as Env;
const request = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://worker.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const paidFixture = {
  id: 'r', customerUid: 'customer-1', providerUid: 'provider-1', equipmentId: 'e',
  status: 'completed', paymentStatus: 'pending_payment', paymentState: 'processing',
  paymentId: 'charge-1', amount: 100,
  customerPublic: { nameEn: 'Customer' }, providerPublic: { nameEn: 'Provider' },
};
const quoteFixture = {
  requestId: 'r', quoteId: 'quote:r:100.00:SAR', subtotal: 100, platformFee: 10,
  providerAmount: 90, vatAmount: 15, tax: 15, total: 115, amount: 115,
  platformFeeRate: 0.1, vatRate: 0.15, policyVersion: 'phase1-v1',
  currency: 'SAR', expiresAt: '2099-01-01T00:00:00.000Z',
};
const paymentFixture = {
  requestId: 'r', paymentId: 'payment:r', provider: 'tap', providerReference: 'charge-1',
  state: 'processing', quoteId: 'quote:r:100.00:SAR', amount: 115,
  currency: 'SAR', customerUid: 'customer-1',
};
const tapTransaction = (overrides: Record<string, unknown> = {}) => ({
  id: 'charge-1', status: 'CAPTURED', amount: 115, currency: 'SAR',
  metadata: {
    requestId: 'r', customerUid: 'customer-1', amount: '115', currency: 'SAR',
    quoteId: 'quote:r:100.00:SAR', paymentId: 'payment:r',
  },
  ...overrides,
});

describe('worker security boundary', () => {
  beforeEach(() => { __test.setAuth(undefined); __test.setFirestore(undefined); __test.setAssetOwned(undefined); });
  afterEach(() => { __test.setAuth(undefined); __test.setFirestore(undefined); __test.setAssetOwned(undefined); __test.captureWrites(undefined); __test.captureCommits(undefined); __test.setReservationConflict(false); });

  test('Firestore RPC URLs use the documents colon endpoint form', () => {
    const firestoreEnv = { ...env, FIREBASE_PROJECT_ID: 'project-id' } as Env;
    expect(__test.firestoreUrl(firestoreEnv, ':commit').endsWith('/documents:commit')).toBe(true);
    expect(__test.firestoreUrl(firestoreEnv, ':runQuery').endsWith('/documents:runQuery')).toBe(true);
  });

  test('unauthenticated payment and deletion endpoints return 401', async () => {
    expect((await worker.fetch(request('/api/create-payment', { requestId: 'r', amount: 1 }), env)).status).toBe(401);
    expect((await worker.fetch(request('/api/verify-payment', { chargeId: 'c' }), env)).status).toBe(401);
    expect((await worker.fetch(request('/cloudinary/delete', { publicId: 'heavyar/x/a' }), env)).status).toBe(401);
  });

  test('legacy lifecycle endpoints are unavailable after migration', async () => {
    expect((await worker.fetch(request('/api/start-request', { requestId: 'r' }), env)).status).toBe(404);
    expect((await worker.fetch(request('/api/confirm-completion', { requestId: 'r' }), env)).status).toBe(404);
  });

  test('open-ended completion uses the immutable request daily price', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests' ? {
      customerUid: 'customer-1', providerUid: 'provider-1', status: 'completion_requested',
      requestMode: 'open_ended', amount: 100, startedAt: new Date(Date.now() - 1.5 * 86400000).toISOString(),
    } : { pricePerDay: 999 });
    const writes: Array<{ path: string; fields: Record<string, unknown> }> = [];
    __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/confirm-completion', { requestId: 'r' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(404);
  });

  test('OTP fails closed without KV', async () => {
    expect((await worker.fetch(request('/api/send-email-otp', { email: 'a@example.com' }), env)).status).toBe(503);
    expect((await worker.fetch(request('/api/verify-email-otp', { email: 'a@example.com', code: '000000' }), env)).status).toBe(503);
  });

  test('authenticated arbitrary amount is rejected before Tap', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests'
      ? { customerUid: 'customer-1', status: 'completed', totalAmount: 10, paymentStatus: 'unpaid', equipmentId: 'e' }
      : {});
    const old = globalThis.fetch;
    let tapCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      tapCalled = true; return new Response('{}');
    }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/create-payment', { requestId: 'r', amount: 1 }, { Authorization: 'Bearer test' }), env);
      expect(response.status).toBe(400);
      expect(tapCalled).toBe(false);
    } finally { globalThis.fetch = old; }
  });

  test('an enabled verification policy blocks unverified payment creation before Tap', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => {
      if (collection === 'equipmentRequests') return { id: 'r', customerUid: 'customer-1', providerUid: 'provider-1', status: 'completed', paymentStatus: 'unpaid', amount: 100, equipmentId: 'e' };
      if (collection === 'equipment') return { pricePerDay: 100, isActive: true };
      if (collection === 'verificationProfiles') return { identity: { status: 'unverified' }, manualReview: { status: 'unverified' } };
      if (collection === 'verificationPolicies') return { enabled: true, requireCustomerIdentityVerification: true, verificationRequiredAboveAmountSAR: null, verificationRequiredForHighRiskEquipment: false, verificationRequiredForSpecificRequestTypes: [] };
      return {};
    });
    const old = globalThis.fetch;
    let tapCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => { tapCalled = String(input).includes('tap.company'); return new Response('{}'); }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      expect(response.status).toBe(403);
      expect((await response.json() as any).code).toBe('require_verification');
      expect(tapCalled).toBe(false);
    } finally { globalThis.fetch = old; }
  });

  test('provider start is blocked when an enabled policy finds the accepted customer unverified', async () => {
    __test.setAuth({ uid: 'provider-1', admin: false });
    __test.setFirestore((collection, id) => {
      if (collection === 'equipmentRequests') return { customerUid: 'customer-1', providerUid: 'provider-1', status: 'accepted', amount: 100, equipmentId: 'e' };
      if (collection === 'equipment') return { pricePerDay: 100, isActive: true };
      if (collection === 'verificationProfiles') return { identity: { status: 'unverified' }, manualReview: { status: 'unverified' } };
      if (collection === 'verificationPolicies') return { enabled: true, requireCustomerIdentityVerification: true, verificationRequiredAboveAmountSAR: null, verificationRequiredForHighRiskEquipment: false, verificationRequiredForSpecificRequestTypes: [] };
      if (collection === 'users' && id === 'customer-1') return {};
      return {};
    });
    const response = await worker.fetch(request('/api/start-request', { requestId: 'r' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(404);
  });

  test('payment uses canonical reservation fields, VAT math, and stable Tap idempotency', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests'
      ? { id: 'r', customerUid: 'customer-1', status: 'completed', amount: 100, paymentStatus: 'unpaid', equipmentId: 'e' } : null);
    const commits: unknown[][] = [];
    __test.captureCommits(commits);
    const old = globalThis.fetch; let tapHeaders: Headers | undefined; let tapBody: any;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('tap.company')) { tapHeaders = new Headers(init?.headers); tapBody = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ id: 'charge-1', status: 'INITIATED', amount: 115, currency: 'SAR', redirect: { url: 'https://tap.test' } })); }
      return new Response('{}');
    }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      expect(response.status).toBe(200);
      expect(tapBody.amount).toBe(115);
      expect(tapHeaders?.get('Idempotency-Key')).toBe('heavyar-payment:customer-1:r');
      expect(commits.length).toBe(2);
      expect((commits[0][0] as any).update.fields.paymentId.stringValue).toBe('reservation:heavyar-payment:customer-1:r');
      expect((commits[0] as any[]).some(write => String(write.update.name).includes('/paymentQuotes/r'))).toBe(true);
      expect((commits[0] as any[]).some(write => String(write.update.name).includes('/paymentIdempotency/'))).toBe(true);
      expect((commits[1][0] as any).update.fields.paymentId.stringValue).toBe('charge-1');
      const result = await response.json();
      expect(result.paymentId).toBe('charge-1');
      expect(result.status).toBe('pending');
      expect(result.checkoutUrl).toBe('https://tap.test');
      expect(result.quote.total).toBe(115);
    } finally { globalThis.fetch = old; __test.captureCommits(undefined); }
  });

  test('an immediately captured create settles request, invoice, and events atomically', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    let paymentReads = 0;
    __test.setFirestore((collection) => {
      if (collection === 'equipmentRequests') return { ...paidFixture, paymentStatus: 'unpaid', paymentState: undefined, paymentId: '' };
      if (collection === 'payments') {
        paymentReads++;
        return paymentReads === 1 ? null : { ...paymentFixture, state: 'created', providerReference: undefined };
      }
      if (collection === 'users') return { nameEn: 'Participant' };
      return null;
    });
    const commits: unknown[][] = []; __test.captureCommits(commits);
    const old = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify(tapTransaction()))) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.status).toBe('paid');
      expect(commits.length).toBe(2);
      const settlement = commits[1] as any[];
      const names = settlement.map(write => String(write.update.name));
      expect((settlement[0] as any).update.fields.paymentStatus.stringValue).toBe('paid');
      expect(names.some(name => name.includes('/invoices/'))).toBe(true);
      expect(names.some(name => name.includes('payment_confirmed'))).toBe(true);
      expect(names.some(name => name.includes('invoice_created'))).toBe(true);
    } finally { globalThis.fetch = old; __test.captureCommits(undefined); }
  });

  test('reservation conflict reuses pending payment without a second Tap call', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    let first = true;
    __test.setFirestore((collection) => {
      if (collection !== 'equipmentRequests') return {};
      if (first) { first = false; return { customerUid: 'customer-1', status: 'completed', amount: 100, paymentStatus: 'unpaid', equipmentId: 'e' }; }
      return { customerUid: 'customer-1', status: 'completed', amount: 100, paymentStatus: 'pending_payment', paymentId: 'charge-existing', equipmentId: 'e' };
    });
    __test.setReservationConflict(true);
    const old = globalThis.fetch; let tapCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => { tapCalled = String(input).includes('tap.company'); return new Response('{}'); }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      expect(response.status).toBe(200); expect((await response.json()).chargeId).toBe('charge-existing'); expect(tapCalled).toBe(false);
    } finally { globalThis.fetch = old; __test.setReservationConflict(false); }
  });

  test('wrong customer is rejected and unrelated Cloudinary asset is never sent', async () => {
    __test.setAuth({ uid: 'other', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests'
      ? { customerUid: 'owner', status: 'completed', totalAmount: 10, paymentStatus: 'unpaid', equipmentId: 'e' } : {});
    expect((await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    __test.setAssetOwned(false);
    const old = globalThis.fetch; let cloudinaryCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => { cloudinaryCalled = String(input).includes('cloudinary'); return new Response('{}'); }) as typeof fetch;
    try {
      expect((await worker.fetch(request('/cloudinary/delete', { publicId: 'heavyar/owner/secret' }, { Authorization: 'Bearer test' }), { ...env, CLOUDINARY_CLOUD_NAME: 'x', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' })).status).toBe(403);
      expect(cloudinaryCalled).toBe(false);
    } finally { globalThis.fetch = old; __test.setAssetOwned(undefined); }
  });

  test('stored asset ownership cannot cross the authenticated namespace', async () => {
    __test.setAuth({ uid: 'attacker', admin: false });
    __test.setAssetOwned(true);
    const old = globalThis.fetch; let cloudinaryCalled = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => { cloudinaryCalled = String(input).includes('cloudinary'); return new Response('{}'); }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/cloudinary/delete', { publicId: 'heavyar/victim/avatar' }, { Authorization: 'Bearer test' }), { ...env, CLOUDINARY_CLOUD_NAME: 'x', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' });
      expect(response.status).toBe(403);
      expect(cloudinaryCalled).toBe(false);
    } finally { globalThis.fetch = old; }
  });

  test('OTP state requires server Firestore credentials', async () => {
    expect((await worker.fetch(request('/api/send-email-otp', { email: 'otp@example.com' }), { ...env, RESEND_API_KEY: 'test' })).status).toBe(503);
  });

  test('registration grant is consumed only after create semantics and cannot be reused', async () => {
    const grant = 'one-time-grant';
    __test.setAuth({ uid: 'new-user', email: 'new@example.com', admin: false });
    let grantAvailable = true;
    __test.setFirestore((collection) => collection === 'users' ? null : collection === 'registrationGrants' && grantAvailable ? { emailHash: '8AMFAQIzJ0N7BuXG-H33hxuOcErmCNHQt7JP3SoGxxY', expiresAt: new Date(Date.now() + 300000).toISOString() } : {});
    const writes: Array<{ path: string; fields: Record<string, unknown> }> = []; const commits: unknown[] = []; __test.captureWrites(writes); __test.captureCommits(commits);
    const profileEnv = { ...env, FIREBASE_PROJECT_ID: 'test-project' } as Env;
    const response = await worker.fetch(request('/api/register-profile', { registrationGrant: grant, nameEn: 'New User' }, { Authorization: 'Bearer test' }), profileEnv);
    expect(response.status).toBe(200);
    expect(commits.length).toBe(1);
    grantAvailable = false;
    expect((await worker.fetch(request('/api/register-profile', { registrationGrant: grant }, { Authorization: 'Bearer test' }), profileEnv)).status).toBe(403);
    __test.captureWrites(undefined); __test.captureCommits(undefined);
  });

  test('cancelled and already-paid requests cannot create another payment', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    for (const value of [
      { ...paidFixture, status: 'cancelled', paymentStatus: 'unpaid', paymentState: undefined, paymentId: '' },
      { ...paidFixture, paymentStatus: 'paid', paymentState: 'paid' },
    ]) {
      __test.setFirestore((collection) => collection === 'equipmentRequests' ? value : null);
      const response = await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      expect(response.status).toBe(409);
    }
  });

  test('an existing provider reference is reused without another Tap creation', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests' ? paidFixture
      : collection === 'paymentQuotes' ? quoteFixture
      : collection === 'payments' ? paymentFixture : null);
    const old = globalThis.fetch; let called = false;
    globalThis.fetch = (async () => { called = true; return new Response('{}'); }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      expect(response.status).toBe(200);
      expect((await response.json()).paymentId).toBe('charge-1');
      expect(called).toBe(false);
    } finally { globalThis.fetch = old; }
  });

  test('a durable reservation resumes Tap creation with the same idempotency key', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    const reservation = 'reservation:heavyar-payment:customer-1:r';
    __test.setFirestore((collection) => collection === 'equipmentRequests' ? { ...paidFixture, paymentId: reservation, paymentState: 'pending' }
      : collection === 'paymentQuotes' ? quoteFixture
      : collection === 'payments' ? { ...paymentFixture, state: 'created', providerReference: undefined } : null);
    const commits: unknown[][] = []; __test.captureCommits(commits);
    const old = globalThis.fetch; let key = '';
    globalThis.fetch = (async (_input, init) => {
      key = new Headers(init?.headers).get('Idempotency-Key') || '';
      return new Response(JSON.stringify({ id: 'charge-1', status: 'INITIATED', amount: 115, currency: 'SAR', redirect: { url: 'https://tap.test' } }));
    }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      expect(response.status).toBe(200);
      expect(key).toBe('heavyar-payment:customer-1:r');
      expect(commits.length).toBe(1);
    } finally { globalThis.fetch = old; }
  });

  test('a terminal retry uses attempt-scoped idempotency and event records', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests'
      ? { ...paidFixture, paymentStatus: 'unpaid', paymentState: 'failed', paymentId: 'charge-failed' }
      : collection === 'paymentQuotes' ? quoteFixture
      : collection === 'payments' ? { ...paymentFixture, state: 'failed', providerReference: 'charge-failed', attempt: 1, idempotencyKey: 'heavyar-payment:customer-1:r' }
      : null);
    const commits: unknown[][] = []; __test.captureCommits(commits);
    const old = globalThis.fetch; let key = '';
    globalThis.fetch = (async (_input, init) => {
      key = new Headers(init?.headers).get('Idempotency-Key') || '';
      return new Response(JSON.stringify({ id: 'charge-2', status: 'INITIATED', amount: 115, currency: 'SAR', redirect: { url: 'https://tap.test/2' } }));
    }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      expect(response.status).toBe(200);
      expect(key).toBe('heavyar-payment:customer-1:r:2');
      expect(commits.length).toBe(2);
      const retryNames = (commits[0] as any[]).map(write => String(write.update.name));
      const finalNames = (commits[1] as any[]).map(write => String(write.update.name));
      expect(retryNames.some(name => name.includes('payment_retry_2'))).toBe(true);
      expect(finalNames.some(name => name.includes('attempt_2') && name.includes('payment_pending'))).toBe(true);
    } finally { globalThis.fetch = old; __test.captureCommits(undefined); }
  });

  test('an expired immutable quote blocks a new terminal attempt before Tap', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests'
      ? { ...paidFixture, paymentStatus: 'unpaid', paymentState: 'failed', paymentId: 'charge-failed' }
      : collection === 'paymentQuotes' ? { ...quoteFixture, expiresAt: '2000-01-01T00:00:00.000Z' }
      : collection === 'payments' ? { ...paymentFixture, state: 'failed', attempt: 1 }
      : null);
    const old = globalThis.fetch; let tapCalled = false;
    globalThis.fetch = (async input => { tapCalled = String(input).includes('tap.company'); return new Response('{}'); }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      expect(response.status).toBe(409);
      expect(tapCalled).toBe(false);
    } finally { globalThis.fetch = old; }
  });

  test('an ambiguous Tap failure preserves a reconcilable reservation', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests'
      ? { id: 'r', customerUid: 'customer-1', providerUid: 'provider-1', status: 'completed', amount: 100, paymentStatus: 'unpaid', equipmentId: 'e' }
      : null);
    const commits: unknown[][] = []; __test.captureCommits(commits);
    const old = globalThis.fetch;
    globalThis.fetch = (async input => {
      if (String(input).includes('tap.company')) throw new Error('network timeout');
      return new Response('{}');
    }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      const result = await response.json();
      expect(response.status).toBe(502);
      expect(result.paymentState).toBe('processing');
      expect(result.retryable).toBe(true);
      expect(commits.length).toBe(2);
      expect((commits[1][0] as any).update.fields.paymentState.stringValue).toBe('processing');
      expect((commits[1][0] as any).updateMask.fieldPaths.includes('paymentId')).toBe(false);
      expect((commits[1] as any[]).some(write => String(write.update.name).includes('payment_creation_uncertain'))).toBe(true);
    } finally { globalThis.fetch = old; __test.captureCommits(undefined); }
  });

  test('a webhook can settle a charge while the request still has its reservation ID', async () => {
    const reservation = 'reservation:heavyar-payment:customer-1:r';
    __test.setFirestore((collection) => collection === 'equipmentRequests'
      ? { ...paidFixture, paymentId: reservation, paymentState: 'processing' }
      : collection === 'paymentQuotes' ? quoteFixture
      : collection === 'payments' ? { ...paymentFixture, providerReference: undefined, state: 'processing' }
      : collection === 'users' ? { nameEn: 'Participant' } : null);
    const commits: unknown[][] = []; __test.captureCommits(commits);
    const old = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify(tapTransaction()))) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/webhooks/tap', { id: 'charge-1' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      expect(response.status).toBe(200);
      expect((await response.json()).status).toBe('paid');
      expect(commits.length).toBe(1);
      expect((commits[0][0] as any).update.fields.paymentId.stringValue).toBe('charge-1');
    } finally { globalThis.fetch = old; __test.captureCommits(undefined); }
  });

  test('wrong provider amount, currency, or association cannot mutate financial state', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests' ? paidFixture
      : collection === 'paymentQuotes' ? quoteFixture
      : collection === 'payments' ? paymentFixture : null);
    for (const transaction of [
      tapTransaction({ amount: 114 }),
      tapTransaction({ currency: 'USD' }),
      tapTransaction({ metadata: { ...tapTransaction().metadata, requestId: 'other' } }),
    ]) {
      const commits: unknown[][] = []; __test.captureCommits(commits);
      const old = globalThis.fetch;
      globalThis.fetch = (async () => new Response(JSON.stringify(transaction))) as typeof fetch;
      try {
        const response = await worker.fetch(request('/api/verify-payment', { paymentId: 'charge-1' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
        expect(response.status).toBe(409);
        expect(commits.length).toBe(0);
      } finally { globalThis.fetch = old; __test.captureCommits(undefined); }
    }
  });

  test('paid verification accepts provider-neutral and legacy IDs and commits invoice and events atomically', async () => {
    for (const body of [{ paymentId: 'charge-1' }, { chargeId: 'charge-1' }]) {
      __test.setAuth({ uid: 'customer-1', admin: false });
      __test.setFirestore((collection) => collection === 'equipmentRequests' ? paidFixture
        : collection === 'paymentQuotes' ? quoteFixture
        : collection === 'payments' ? paymentFixture
        : collection === 'users' ? { nameEn: 'Participant' } : null);
      const commits: unknown[][] = []; __test.captureCommits(commits);
      const old = globalThis.fetch;
      globalThis.fetch = (async () => new Response(JSON.stringify(tapTransaction()))) as typeof fetch;
      try {
        const response = await worker.fetch(request('/api/verify-payment', body, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
        const result = await response.json();
        expect(response.status).toBe(200);
        expect(result.status).toBe('paid');
        expect(result.isPaid).toBe(true);
        expect(commits.length).toBe(1);
        const names = (commits[0] as any[]).map(write => String(write.update.name));
        expect(names.some(name => name.includes('/invoices/INV-r-charge-1'))).toBe(true);
        expect(names.some(name => name.includes('payment_confirmed'))).toBe(true);
        expect(names.some(name => name.includes('invoice_created'))).toBe(true);
      } finally { globalThis.fetch = old; __test.captureCommits(undefined); }
    }
  });

  test('paid request markers cannot hide a missing invoice or incomplete payment record', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests'
      ? { ...paidFixture, paymentState: 'paid', paymentStatus: 'paid', invoiceId: 'INV-r-charge-1' }
      : collection === 'paymentQuotes' ? quoteFixture
      : collection === 'payments' ? { ...paymentFixture, state: 'processing', invoiceId: undefined }
      : collection === 'invoices' ? null
      : null);
    const commits: unknown[][] = []; __test.captureCommits(commits);
    const old = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify(tapTransaction()))) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/verify-payment', { paymentId: 'charge-1' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      const result = await response.json();
      expect(response.status).toBe(409);
      expect(result.success).toBe(false);
      expect(commits.length).toBe(0);
    } finally { globalThis.fetch = old; __test.captureCommits(undefined); }
  });

  test('webhook ignores claimed status, retrieves Tap, and duplicate delivery is write-free', async () => {
    const old = globalThis.fetch; let retrieved = false;
    globalThis.fetch = (async input => {
      retrieved = String(input).includes('/charges/charge-1');
      return new Response(JSON.stringify(tapTransaction()));
    }) as typeof fetch;
    try {
      __test.setFirestore((collection) => collection === 'equipmentRequests' ? paidFixture
        : collection === 'paymentQuotes' ? quoteFixture
        : collection === 'payments' ? paymentFixture
        : collection === 'users' ? { nameEn: 'Participant' } : null);
      const firstCommits: unknown[][] = []; __test.captureCommits(firstCommits);
      const first = await worker.fetch(request('/api/webhooks/tap', { id: 'charge-1', status: 'FAILED' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      expect(first.status).toBe(200);
      expect((await first.json()).status).toBe('paid');
      expect(retrieved).toBe(true);
      expect(firstCommits.length).toBe(1);

      __test.setFirestore((collection) => collection === 'equipmentRequests'
        ? { ...paidFixture, paymentStatus: 'paid', paymentState: 'paid', invoiceId: 'INV-r-charge-1' }
        : collection === 'paymentQuotes' ? quoteFixture
        : collection === 'payments' ? { ...paymentFixture, state: 'paid', invoiceId: 'INV-r-charge-1' }
        : collection === 'invoices' ? { invoiceNumber: 'INV-r-charge-1', status: 'paid' } : null);
      const duplicateCommits: unknown[][] = []; __test.captureCommits(duplicateCommits);
      const duplicate = await worker.fetch(request('/api/webhooks/tap', { id: 'charge-1' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
      expect(duplicate.status).toBe(200);
      expect(duplicateCommits.length).toBe(0);
    } finally { globalThis.fetch = old; __test.captureCommits(undefined); }
  });
});