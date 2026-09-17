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
  beforeEach(() => { __test.setAuth(undefined); __test.setFirestore(undefined); __test.setAssetOwned(undefined); __test.setDeletionDevices(undefined); __test.setRefreshTokenRevoke(undefined); });
  afterEach(() => { __test.setAuth(undefined); __test.setFirestore(undefined); __test.setAssetOwned(undefined); __test.setDeletionDevices(undefined); __test.setRefreshTokenRevoke(undefined); __test.captureWrites(undefined); __test.captureCommits(undefined); __test.setReservationConflict(false); });

  test('Firestore RPC URLs use the documents colon endpoint form', () => {
    const firestoreEnv = { ...env, FIREBASE_PROJECT_ID: 'project-id' } as Env;
    expect(__test.firestoreUrl(firestoreEnv, ':commit').endsWith('/documents:commit')).toBe(true);
    expect(__test.firestoreUrl(firestoreEnv, ':runQuery').endsWith('/documents:runQuery')).toBe(true);
  });

  test('unauthenticated payment and deletion endpoints return 401', async () => {
    expect((await worker.fetch(request('/api/create-payment', { requestId: 'r', amount: 1 }), env)).status).toBe(401);
    expect((await worker.fetch(request('/api/verify-payment', { chargeId: 'c' }), env)).status).toBe(401);
    expect((await worker.fetch(request('/cloudinary/delete', { publicId: 'heavyar/x/a' }), env)).status).toBe(401);
    expect((await worker.fetch(request('/api/account/deletion-request', { confirmation: 'DELETE_MY_ACCOUNT' }), env)).status).toBe(401);
  });

  test('explicitly disabled Tap TEST gateway blocks payment creation', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests' ? paidFixture
      : collection === 'equipment' ? { isActive: true, ownerUid: 'provider-1', pricePerDay: 10 }
      : collection === 'paymentGateways' ? { enabled: false }
      : collection === 'users' ? { accountStatus: 'active' } : null);
    const response = await worker.fetch(request('/api/create-payment', { requestId: 'r' }, { Authorization: 'Bearer test' }), { ...env, TAP_SECRET_KEY_TEST: 'test' });
    expect(response.status).toBe(503);
  });

  test('account deletion requires explicit confirmation and does not reveal account data', async () => {
    __test.setAuth({ uid: 'delete-user', admin: false });
    __test.setDeletionDevices([]);
    __test.captureCommits([]);
    __test.setRefreshTokenRevoke(async () => {});
    __test.setFirestore((collection) => collection === 'users' ? { uid: 'delete-user', email: 'private@example.com', accountStatus: 'active' } : null);
    expect((await worker.fetch(request('/api/account/deletion-request', { confirmation: 'delete' }, { Authorization: 'Bearer test' }), env)).status).toBe(400);
    const response = await worker.fetch(request('/api/account/deletion-request', { confirmation: 'DELETE_MY_ACCOUNT' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(202);
    expect(JSON.stringify(await response.json()).includes('private@example.com')).toBe(false);
  });

  test('account deletion is idempotent, restricts operations, revokes canonical devices, and preserves financial records', async () => {
    __test.setAuth({ uid: 'delete-user', admin: false });
    const token = 'ExpoPushToken[delete-device]';
    const tokenHash = await __test.hashId(token);
    const installationHash = await __test.hashId('delete-install');
    __test.setFirestore((collection, id) => {
      if (collection === 'users') return { uid: 'delete-user', accountStatus: 'active' };
      if (collection === 'notificationTokenOwners' && id === tokenHash) return { uid: 'delete-user', active: true };
      if (collection === 'notificationInstallations' && id === installationHash) return { uid: 'delete-user', tokenId: tokenHash, active: true };
      if (collection === 'deletionRequests') return null;
      return null;
    });
    __test.setDeletionDevices([{ document: { name: `projects/p/databases/(default)/documents/deviceTokens/${tokenHash}`, updateTime: 'device-update', fields: {
      token: { stringValue: token }, installationId: { stringValue: 'delete-install' }, uid: { stringValue: 'delete-user' }, active: { booleanValue: true },
    } } }]);
    const commits: unknown[] = []; __test.captureCommits(commits); __test.setRefreshTokenRevoke(async () => {});
    const first = await worker.fetch(request('/api/account/deletion-request', { confirmation: 'DELETE_MY_ACCOUNT' }, { Authorization: 'Bearer test' }), env);
    expect(first.status).toBe(202);
    const writes = JSON.stringify(commits);
    expect(writes.includes('deletionRequests/delete-user')).toBe(true);
    expect(writes.includes('accountStatus')).toBe(true);
    expect(writes.includes(`deviceTokens/${tokenHash}`)).toBe(true);
    expect(writes.includes(`notificationTokenOwners/${tokenHash}`)).toBe(true);
    expect(writes.includes(`notificationInstallations/${installationHash}`)).toBe(true);
    expect(writes.includes('payments/')).toBe(false);
    expect(writes.includes('invoices/')).toBe(false);
    __test.setFirestore((collection) => collection === 'users' ? { uid: 'delete-user', accountStatus: 'deletion_requested' } : collection === 'deletionRequests' ? { uid: 'delete-user', status: 'pending', refreshTokenRevocationStatus: 'succeeded' } : null);
    const second = await worker.fetch(request('/api/account/deletion-request', { confirmation: 'DELETE_MY_ACCOUNT' }, { Authorization: 'Bearer test' }), env);
    expect(second.status).toBe(200);
    expect((await second.json()).status).toBe('pending');
  });

  test('deletion-requested accounts are blocked from new business actions', async () => {
    __test.setAuth({ uid: 'delete-user', admin: false });
    __test.setFirestore((collection) => collection === 'users' ? { uid: 'delete-user', accountStatus: 'deletion_requested' } : collection === 'equipment' ? { ownerUid: 'provider', isActive: true, pricePerDay: 10 } : null);
    const response = await worker.fetch(request('/api/requests', { equipmentId: 'eq' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(403);
    const device = await worker.fetch(request('/api/notifications/devices', { token: 'ExpoPushToken[blocked]', platform: 'android', installationId: 'blocked-install' }, { Authorization: 'Bearer test' }), env);
    expect(device.status).toBe(403);
    const payment = await worker.fetch(request('/api/create-payment', { requestId: 'r', amount: 1 }, { Authorization: 'Bearer test' }), env);
    expect(payment.status).toBe(403);
  });

  test('refresh-token revocation is requested after the durable lock, and auth failure leaves lock pending', async () => {
    __test.setAuth({ uid: 'delete-user', admin: false });
    __test.setDeletionDevices([]);
    const commits: unknown[] = [];
    __test.captureCommits(commits);
    __test.setFirestore((collection) => collection === 'users' ? { uid: 'delete-user', accountStatus: 'active' } : null);
    let revokedUid = '';
    __test.setRefreshTokenRevoke(async (_env, uid) => { revokedUid = uid; });
    const success = await worker.fetch(request('/api/account/deletion-request', { confirmation: 'DELETE_MY_ACCOUNT' }, { Authorization: 'Bearer test' }), env);
    expect(success.status).toBe(202);
    expect(revokedUid).toBe('delete-user');
    expect(commits.length).toBe(2);
    __test.setFirestore((collection) => collection === 'users' ? { uid: 'delete-user', accountStatus: 'active' } : null);
    __test.setRefreshTokenRevoke(async () => { throw new Error('identity toolkit unavailable'); });
    const failed = await worker.fetch(request('/api/account/deletion-request', { confirmation: 'DELETE_MY_ACCOUNT' }, { Authorization: 'Bearer test' }), env);
    expect(failed.status).toBe(503);
    expect((await failed.json()).status).toBe('pending');
    expect(JSON.stringify(commits).includes('accountStatus')).toBe(true);
    expect(JSON.stringify(commits).includes('refreshTokenRevocationStatus')).toBe(true);
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

  test('Saudi phone normalization accepts all mobile contract forms', () => {
    expect(__test.normalizeSaudiPhone('+966512345678')).toBe('+966512345678');
    expect(__test.normalizeSaudiPhone('00966512345678')).toBe('+966512345678');
    expect(__test.normalizeSaudiPhone('0512345678')).toBe('+966512345678');
    expect(__test.normalizeSaudiPhone('512345678')).toBe('+966512345678');
    expect(__test.normalizeSaudiPhone('412345678')).toBe(null);
    expect(__test.normalizeSaudiPhone('+96651234')).toBe(null);
  });

  test('public auth config separates requested phone signup from disabled phone auth', async () => {
    __test.setFirestore((collection) => collection === 'heavyarConfig' ? { requirePhoneOnSignup: true, allowPhoneLogin: true, requirePhoneVerification: true, phoneIndexReady: true, version: 7 } : null);
    const response = await worker.fetch(new Request('https://worker.test/api/auth/config'), env);
    const body: any = await response.json();
    expect(body.config.requested.requirePhoneOnSignup).toBe(true);
    expect(body.config.effective.requirePhoneOnSignup).toBe(true);
    expect(body.config.effective.allowPhoneLogin).toBe(false);
    expect(body.config.effective.requirePhoneVerification).toBe(false);
    expect(body.config.version).toBe(7);
  });

  test('password reset is generic and rate-limited without leaking identifiers', async () => {
    const values = new Map<string, string>(), kv = { get: async (key: string) => values.get(key) || null, put: async (key: string, value: string) => { values.set(key, value); }, delete: async () => {} };
    let calls = 0; const oldFetch = globalThis.fetch;
    globalThis.fetch = (async () => { calls += 1; return new Response('{}', { status: 200 }); }) as typeof fetch;
    try {
      const resetEnv = { ...env, FIREBASE_WEB_API_KEY: 'web-key', OTP_KV: kv } as Env;
      const malformed = await worker.fetch(request('/api/auth/password-reset', { identifier: 'not-an-email' }), resetEnv);
      const phone = await worker.fetch(request('/api/auth/password-reset', { identifier: '+966512345678' }), resetEnv);
      expect(malformed.status).toBe(202); expect(phone.status).toBe(202); expect(await malformed.text()).toBe(await phone.text()); expect(calls).toBe(0);
      const first = await worker.fetch(request('/api/auth/password-reset', { identifier: 'person@example.com' }, { 'X-Forwarded-For': '10.0.0.2' }), resetEnv);
      const second = await worker.fetch(request('/api/auth/password-reset', { identifier: 'person@example.com' }, { 'X-Forwarded-For': '10.0.0.2' }), resetEnv);
      expect(first.status).toBe(202); expect(second.status).toBe(202); expect(calls).toBe(1);
      expect(/person@example|https?:|token|link/i.test(await first.text())).toBe(false);
    } finally { globalThis.fetch = oldFetch; }
  });

  test('password reset without KV uses Firestore three-key rate gate', async () => {
    const commits: unknown[] = []; __test.captureCommits(commits);
    let calls = 0; const oldFetch = globalThis.fetch;
    globalThis.fetch = (async () => { calls += 1; return new Response('{}'); }) as typeof fetch;
    try {
      const resetEnv = { ...env, FIREBASE_PROJECT_ID: 'project', FIREBASE_WEB_API_KEY: 'web-key' } as Env;
      const response = await worker.fetch(request('/api/auth/password-reset', { identifier: 'firestore@example.com' }), resetEnv);
      expect(response.status).toBe(202);
      const rateWrites: any[] = commits[0] as any[];
      expect(rateWrites.length).toBe(3);
      expect(rateWrites.every(write => String(write.update.name).includes('authRecoveryRateLimits/'))).toBe(true);
      expect(calls).toBe(1);
    } finally { globalThis.fetch = oldFetch; }
  });

  test('registration roles, driver bootstrap, terms and phone collision are server enforced', async () => {
    const grant = 'role-grant', email = 'new@example.com', emailHash = '8AMFAQIzJ0N7BuXG-H33hxuOcErmCNHQt7JP3SoGxxY';
    __test.setAuth({ uid: 'role-user', email, admin: false });
    const commits: unknown[] = []; __test.captureCommits(commits);
    __test.setFirestore((collection, id) => collection === 'users' ? null : collection === 'registrationGrants' ? { emailHash, expiresAt: new Date(Date.now() + 300000).toISOString() } : null);
    const response = await worker.fetch(request('/api/register-profile', { registrationGrant: grant, role: 'provider', termsAccepted: true, nameEn: 'Provider', region: 'Riyadh', city: 'Riyadh' }, { Authorization: 'Bearer test' }), { ...env, FIREBASE_PROJECT_ID: 'project' } as Env);
    expect(response.status).toBe(200);
    const writes: any[] = commits[0] as any[];
    const user = writes.find((write) => String(write.update?.name).includes('/users/'));
    expect(user.update.fields.role.stringValue).toBe('provider'); expect(user.update.fields.isVerified).toBe(undefined);
    __test.setFirestore((collection) => collection === 'users' ? null : collection === 'registrationGrants' ? { emailHash, expiresAt: new Date(Date.now() + 300000).toISOString() } : collection === 'heavyarConfig' ? { phoneIndexReady: true } : null);
    const driver = await worker.fetch(request('/api/register-profile', { registrationGrant: grant, role: 'driver', termsAccepted: true, nameEn: 'Driver', phone: '512345678', region: 'R', city: 'C' }, { Authorization: 'Bearer test' }), { ...env, FIREBASE_PROJECT_ID: 'project' } as Env);
    expect(driver.status).toBe(200);
    const driverWrites: any[] = commits[1] as any[]; const profile = driverWrites.find((write) => String(write.update?.name).includes('/driverProfiles/'));
    expect(profile.update.fields.active.booleanValue).toBe(false); expect(profile.update.fields.moderationStatus.stringValue).toBe('pending_review'); expect(profile.update.fields.trustStatus.stringValue).toBe('unverified');
    const noTerms = await worker.fetch(request('/api/register-profile', { registrationGrant: grant, role: 'customer' }, { Authorization: 'Bearer test' }), { ...env, FIREBASE_PROJECT_ID: 'project' } as Env);
    expect(noTerms.status).toBe(400);
    __test.setFirestore((collection) => collection === 'users' ? null : collection === 'registrationGrants' ? { emailHash, expiresAt: new Date(Date.now() + 300000).toISOString() } : collection === 'phoneOwners' ? { uid: 'other' } : collection === 'heavyarConfig' ? { phoneIndexReady: true } : null);
    const collision = await worker.fetch(request('/api/register-profile', { registrationGrant: grant, role: 'customer', termsAccepted: true, phone: '512345678', nameEn: 'Customer', region: 'R', city: 'C' }, { Authorization: 'Bearer test' }), { ...env, FIREBASE_PROJECT_ID: 'project' } as Env);
    expect(collision.status).toBe(409); expect(commits.length).toBe(2);
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
    const response = await worker.fetch(request('/api/register-profile', { registrationGrant: grant, nameEn: 'New User', termsAccepted: true, region: 'Riyadh', city: 'Riyadh' }, { Authorization: 'Bearer test' }), profileEnv);
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

  test('driver search enforces canonical filters, date bounds, trust, and privacy', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (!String(input).includes(':runQuery')) return new Response('{}');
      return new Response(JSON.stringify([{ document: { name: 'projects/p/databases/(default)/documents/driverProfiles/d1', fields: {
        uid: { stringValue: 'd1' }, displayName: { stringValue: 'Driver' },
        equipmentTypes: { arrayValue: { values: [{ stringValue: 'crane' }] } }, region: { stringValue: 'Riyadh' }, city: { stringValue: 'Riyadh' },
        availableFrom: { stringValue: '2026-01-01' }, availableUntil: { stringValue: '2026-01-31' }, trustStatus: { stringValue: 'verified' },
        phone: { stringValue: '+966' }, privateNotes: { stringValue: 'secret' }, active: { booleanValue: true }, moderationStatus: { stringValue: 'approved' },
      } } }]));
    }) as typeof fetch;
    __test.setFirestore((collection, id) => collection === 'driverProfiles' ? {
      uid: id, displayName: 'Driver', equipmentTypes: ['crane'], region: 'Riyadh', city: 'Riyadh',
      availableFrom: '2026-01-01', availableUntil: '2026-01-31', trustStatus: 'verified',
      phone: '+966500000000', email: 'private@test.invalid', privateNotes: 'secret', active: true, moderationStatus: 'approved',
    } : null);
    const canonical = await worker.fetch(new Request('https://worker.test/api/drivers/search?equipment=crane&availableFrom=2026-01-10&availableUntil=2026-01-20&trustStatus=verified&region=Riyadh&city=Riyadh', { headers: { Authorization: 'Bearer test' } }), env);
    expect(canonical.status).toBe(200);
    const body: any = await canonical.json(); expect(body.drivers.length).toBe(1);
    expect(JSON.stringify(body).includes('privateNotes')).toBe(false);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?equipment=excavator', { headers: { Authorization: 'Bearer test' } }), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?availableFrom=2026-02-01', { headers: { Authorization: 'Bearer test' } }), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?availableUntil=2025-12-01', { headers: { Authorization: 'Bearer test' } }), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?availableFrom=bad', { headers: { Authorization: 'Bearer test' } }), env)).status).toBe(400);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?availableFrom=2026-02-01&availableUntil=2026-01-01', { headers: { Authorization: 'Bearer test' } }), env)).status).toBe(400);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?equipmentType=crane', { headers: { Authorization: 'Bearer test' } }), env)).status).toBe(400);
    globalThis.fetch = oldFetch;
  });

  test('new requests receive an immutable Worker-issued public number without changing document IDs', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => {
      if (collection === 'equipment') return {
        ownerUid: 'provider-1', isActive: true, visibility: 'visible', moderationStatus: 'approved',
        pricePerDay: 100, availability: { from: '2026-01-01' },
      };
      if (collection === 'users') return { accountStatus: 'active' };
      if (collection === 'publicIdentifierCounters') return { nextSequence: 42 };
      return null;
    });
    const commits: unknown[][] = [];
    __test.captureCommits(commits);
    const response = await worker.fetch(request('/api/requests', {
      equipmentId: 'equipment-1', requestMode: 'fixed_days', numberOfDays: 2,
      startDate: '2026-01-10', endDate: '2026-01-11',
      publicRequestNumber: 'HV-REQ-999999',
    }, { Authorization: 'Bearer test' }), env);
    const body: any = await response.json();
    expect(response.status).toBe(201);
    expect(body.request.publicRequestNumber).toBe('HV-REQ-000042');
    expect(/^r_/.test(body.request.id)).toBe(true);
    const writes = commits[0] as any[];
    expect(writes.some(write => String(write.update?.name).includes('/publicIdentifierCounters/requests'))).toBe(true);
    expect(writes.find(write => String(write.update?.name).includes('/equipmentRequests/')).update.fields.publicRequestNumber.stringValue).toBe('HV-REQ-000042');
  });

  test('pending-review equipment is not rentable and new listings start pending with a public number', async () => {
    __test.setAuth({ uid: 'provider-1', admin: false });
    __test.setFirestore((collection) => {
      if (collection === 'users') return {
        role: 'provider', isVerified: true, nameAr: 'مزود', nameEn: 'Provider', avatar: '',
      };
      if (collection === 'publicIdentifierCounters') return { nextSequence: 7 };
      return null;
    });
    const commits: unknown[][] = [];
    __test.captureCommits(commits);
    const created = await worker.fetch(request('/api/listings', {
      titleAr: 'حفار', titleEn: 'Excavator', descriptionAr: 'وصف', descriptionEn: 'Description',
      pricePerDay: 500, images: [], availability: { from: '2026-01-01' },
    }, { Authorization: 'Bearer test' }), env);
    const createdBody: any = await created.json();
    expect(created.status).toBe(201);
    expect(createdBody.listing.moderationStatus).toBe('pending_review');
    expect(createdBody.listing.publicEquipmentNumber).toBe('HV-EQP-000007');
    const listingWrite = (commits[0] as any[]).find(write => String(write.update?.name).includes('/equipment/'));
    expect(listingWrite.update.fields.moderationStatus.stringValue).toBe('pending_review');
    expect(listingWrite.update.fields.visibility.stringValue).toBe('visible');

    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipment'
      ? { ownerUid: 'provider-1', isActive: true, visibility: 'visible', moderationStatus: 'pending_review', pricePerDay: 500 }
      : collection === 'users' ? { accountStatus: 'active' } : null);
    const unavailable = await worker.fetch(request('/api/requests', { equipmentId: 'listing-1', numberOfDays: 1 }, { Authorization: 'Bearer test' }), env);
    expect(unavailable.status).toBe(409);
  });

  test('driver registration uses the authenticated UID and begins pending review', async () => {
    __test.setAuth({ uid: 'driver-uid', admin: false });
    __test.setFirestore((collection) => collection === 'users'
      ? { accountStatus: 'active', nameAr: 'سائق', nameEn: 'Driver Name', phone: '+966500000000' }
      : null);
    const writes: Array<{ path: string; fields: Record<string, unknown> }> = [];
    __test.captureWrites(writes);
    const response = await worker.fetch(new Request('https://worker.test/api/drivers/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
      body: JSON.stringify({ displayName: 'Driver Name', region: 'Riyadh', city: 'Riyadh', equipmentTypes: ['crane'], yearsExperience: 4 }),
    }), env);
    expect(response.status).toBe(200);
    const profile = writes.find(write => write.path.startsWith('driverProfiles/driver-uid'));
    expect((profile?.fields.uid as any)?.stringValue).toBe('driver-uid');
    expect((profile?.fields.moderationStatus as any)?.stringValue).toBe('pending_review');
    expect((profile?.fields.active as any)?.booleanValue).toBe(false);
  });

  test('self-service invoice PDF is available only to canonical request participants', async () => {
    let payment: Record<string, unknown> | null = {
      requestId: 'r', customerUid: 'customer-1', amount: 115, currency: 'SAR',
      state: 'paid', invoiceId: 'INV-r-charge-1', provider: 'tap', providerReference: 'charge-1',
    };
    __test.setFirestore((collection, id) => {
      if (collection === 'users') return { accountStatus: 'active' };
      if (collection === 'invoices' && id === 'INV-r-charge-1') return {
        invoiceNumber: 'INV-r-charge-1', requestId: 'r', equipmentId: 'e',
        customerId: 'customer-1', providerId: 'provider-1', buyerName: 'Customer',
        sellerName: 'Provider', subtotal: 100, platformFee: 10, vatAmount: 15,
        totalAmount: 115, currency: 'SAR', status: 'paid', paymentReference: 'charge-1', createdAt: '2026-01-01T00:00:00.000Z',
      };
      if (collection === 'equipmentRequests') return {
        customerUid: 'customer-1', providerUid: 'provider-1', equipmentId: 'e',
        paymentStatus: 'paid', paymentState: 'paid', invoiceId: 'INV-r-charge-1',
        paymentId: 'charge-1', amount: 100, currency: 'SAR', publicRequestNumber: 'HV-REQ-000001',
        startDate: '2026-01-01', endDate: '2026-01-02',
      };
      if (collection === 'payments') return payment;
      if (collection === 'equipment') return { titleEn: 'Excavator' };
      return null;
    });
    __test.setAuth({ uid: 'customer-1', admin: false });
    const participant = await worker.fetch(new Request('https://worker.test/api/invoices/INV-r-charge-1.pdf', {
      headers: { Authorization: 'Bearer test' },
    }), env);
    expect(participant.status).toBe(200);
    expect(participant.headers.get('Content-Type')).toBe('application/pdf');
    expect(new TextDecoder().decode(await participant.arrayBuffer()).includes('Invoice Number')).toBe(true);

    __test.setAuth({ uid: 'outsider', admin: false });
    const outsider = await worker.fetch(new Request('https://worker.test/api/invoices/INV-r-charge-1.pdf', {
      headers: { Authorization: 'Bearer test' },
    }), env);
    expect(outsider.status).toBe(404);

    __test.setAuth({ uid: 'customer-1', admin: false });
    payment = { ...payment!, requestId: 'different-request' };
    const swappedRequest = await worker.fetch(new Request('https://worker.test/api/invoices/INV-r-charge-1.pdf', {
      headers: { Authorization: 'Bearer test' },
    }), env);
    expect(swappedRequest.status).toBe(404);

    payment = { ...payment!, requestId: 'r', invoiceId: 'other-invoice' };
    const swappedInvoice = await worker.fetch(new Request('https://worker.test/api/invoices/INV-r-charge-1.pdf', {
      headers: { Authorization: 'Bearer test' },
    }), env);
    expect(swappedInvoice.status).toBe(404);

    payment = { ...payment!, invoiceId: 'INV-r-charge-1', amount: 114 };
    const wrongTotal = await worker.fetch(new Request('https://worker.test/api/invoices/INV-r-charge-1.pdf', {
      headers: { Authorization: 'Bearer test' },
    }), env);
    expect(wrongTotal.status).toBe(404);

    payment = null;
    const missingSettlement = await worker.fetch(new Request('https://worker.test/api/invoices/INV-r-charge-1.pdf', {
      headers: { Authorization: 'Bearer test' },
    }), env);
    expect(missingSettlement.status).toBe(404);
  });

});