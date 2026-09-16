import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import worker, { __test, type Env } from './index';

const env = { CORS_ORIGINS: 'http://localhost' } as Env;
const request = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://worker.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

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

  test('unauthenticated lifecycle endpoints return 401', async () => {
    expect((await worker.fetch(request('/api/start-request', { requestId: 'r' }), env)).status).toBe(401);
    expect((await worker.fetch(request('/api/confirm-completion', { requestId: 'r' }), env)).status).toBe(401);
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
    expect(response.status).toBe(200);
    expect((writes[0].fields.finalAmount as any).doubleValue).toBe(200);
    expect((writes[0].fields.finalPlatformFee as any).doubleValue).toBe(20);
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
      expect(response.status).toBe(409);
      expect(tapCalled).toBe(false);
    } finally { globalThis.fetch = old; }
  });

  test('payment uses canonical reservation fields, VAT math, and stable Tap idempotency', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests'
      ? { id: 'r', customerUid: 'customer-1', status: 'completed', amount: 100, paymentStatus: 'unpaid', equipmentId: 'e' } : {});
    const writes: Array<{ path: string; fields: Record<string, unknown> }> = [];
    __test.captureWrites(writes);
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
      expect((writes[0].fields.paymentStatus as any).stringValue).toBe('pending_payment');
      expect((writes[0].fields.paymentId as any).stringValue).toBe('reservation:heavyar-payment:customer-1:r');
      expect((writes[1].fields.paymentId as any).stringValue).toBe('charge-1');
    } finally { globalThis.fetch = old; __test.captureWrites(undefined); }
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
    expect((await worker.fetch(request('/api/create-payment', { requestId: 'r', amount: 1 }, { Authorization: 'Bearer test' }), env)).status).toBe(403);
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
});