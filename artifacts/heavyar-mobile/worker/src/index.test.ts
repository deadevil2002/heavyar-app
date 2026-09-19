import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import worker, { __test, GCC_COUNTRIES, heavyarEmailVerificationTemplate, heavyarPasswordResetTemplate, normalizeGccPhone, type Env } from './index';

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
  beforeEach(() => { __test.setAuth(undefined); __test.setFirestore(undefined); __test.setAssetOwned(undefined); __test.setDeletionDevices(undefined); __test.setRefreshTokenRevoke(undefined); __test.setPasswordVerifier(undefined); __test.setCustomToken(undefined); __test.setPhoneLoginLimiter(undefined); __test.setPublicDriverLimiter(undefined); __test.captureDriverQueries(undefined); });
  afterEach(() => { __test.setAuth(undefined); __test.setFirestore(undefined); __test.setAssetOwned(undefined); __test.setDeletionDevices(undefined); __test.setRefreshTokenRevoke(undefined); __test.setPasswordVerifier(undefined); __test.setCustomToken(undefined); __test.setPhoneLoginLimiter(undefined); __test.setPublicDriverLimiter(undefined); __test.captureDriverQueries(undefined); __test.captureWrites(undefined); __test.captureCommits(undefined); __test.setReservationConflict(false); });

  test('Firestore RPC URLs use the documents colon endpoint form', () => {
    const firestoreEnv = { ...env, FIREBASE_PROJECT_ID: 'project-id' } as Env;
    expect(__test.firestoreUrl(firestoreEnv, ':commit').endsWith('/documents:commit')).toBe(true);
    expect(__test.firestoreUrl(firestoreEnv, ':runQuery').endsWith('/documents:runQuery')).toBe(true);
  });

  test('CORS permits only configured sites and scoped Expo preview origins', async () => {
    const expoOrigin = 'https://preview-123.expo.sisko.replit.dev';
    const expoDirectOrigin = 'https://preview-123.sisko.replit.dev';
    const allowed = await worker.fetch(new Request('https://worker.test/health', { headers: { Origin: expoOrigin } }), env);
    const directAllowed = await worker.fetch(new Request('https://worker.test/health', { headers: { Origin: expoDirectOrigin } }), env);
    const denied = await worker.fetch(new Request('https://worker.test/health', { headers: { Origin: 'https://attacker.example' } }), env);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(expoOrigin);
    expect(directAllowed.headers.get('Access-Control-Allow-Origin')).toBe(expoDirectOrigin);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBe('null');
  });

  test('CORS preflights allow the canonical website for early access and account deletion only by exact origin', async () => {
    const routes = [
      ['/api/early-access/config', 'GET'],
      ['/api/early-access/register', 'POST'],
      ['/api/account/deletion-request', 'POST'],
    ] as const;
    for (const [path, method] of routes) {
      const preflight = (origin: string) => worker.fetch(new Request(`https://worker.test${path}`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': method },
      }), env);
      const allowed = await preflight('https://heavyar.com');
      expect(allowed.status).toBe(204);
      expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://heavyar.com');
      expect((await preflight('https://evil.example')).headers.get('Access-Control-Allow-Origin')).toBe('null');
      expect((await preflight('https://heavyar.com.evil')).headers.get('Access-Control-Allow-Origin')).toBe('null');
      expect((await preflight('https://www.heavyar.com')).headers.get('Access-Control-Allow-Origin')).toBe('null');
    }
  });

  test('published SEO GET never overrides scoped CORS with a wildcard', async () => {
    const response = await worker.fetch(new Request('https://worker.test/api/seo/published', {
      headers: { Origin: 'https://heavyar.com' },
    }), env);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://heavyar.com');
    expect(response.headers.get('Vary')).toBe('Origin');

    const denied = await worker.fetch(new Request('https://worker.test/api/seo/published', {
      headers: { Origin: 'https://heavyar.com.evil' },
    }), env);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBe('null');
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
    expect((await worker.fetch(request('/api/send-email-otp', { email: 'a@example.com' }), env)).status).toBe(410);
    expect((await worker.fetch(request('/api/verify-email-otp', { email: 'a@example.com', code: '000000' }), env)).status).toBe(410);
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

  test('phone alias verifies transient email/password and mints the same UID token', async () => {
    const phone = '+966512345678', phoneHash = await __test.hashId(`phone:${phone}`);
    let supplied: [string, string] | undefined;
    __test.captureCommits([]);
    __test.setFirestore((collection) => collection === 'heavyarConfig' ? { allowPhoneLogin: true, phoneIndexReady: true }
      : collection === 'phoneOwners' ? { uid: 'uid-a', phoneHash }
      : collection === 'users' ? { uid: 'uid-a', email: 'private@example.com' } : null);
    __test.setPasswordVerifier(async (email, password) => { supplied = [email, password]; return { localId: 'uid-a' }; });
    __test.setCustomToken(async (uid) => `token-for-${uid}`);
    const response = await worker.fetch(request('/api/auth/alias-login', { phone: '0512345678', password: 'secret' }), { ...env, FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', FIREBASE_CLIENT_EMAIL: 'service@p', FIREBASE_PRIVATE_KEY: 'key' });
    expect(response.status).toBe(200); expect(JSON.stringify(await response.json())).toBe(JSON.stringify({ customToken: 'token-for-uid-a' }));
    expect(JSON.stringify(supplied)).toBe(JSON.stringify(['private@example.com', 'secret']));
    expect(JSON.stringify(supplied).includes('token-for-uid-a')).toBe(false);
  });

  test('unknown, malformed, wrong, collision, UID mismatch and blocked aliases are identical generic 401s', async () => {
    const responses: Response[] = [];
    const loginEnv = { ...env, FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', FIREBASE_CLIENT_EMAIL: 'service@p', FIREBASE_PRIVATE_KEY: 'key', OTP_KV: { get: async () => null, put: async () => {}, delete: async () => {} } } as Env;
    __test.setPasswordVerifier(async () => ({ localId: 'other' }));
    responses.push(await worker.fetch(request('/api/auth/alias-login', { phone: 'bad', password: 'x' }), loginEnv));
    __test.setFirestore(() => null);
    responses.push(await worker.fetch(request('/api/auth/alias-login', { phone: '0512345678', password: 'x' }), loginEnv));
    __test.setFirestore((collection) => collection === 'phoneOwners' ? { uid: 'uid-a', phoneHash: 'collision' } : collection === 'users' ? { uid: 'uid-a', email: 'x@example.com' } : collection === 'heavyarConfig' ? { allowPhoneLogin: true, phoneIndexReady: true } : null);
    responses.push(await worker.fetch(request('/api/auth/alias-login', { phone: '0512345678', password: 'x' }), loginEnv));
    expect(JSON.stringify(responses.map(x => x.status))).toBe(JSON.stringify([401, 401, 401]));
    const bodies = await Promise.all(responses.map(x => x.clone().text()));
    expect(bodies[1]).toBe(bodies[0]); expect(bodies[2]).toBe(bodies[0]);
  });

  test('alias login blocks suspended/deleted/disabled accounts after equivalent verification', async () => {
    const phone = '+966512345678', phoneHash = await __test.hashId(`phone:${phone}`);
    let calls = 0; __test.setPasswordVerifier(async () => { calls++; return { localId: 'uid-a' }; });
    __test.setFirestore((collection) => collection === 'heavyarConfig' ? { allowPhoneLogin: true, phoneIndexReady: true } : collection === 'phoneOwners' ? { uid: 'uid-a', phoneHash } : { uid: 'uid-a', email: 'a@example.com', suspensionStatus: 'temporarily_suspended' });
    const response = await worker.fetch(request('/api/auth/alias-login', { phone, password: 'x' }), { ...env, FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', FIREBASE_CLIENT_EMAIL: 's', FIREBASE_PRIVATE_KEY: 'k', OTP_KV: { get: async () => null, put: async () => {}, delete: async () => {} } } as Env);
    expect(response.status).toBe(401); expect(calls).toBe(1);
  });

  test('alias rate limit uses only hashed IP/phone keys and outages are generic 503', async () => {
    const keys: string[] = [];
    const phoneHash = await __test.hashId('phone:+966512345678');
    __test.setPhoneLoginLimiter(async (phoneHash, ipHash) => { keys.push(phoneHash, ipHash); return true; });
    __test.setFirestore((collection) => collection === 'heavyarConfig' ? { allowPhoneLogin: true, phoneIndexReady: true } : collection === 'phoneOwners' ? { uid: 'uid-a', phoneHash } : { uid: 'uid-a', email: 'a@example.com' });
    __test.setPasswordVerifier(async () => ({ localId: 'uid-a' })); __test.setCustomToken(async () => 'token');
    const loginEnv = { ...env, FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', FIREBASE_CLIENT_EMAIL: 's', FIREBASE_PRIVATE_KEY: 'k' } as Env;
    const response = await worker.fetch(request('/api/auth/alias-login', { phone: '0512345678', password: 'secret' }, { 'CF-Connecting-IP': '10.0.0.1' }), loginEnv);
    expect(response.status).toBe(200); expect(keys.length).toBe(2); expect(keys.some(key => key.includes('0512345678') || key.includes('10.0.0.1') || key.includes('secret'))).toBe(false);
    __test.setPhoneLoginLimiter(async () => false);
    expect((await worker.fetch(request('/api/auth/alias-login', { phone: '0512345678', password: 'secret' }), loginEnv)).status).toBe(429);
    __test.setPhoneLoginLimiter(async () => null);
    const unavailable = await worker.fetch(request('/api/auth/alias-login', { phone: '0512345678', password: 'secret' }), { ...env, FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', FIREBASE_CLIENT_EMAIL: 's', FIREBASE_PRIVATE_KEY: 'k' } as Env);
    expect(unavailable.status).toBe(503);
  });

  test('known and unknown valid aliases perform the same config-owner-user lookup sequence', async () => {
    const phone = '+966512345678', hash = await __test.hashId(`phone:${phone}`), seen: string[] = [];
    __test.setPhoneLoginLimiter(async () => true);
    __test.setPasswordVerifier(async () => ({ localId: 'never-issued' }));
    __test.setFirestore((collection, id) => {
      seen.push(collection);
      if (collection === 'heavyarConfig') return { allowPhoneLogin: true, phoneIndexReady: true };
      if (collection === 'phoneOwners' && id === hash) return { uid: 'uid-a', phoneHash: hash };
      if (collection === 'users' && id === 'uid-a') return { uid: 'uid-a', email: 'a@example.com' };
      return null;
    });
    const loginEnv = { ...env, FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', FIREBASE_CLIENT_EMAIL: 's', FIREBASE_PRIVATE_KEY: 'k' } as Env;
    await worker.fetch(request('/api/auth/alias-login', { phone, password: 'x' }), loginEnv);
    const known = seen.slice(); seen.length = 0;
    await worker.fetch(request('/api/auth/alias-login', { phone: '+966512345679', password: 'x' }), loginEnv);
    expect(JSON.stringify(known)).toBe(JSON.stringify(['heavyarConfig', 'phoneOwners', 'users']));
    expect(JSON.stringify(seen)).toBe(JSON.stringify(['heavyarConfig', 'phoneOwners', 'users']));
  });

  test('all account lock states block alias issuance after provider verification', async () => {
    const states = [
      { suspensionStatus: 'temporarily_suspended' }, { suspensionStatus: 'permanently_suspended' },
      { suspensionStatus: 'suspended' }, { accountStatus: 'restricted' },
      { accountStatus: 'deletion_requested' }, { status: 'deleted' }, { disabled: true },
    ];
    const phone = '+966512345678', hash = await __test.hashId(`phone:${phone}`);
    for (const state of states) {
      __test.setPhoneLoginLimiter(async () => true);
      __test.setPasswordVerifier(async () => ({ localId: 'uid-a' }));
      __test.setFirestore((collection) => collection === 'heavyarConfig' ? { allowPhoneLogin: true, phoneIndexReady: true } : collection === 'phoneOwners' ? { uid: 'uid-a', phoneHash: hash } : { uid: 'uid-a', email: 'a@example.com', ...state });
      const response = await worker.fetch(request('/api/auth/alias-login', { phone, password: 'x' }), { ...env, FIREBASE_PROJECT_ID: 'p', FIREBASE_WEB_API_KEY: 'k', FIREBASE_CLIENT_EMAIL: 's', FIREBASE_PRIVATE_KEY: 'k' } as Env);
      expect(response.status).toBe(401);
    }
  });

  test('Firebase custom token is signed and carries only the expected same UID claims', async () => {
    __test.setCustomToken(undefined);
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const token = await __test.mintFirebaseCustomToken({
      ...env,
      FIREBASE_PROJECT_ID: 'project-a',
      FIREBASE_CLIENT_EMAIL: 'service@project-a.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: privateKey,
    } as Env, 'uid-a');
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(JSON.stringify(JSON.parse(Buffer.from(header, 'base64url').toString()))).toBe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    expect(claims.uid).toBe('uid-a');
    expect(claims.iss).toBe('service@project-a.iam.gserviceaccount.com');
    expect(claims.sub).toBe(claims.iss);
    expect(claims.aud).toBe('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit');
    expect(claims.exp - claims.iat).toBe(3600);
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${payload}`);
    verifier.end();
    expect(verifier.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
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
    const email = 'new@example.com';
    __test.setAuth({ uid: 'role-user', email, admin: false });
    const commits: unknown[] = []; __test.captureCommits(commits);
    __test.setFirestore((collection) => collection === 'users' ? null : null);
    const response = await worker.fetch(request('/api/register-profile', { role: 'provider', termsAccepted: true, nameEn: 'Provider', region: 'Riyadh', city: 'Riyadh' }, { Authorization: 'Bearer test' }), { ...env, FIREBASE_PROJECT_ID: 'project' } as Env);
    expect(response.status).toBe(200);
    const writes: any[] = commits[0] as any[];
    const user = writes.find((write) => String(write.update?.name).includes('/users/'));
    expect(user.update.fields.role.stringValue).toBe('provider'); expect(user.update.fields.isVerified).toBe(undefined);
    expect(user.update.fields.providerType.stringValue).toBe('individual');
    const invalidCompany = await worker.fetch(request('/api/register-profile', { role: 'provider', providerType: 'company', crNumber: '123', termsAccepted: true, nameEn: 'Provider', region: 'Riyadh', city: 'Riyadh' }, { Authorization: 'Bearer test' }), { ...env, FIREBASE_PROJECT_ID: 'project' } as Env);
    expect((await invalidCompany.json()).errorCode).toBe('INVALID_REGISTRATION_DETAILS');
    __test.setFirestore((collection) => collection === 'users' ? null : collection === 'countryConfigs' ? { enabled: false } : null);
    const disabled = await worker.fetch(request('/api/register-profile', { role: 'customer', termsAccepted: true, nameEn: 'Customer', region: 'Riyadh', city: 'Riyadh' }, { Authorization: 'Bearer test' }), { ...env, FIREBASE_PROJECT_ID: 'project' } as Env);
    expect((await disabled.json()).errorCode).toBe('COUNTRY_DISABLED');
    __test.setFirestore((collection) => collection === 'users' ? null : collection === 'heavyarConfig' ? { phoneIndexReady: true } : null);
    const driver = await worker.fetch(request('/api/register-profile', { role: 'driver', termsAccepted: true, nameEn: 'Driver', phone: '512345678', region: 'R', city: 'C', customCity: 'Custom C' }, { Authorization: 'Bearer test' }), { ...env, FIREBASE_PROJECT_ID: 'project' } as Env);
    expect(driver.status).toBe(200);
    const driverWrites: any[] = [...commits].reverse().find((item: any) => Array.isArray(item) && item.some((write: any) => String(write.update?.name).includes('/driverProfiles/'))) as any[]; const profile = driverWrites.find((write) => String(write.update?.name).includes('/driverProfiles/'));
    expect(profile.update.fields.active.booleanValue).toBe(false); expect(profile.update.fields.moderationStatus.stringValue).toBe('pending_review'); expect(profile.update.fields.trustStatus.stringValue).toBe('unverified');
    expect(profile.update.fields.customCity.stringValue).toBe('Custom C');
    const noTerms = await worker.fetch(request('/api/register-profile', { role: 'customer' }, { Authorization: 'Bearer test' }), { ...env, FIREBASE_PROJECT_ID: 'project' } as Env);
    expect(noTerms.status).toBe(400);
    __test.setFirestore((collection) => collection === 'users' ? null : collection === 'phoneOwners' ? { uid: 'other' } : collection === 'heavyarConfig' ? { phoneIndexReady: true } : null);
    const collision = await worker.fetch(request('/api/register-profile', { role: 'customer', termsAccepted: true, phone: '512345678', nameEn: 'Customer', region: 'R', city: 'C' }, { Authorization: 'Bearer test' }), { ...env, FIREBASE_PROJECT_ID: 'project' } as Env);
    expect(collision.status).toBe(409); expect(commits.length).toBe(4);
  });

  test('OTP state requires server Firestore credentials', async () => {
    expect((await worker.fetch(request('/api/send-email-otp', { email: 'otp@example.com' }), { ...env, RESEND_API_KEY: 'test' })).status).toBe(410);
  });

  test('registration does not depend on a legacy grant and remains terms-protected', async () => {
    __test.setAuth({ uid: 'new-user', email: 'new@example.com', admin: false });
    __test.setFirestore((collection) => collection === 'users' ? null : {});
    const writes: Array<{ path: string; fields: Record<string, unknown> }> = []; const commits: unknown[] = []; __test.captureWrites(writes); __test.captureCommits(commits);
    const profileEnv = { ...env, FIREBASE_PROJECT_ID: 'test-project' } as Env;
    const response = await worker.fetch(request('/api/register-profile', { nameEn: 'New User', termsAccepted: true, region: 'Riyadh', city: 'Riyadh' }, { Authorization: 'Bearer test' }), profileEnv);
    expect(response.status).toBe(200);
    expect(commits.length).toBe(2);
    expect((await worker.fetch(request('/api/register-profile', { role: 'customer' }, { Authorization: 'Bearer test' }), profileEnv)).status).toBe(400);
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
    __test.setFirestore((collection, id) => collection === '__queries' && id === 'driverProfiles' ? [{
      id: 'd1', uid: 'd1', displayName: 'Driver', countryCode: 'SA', equipmentTypes: ['crane'], region: 'Riyadh', city: 'Riyadh',
      availableFrom: '2026-01-01', availableUntil: '2026-01-31', trustStatus: 'verified',
      phone: '+966500000000', email: 'private@test.invalid', privateNotes: 'secret', active: true, moderationStatus: 'approved',
    }] : collection === 'users' && id === 'd1' ? { role: 'driver', accountStatus: 'active', emailVerified: true, countryCode: 'SA' } : null);
    const canonical = await worker.fetch(new Request('https://worker.test/api/drivers/search?countryCode=SA&q=Driver&equipment=crane&availableFrom=2026-01-10&availableUntil=2026-01-20&trustStatus=verified&region=Riyadh&city=Riyadh'), env);
    expect(canonical.status).toBe(200);
    const body: any = await canonical.json(); expect(body.drivers.length).toBe(1);
    expect(body.drivers[0].id.startsWith('drv_')).toBe(true);
    expect(body.drivers[0].id.includes('d1')).toBe(false);
    expect(body.drivers[0].countryCode).toBe('SA');
    expect(JSON.stringify(body).includes('privateNotes')).toBe(false);
    expect(JSON.stringify(body).includes('phone')).toBe(false);
    expect(JSON.stringify(body).includes('email')).toBe(false);
    expect(JSON.stringify(body).includes('uid')).toBe(false);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?equipment=excavator'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?availableFrom=2026-02-01'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?availableUntil=2025-12-01'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?availableFrom=bad'), env)).status).toBe(400);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?availableFrom=2026-02-01&availableUntil=2026-01-01'), env)).status).toBe(400);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search?equipmentType=crane'), env)).status).toBe(400);
  });

  test('driver discovery applies account, market, safe-field filters and opaque pagination', async () => {
    const profiles: any[] = [
      { id: 'driver-a', displayName: 'Ahmed Operator', countryCode: 'SA', region: 'Riyadh', city: 'Riyadh', equipmentTypes: ['crane'], availabilityStatus: 'available', active: true, moderationStatus: 'approved' },
      { id: 'driver-b', displayName: 'Bader Driver', countryCode: 'SA', region: 'Makkah', city: 'Jeddah', equipmentTypes: ['loader'], availabilityStatus: 'offline', active: true, moderationStatus: 'approved' },
      { id: 'driver-restricted', displayName: 'Private Name Match', countryCode: 'SA', region: 'Riyadh', city: 'Riyadh', equipmentTypes: ['crane'], availabilityStatus: 'available', active: true, moderationStatus: 'approved', email: 'search-me@example.test', phone: '0555555555' },
      { id: 'driver-ae', displayName: 'UAE Driver', countryCode: 'AE', region: 'Dubai', city: 'Dubai', equipmentTypes: ['crane'], availabilityStatus: 'available', active: true, moderationStatus: 'approved' },
    ];
    __test.setFirestore((collection, id) => {
      if (collection === '__queries' && id === 'driverProfiles') return profiles;
      if (collection === 'users') return {
        role: 'driver', accountStatus: id === 'driver-restricted' ? 'restricted' : 'active',
        emailVerified: true, countryCode: id === 'driver-ae' ? 'AE' : 'SA',
      };
      if (collection === 'countryConfigs' && id === 'AE') return { enabled: false, marketplaceAvailable: false };
      return null;
    });
    const queryShapes: any[] = [];
    __test.captureDriverQueries(queryShapes);
    const first: any = await (await worker.fetch(new Request('https://worker.test/api/drivers/search?countryCode=SA&limit=1'), env)).json();
    expect(first.drivers.length).toBe(1);
    expect(queryShapes[0].where.fieldFilter.field.fieldPath).toBe('active');
    expect(queryShapes[0].where.compositeFilter).toBe(undefined);
    expect(JSON.stringify(queryShapes[0].orderBy)).toBe(JSON.stringify([{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]));
    expect(first.nextCursor.startsWith('drv_')).toBe(true);
    expect(first.nextCursor.includes('driver-a')).toBe(false);
    const second: any = await (await worker.fetch(new Request(`https://worker.test/api/drivers/search?countryCode=SA&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`), env)).json();
    expect(second.drivers.length).toBe(1);
    expect(second.drivers[0].displayName).toBe('Bader Driver');
    const filtered: any = await (await worker.fetch(new Request('https://worker.test/api/drivers/search?countryCode=SA&q=Ahmed&region=Riyadh&city=Riyadh&equipment=crane&availabilityStatus=available'), env)).json();
    expect(filtered.drivers.length).toBe(1);
    const privateEmail: any = await (await worker.fetch(new Request('https://worker.test/api/drivers/search?countryCode=SA&q=search-me'), env)).json();
    expect(privateEmail.drivers.length).toBe(0);
    const disabled: any = await (await worker.fetch(new Request('https://worker.test/api/drivers/search?countryCode=AE'), env)).json();
    expect(disabled.drivers.length).toBe(0);
  });

  test('public driver endpoints use Firestore-backed hashed-IP scopes without a KV binding and fail closed', async () => {
    const keys: string[] = [];
    __test.setPublicDriverLimiter(async (scope, ipHash) => { keys.push(`${scope}:${ipHash}`); return false; });
    const response = await worker.fetch(new Request('https://worker.test/api/drivers/search', {
      headers: { 'CF-Connecting-IP': '203.0.113.42' },
    }), env);
    expect(response.status).toBe(429);
    expect(keys[0].startsWith('search:')).toBe(true);
    expect(keys[0].includes('203.0.113.42')).toBe(false);
    __test.setPublicDriverLimiter(async (scope, ipHash) => { keys.push(`${scope}:${ipHash}`); return false; });
    const detail = await worker.fetch(new Request('https://worker.test/api/drivers/public/drv_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', {
      headers: { 'CF-Connecting-IP': '203.0.113.42' },
    }), env);
    expect(detail.status).toBe(429);
    expect(keys[keys.length - 1].startsWith('detail:')).toBe(true);
    __test.setPublicDriverLimiter(async () => null);
    expect((await worker.fetch(new Request('https://worker.test/api/drivers/search'), env)).status).toBe(503);
  });

  test('production-shaped public search uses Firestore limiter and single-index REST queries without KV', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const runtimeEnv = {
      ...env, FIREBASE_PROJECT_ID: 'project', FIREBASE_CLIENT_EMAIL: 'service@project.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    } as Env;
    const calls: Array<{ url: string; body: any }> = [], oldFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      let body: any;
      try { body = init?.body ? JSON.parse(String(init.body)) : undefined; } catch { body = String(init?.body || ''); }
      calls.push({ url, body });
      if (url.includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'token' }));
      if (url.includes(':beginTransaction')) return new Response(JSON.stringify({ transaction: 'transaction-1' }));
      if (url.includes(':batchGet')) return new Response(JSON.stringify([{ missing: body.documents[0] }]));
      if (url.includes(':commit')) return new Response(JSON.stringify({}));
      if (url.includes('/countryConfigs/SA')) return new Response('', { status: 404 });
      if (url.includes('/users/customer')) return new Response(JSON.stringify({ fields: {
        role: { stringValue: 'customer' }, accountStatus: { stringValue: 'active' }, emailVerified: { booleanValue: true },
      } }));
      if (url.includes(':runQuery')) return new Response(JSON.stringify([]));
      return new Response('', { status: 404 });
    }) as typeof fetch;
    try {
      const response = await worker.fetch(new Request('https://worker.test/api/drivers/search?countryCode=SA', {
        headers: { 'CF-Connecting-IP': '198.51.100.20' },
      }), runtimeEnv);
      expect(response.status).toBe(200);
      const batch = calls.find(call => call.url.includes(':batchGet'));
      expect(JSON.stringify(batch?.body).includes('/publicDriverRateLimits/')).toBe(true);
      expect(JSON.stringify(batch?.body).includes('198.51.100.20')).toBe(false);
      const query = calls.find(call => call.url.includes(':runQuery'))?.body.structuredQuery;
      expect(query.where.fieldFilter.field.fieldPath).toBe('active');
      expect(query.where.compositeFilter).toBe(undefined);
      expect(JSON.stringify(query.orderBy)).toBe(JSON.stringify([{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]));
      __test.setAuth({ uid: 'customer', admin: false, emailVerified: true });
      const list = await worker.fetch(new Request('https://worker.test/api/drivers/requests?limit=10', { headers: { Authorization: 'Bearer test' } }), runtimeEnv);
      expect(list.status).toBe(200);
      const requestQuery = calls.filter(call => call.url.includes(':runQuery')).map(call => call.body.structuredQuery)
        .find(queryShape => queryShape.from?.[0]?.collectionId === 'driverRequests');
      expect(requestQuery.where.fieldFilter.field.fieldPath).toBe('requesterUid');
      expect(requestQuery.where.compositeFilter).toBe(undefined);
      expect(JSON.stringify(requestQuery.orderBy)).toBe(JSON.stringify([{ field: { fieldPath: '__name__' }, direction: 'DESCENDING' }]));
    } finally {
      __test.setAuth(undefined);
      globalThis.fetch = oldFetch;
    }
  });

  test('driver scan-budget exhaustion returns an opaque resumable cursor without losing later matches', async () => {
    const profiles = Array.from({ length: 1001 }, (_, index) => ({
      id: `driver-${String(index).padStart(4, '0')}`,
      displayName: index === 1000 ? 'Needle Driver' : `Other ${index}`,
      countryCode: 'SA', active: true, moderationStatus: 'approved',
    }));
    __test.setFirestore((collection, id) => {
      if (collection === '__queries' && id === 'driverProfiles') return profiles;
      if (collection === 'users') return { role: 'driver', accountStatus: 'active', emailVerified: true, countryCode: 'SA' };
      return null;
    });
    const first: any = await (await worker.fetch(new Request('https://worker.test/api/drivers/search?countryCode=SA&q=Needle'), env)).json();
    expect(first.drivers.length).toBe(0);
    expect(first.nextCursor.startsWith('drv_')).toBe(true);
    expect(first.nextCursor.includes('driver-0999')).toBe(false);
    const second: any = await (await worker.fetch(new Request(`https://worker.test/api/drivers/search?countryCode=SA&q=Needle&cursor=${encodeURIComponent(first.nextCursor)}`), env)).json();
    expect(second.drivers.length).toBe(1);
    expect(second.drivers[0].displayName).toBe('Needle Driver');
  });

  test('public detail and driver requests resolve opaque identity and retain only canonical private UIDs', async () => {
    const profiles: any[] = [{
      id: 'driver-uid', displayName: 'Canonical Driver', countryCode: 'SA', region: 'Riyadh', city: 'Riyadh',
      equipmentTypes: ['crane'], availabilityStatus: 'available', active: true, moderationStatus: 'approved',
      email: 'private@example.test', phone: '+966500000000',
    }];
    let requestRecord: any = null;
    __test.setFirestore((collection, id) => {
      if (collection === '__queries' && id === 'driverProfiles') return profiles;
      if (collection === '__queries' && id === 'driverRequests') return requestRecord ? [{ id: 'request-1', ...requestRecord }] : [];
      if (collection === 'driverRequests' && id === 'request-1') return requestRecord;
      if (collection === 'driverProfiles' && id === 'driver-uid') return profiles[0];
      if (collection === 'users' && id === 'driver-uid') return { role: 'driver', accountStatus: 'active', emailVerified: true, nameEn: 'Canonical Driver', countryCode: 'SA' };
      if (collection === 'users' && id === 'customer-uid') return { role: 'customer', accountStatus: 'active', emailVerified: true, nameEn: 'Customer' };
      return null;
    });
    const discovery: any = await (await worker.fetch(new Request('https://worker.test/api/drivers/search?countryCode=SA'), env)).json();
    const publicId = discovery.drivers[0].id;
    const detail = await worker.fetch(new Request(`https://worker.test/api/drivers/public/${publicId}`), env);
    expect(detail.status).toBe(200);
    expect(JSON.stringify(await detail.json()).includes('driver-uid')).toBe(false);

    __test.setAuth({ uid: 'customer-uid', admin: false, emailVerified: true });
    const writes: Array<{ path: string; fields: Record<string, unknown> }> = [];
    __test.captureWrites(writes);
    const created = await worker.fetch(request('/api/drivers/requests', { driverId: publicId, notes: 'Crane in Riyadh on 2026-01-10' }, { Authorization: 'Bearer test' }), env);
    expect(created.status).toBe(201);
    const persisted = writes.find(write => write.path.startsWith('driverRequests/'));
    expect((persisted?.fields.driverUid as any).stringValue).toBe('driver-uid');
    expect(JSON.stringify(await created.json()).includes('driver-uid')).toBe(false);

    requestRecord = { requesterUid: 'customer-uid', driverUid: 'driver-uid', status: 'open', notes: 'Need crane', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    const listed: any = await (await worker.fetch(new Request('https://worker.test/api/drivers/requests', { headers: { Authorization: 'Bearer test' } }), env)).json();
    expect(listed.requests.length).toBe(1);
    expect(listed.requests[0].isRequester).toBe(true);
    expect(JSON.stringify(listed).includes('customer-uid')).toBe(false);
    expect(JSON.stringify(listed).includes('driver-uid')).toBe(false);
  });

  test('driver requests enforce requester roles, live target eligibility and action authority', async () => {
    const profile: any = { id: 'driver-uid', displayName: 'Driver', countryCode: 'SA', active: true, moderationStatus: 'approved' };
    const accounts: Record<string, any> = {
      'driver-uid': { role: 'driver', accountStatus: 'active', emailVerified: true, countryCode: 'SA' },
      provider: { role: 'provider', accountStatus: 'active', emailVerified: true },
      customer: { role: 'customer', accountStatus: 'active', emailVerified: true },
      other: { role: 'customer', accountStatus: 'active', emailVerified: true },
      restricted: { role: 'customer', accountStatus: 'restricted', emailVerified: true },
      suspended: { role: 'customer', accountStatus: 'active', suspensionStatus: 'temporarily_suspended', emailVerified: true },
      deleting: { role: 'customer', accountStatus: 'deletion_requested', emailVerified: true },
    };
    let requestState: any = { requesterUid: 'customer', driverUid: 'driver-uid', status: 'open', notes: 'Need driver', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
    __test.setFirestore((collection, id) => {
      if (collection === '__queries' && id === 'driverProfiles') return [profile];
      if (collection === 'driverProfiles' && id === 'driver-uid') return profile;
      if (collection === 'driverRequests' && id === 'request-1') return requestState;
      if (collection === 'users') return accounts[id];
      return null;
    });
    const publicId = (await (await worker.fetch(new Request('https://worker.test/api/drivers/search'), env)).json() as any).drivers[0].id;
    __test.captureWrites([]);
    const createAs = async (uid: string) => {
      __test.setAuth({ uid, admin: false, emailVerified: true });
      return worker.fetch(request('/api/drivers/requests', { driverId: publicId, notes: 'Need operator' }, { Authorization: 'Bearer test' }), env);
    };
    expect((await createAs('provider')).status).toBe(201);
    expect((await createAs('driver-uid')).status).toBe(403);
    expect((await createAs('restricted')).status).toBe(403);
    expect((await createAs('suspended')).status).toBe(403);
    expect((await createAs('deleting')).status).toBe(403);
    profile.active = false;
    expect((await createAs('customer')).status).toBe(400);
    profile.active = true;

    __test.setAuth({ uid: 'driver-uid', admin: false, emailVerified: true });
    expect((await worker.fetch(request('/api/drivers/requests/request-1', { action: 'bogus' }, { Authorization: 'Bearer test' }), env)).status).toBe(409);
    expect((await worker.fetch(request('/api/drivers/requests/request-1', { action: 'accept' }, { Authorization: 'Bearer test' }), env)).status).toBe(200);
    expect((await worker.fetch(request('/api/drivers/requests/request-1', { action: 'decline' }, { Authorization: 'Bearer test' }), env)).status).toBe(200);
    requestState = { ...requestState, status: 'accepted' };
    expect((await worker.fetch(request('/api/drivers/requests/request-1', { action: 'accept' }, { Authorization: 'Bearer test' }), env)).status).toBe(409);
    expect((await worker.fetch(request('/api/drivers/requests/request-1', { action: 'close' }, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    __test.setAuth({ uid: 'customer', admin: false, emailVerified: true });
    expect((await worker.fetch(request('/api/drivers/requests/request-1', { action: 'close' }, { Authorization: 'Bearer test' }), env)).status).toBe(200);
    __test.setAuth({ uid: 'other', admin: false, emailVerified: true });
    expect((await worker.fetch(request('/api/drivers/requests/request-1', { action: 'close' }, { Authorization: 'Bearer test' }), env)).status).toBe(404);
  });

  test('driver request lists are participant-scoped and cursor-paginated beyond the former cap', async () => {
    const requests = Array.from({ length: 101 }, (_, index) => ({
      id: `request-${String(index).padStart(3, '0')}`, requesterUid: 'customer', driverUid: 'driver-uid',
      status: 'open', notes: String(index), createdAt: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`, updatedAt: '2026-01-01',
    }));
    requests.push({ id: 'request-unrelated', requesterUid: 'other', driverUid: 'other-driver', status: 'open', notes: 'private', createdAt: '2099-01-01T00:00:00.000Z', updatedAt: '2099-01-01' });
    __test.setAuth({ uid: 'customer', admin: false, emailVerified: true });
    __test.setFirestore((collection, id) => {
      if (collection === '__queries' && id === 'driverRequests') return requests;
      if (collection === 'driverRequests') return requests.find(item => item.id === id) || null;
      if (collection === 'driverProfiles' && id === 'driver-uid') return { displayName: 'Driver', countryCode: 'SA', active: true, moderationStatus: 'approved' };
      if (collection === 'users' && id === 'customer') return { role: 'customer', accountStatus: 'active', emailVerified: true, nameEn: 'Customer' };
      if (collection === 'users' && id === 'driver-uid') return { role: 'driver', accountStatus: 'active', emailVerified: true, countryCode: 'SA' };
      return null;
    });
    const queryShapes: any[] = [];
    __test.captureDriverQueries(queryShapes);
    const first: any = await (await worker.fetch(new Request('https://worker.test/api/drivers/requests?limit=50', { headers: { Authorization: 'Bearer test' } }), env)).json();
    expect(first.requests.length).toBe(50);
    expect(queryShapes[0].where.fieldFilter.field.fieldPath).toBe('requesterUid');
    expect(JSON.stringify(queryShapes[0].orderBy)).toBe(JSON.stringify([{ field: { fieldPath: '__name__' }, direction: 'DESCENDING' }]));
    expect(first.nextCursor.startsWith('request-')).toBe(true);
    expect(JSON.stringify(first).includes('driverUid')).toBe(false);
    const second: any = await (await worker.fetch(new Request(`https://worker.test/api/drivers/requests?limit=50&cursor=${first.nextCursor}`, { headers: { Authorization: 'Bearer test' } }), env)).json();
    expect(second.requests.length).toBe(50);
    expect(second.nextCursor.startsWith('request-')).toBe(true);
    const third: any = await (await worker.fetch(new Request(`https://worker.test/api/drivers/requests?limit=50&cursor=${second.nextCursor}`, { headers: { Authorization: 'Bearer test' } }), env)).json();
    expect(third.requests.length).toBe(1);
    expect(third.nextCursor).toBe(undefined);
    expect(JSON.stringify(first).includes('private')).toBe(false);
    __test.setAuth({ uid: 'driver-uid', admin: false, emailVerified: true });
    const incoming: any = await (await worker.fetch(new Request('https://worker.test/api/drivers/requests?limit=1', { headers: { Authorization: 'Bearer test' } }), env)).json();
    expect(incoming.requests.length).toBe(1);
    expect(incoming.requests[0].isRequester).toBe(false);
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

  test('pending-review equipment is not rentable and eligible new listings publish with a public number', async () => {
    __test.setAuth({ uid: 'provider-1', admin: false });
    __test.setFirestore((collection) => {
      if (collection === 'users') return {
        role: 'provider', isVerified: true, nameAr: 'مزود', nameEn: 'Provider', avatar: '', termsAccepted: true, countryCode: 'SA', region: 'Riyadh', city: 'Riyadh',
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
      expect(createdBody.listing.moderationStatus).toBe('approved');
    expect(createdBody.listing.publicEquipmentNumber).toBe('HV-EQP-000007');
    const listingWrite = (commits[0] as any[]).find(write => String(write.update?.name).includes('/equipment/'));
    expect(listingWrite.update.fields.moderationStatus.stringValue).toBe('approved');
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
      ? { role: 'driver', accountStatus: 'active', nameAr: 'سائق', nameEn: 'Driver Name', phone: '+966500000000' }
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

  test('owner profile edits preserve Admin inactivity and reject stale writes', async () => {
    __test.setAuth({ uid: 'driver-uid', admin: false, emailVerified: true });
    __test.setFirestore((collection) => collection === 'users'
      ? { role: 'driver', accountStatus: 'active', emailVerified: true, countryCode: 'SA', nameEn: 'Driver' }
      : collection === 'driverProfiles' ? {
        publicId: 'legacy-value', displayName: 'Driver', countryCode: 'SA', region: 'Riyadh', city: 'Riyadh',
        equipmentTypes: ['crane'], active: false, moderationStatus: 'approved',
      } : null);
    const writes: Array<{ path: string; fields: Record<string, unknown> }> = [];
    __test.captureWrites(writes);
    const updated = await worker.fetch(new Request('https://worker.test/api/drivers/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
      body: JSON.stringify({ availabilityStatus: 'available' }),
    }), env);
    expect(updated.status).toBe(200);
    expect((writes[0].fields.active as any).booleanValue).toBe(false);
    expect((writes[0].fields.moderationStatus as any).stringValue).toBe('approved');

    __test.setReservationConflict(true);
    const stale = await worker.fetch(new Request('https://worker.test/api/drivers/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
      body: JSON.stringify({ city: 'Jeddah' }),
    }), env);
    expect(stale.status).toBe(409);
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

describe('GCC and email verification architecture', () => {
  test('supports every GCC phone format and canonical E.164 output', () => {
    expect(JSON.stringify(normalizeGccPhone('0551234567', 'SA'))).toBe(JSON.stringify({ phone: '+966551234567', countryCode: 'SA' }));
    expect(JSON.stringify(normalizeGccPhone('+971501234567'))).toBe(JSON.stringify({ phone: '+971501234567', countryCode: 'AE' }));
    expect(JSON.stringify(normalizeGccPhone('55123456', 'KW'))).toBe(JSON.stringify({ phone: '+96555123456', countryCode: 'KW' }));
    expect(JSON.stringify(normalizeGccPhone('+97433123456'))).toBe(JSON.stringify({ phone: '+97433123456', countryCode: 'QA' }));
    expect(JSON.stringify(normalizeGccPhone('36123456', 'BH'))).toBe(JSON.stringify({ phone: '+97336123456', countryCode: 'BH' }));
    expect(JSON.stringify(normalizeGccPhone('91234567', 'OM'))).toBe(JSON.stringify({ phone: '+96891234567', countryCode: 'OM' }));
    expect(normalizeGccPhone('123', 'AE')).toBe(null);
  });

  test('normalizes 00-prefixed GCC aliases for mobile login and password recovery paths', () => {
    const aliases: Array<[string, string]> = [
      ['00971501234567', '+971501234567'],
      ['0096555123456', '+96555123456'],
      ['0097433123456', '+97433123456'],
      ['0097336123456', '+97336123456'],
      ['0096891234567', '+96891234567'],
    ];
    for (const [input, expected] of aliases) {
      expect(normalizeGccPhone(input)?.phone).toBe(expected);
    }
  });

  test('keeps Saudi active while other GCC markets remain architecture-ready', () => {
    expect(JSON.stringify(Object.keys(GCC_COUNTRIES))).toBe(JSON.stringify(['SA', 'AE', 'KW', 'QA', 'BH', 'OM']));
    expect(GCC_COUNTRIES.SA.enabled).toBe(true);
    expect(Object.values(GCC_COUNTRIES).filter(country => country.enabled).length).toBe(1);
    expect(GCC_COUNTRIES.AE.currency).toBe('AED');
    expect(GCC_COUNTRIES.KW.currency).toBe('KWD');
    expect(GCC_COUNTRIES.QA.currency).toBe('QAR');
    expect(GCC_COUNTRIES.BH.currency).toBe('BHD');
    expect(GCC_COUNTRIES.OM.currency).toBe('OMR');
  });

  test('branded templates escape action links and include bilingual security copy', () => {
    const verification = heavyarEmailVerificationTemplate('https://example.test/?a=1&b=2', 'A <User>');
    const reset = heavyarPasswordResetTemplate('https://example.test/reset?a=1&b=2');
    expect(verification.includes('Verify your email')).toBe(true);
    expect(verification.includes('وثّق بريدك الإلكتروني')).toBe(true);
    expect(verification.includes('&amp;')).toBe(true);
    expect(verification.includes('A <User>')).toBe(false);
    expect(verification.indexOf('dir="rtl"') < verification.indexOf('dir="ltr"')).toBe(true);
    expect(verification.includes('support@mail.heavyar.com')).toBe(true);
    expect(verification.includes('Firebase')).toBe(true);
    expect(reset.includes('Reset password')).toBe(true);
    expect(reset.includes('Heavyar')).toBe(true);
    expect(reset.includes('support@mail.heavyar.com')).toBe(true);
    const englishFirst = heavyarEmailVerificationTemplate('https://example.test/verify', 'User', undefined, 'en');
    expect(englishFirst.indexOf('dir="ltr"') < englishFirst.indexOf('dir="rtl"')).toBe(true);
  });

  test('production Resend sender is restricted to the verified mail subdomain', () => {
    expect(__test.resendFrom({})).toBe('Heavyar <noreply@mail.heavyar.com>');
    expect(__test.resendSenderDomainValid('Heavyar <noreply@mail.heavyar.com>')).toBe(true);
    expect(__test.resendSenderDomainValid('Heavyar <noreply@heavyar.app>')).toBe(false);
    expect(__test.resendSenderDomainValid('Heavyar <noreply@other.mail.heavyar.com>')).toBe(false);
  });

  test('email verification cooldown defaults to one day and never drops below five minutes', () => {
    expect(__test.normalizeEmailVerificationPolicy({}).reminderCooldownSeconds).toBe(86400);
    expect(__test.normalizeEmailVerificationPolicy({ reminderCooldownSeconds: 60 }).reminderCooldownSeconds).toBe(300);
  });

  test('market configuration exposes disabled FX and future phone verification without SMS activation', async () => {
    const response = await worker.fetch(new Request('https://worker.test/api/config/markets', { headers: { Origin: 'http://localhost' } }), env);
    expect(response.status).toBe(200);
    const value: any = await response.json();
    expect(value.fx.enabled).toBe(false);
    expect(value.fx.provider).toBe(null);
    expect(value.phoneVerification.enabled).toBe(false);
    expect(value.phoneVerification.provider).toBe(null);
  });

});