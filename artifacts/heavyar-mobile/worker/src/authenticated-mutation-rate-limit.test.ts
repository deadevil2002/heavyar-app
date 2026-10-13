import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import worker, { __test, type Env } from './index';

type StoredDocument = { fields: Record<string, any>; updateTime: string; version: number };

function firestoreHarness(options: { fail?: boolean } = {}) {
  const documents = new Map<string, StoredDocument>();
  const transactions = new Map<string, Map<string, number | null>>();
  const calls: string[] = [];
  let transactionSequence = 0;
  let versionSequence = 0;

  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'rate-limit-token', expires_in: 3600 });
    const operation = url.includes(':beginTransaction') ? 'begin'
      : url.includes(':commit') ? 'commit'
        : url.includes(':rollback') ? 'rollback'
          : url.includes('/documents/authRecoveryRateLimits/') ? 'read'
            : 'other';
    calls.push(operation);
    if (options.fail && operation !== 'other') return Response.json({ error: { status: 'UNAVAILABLE' } }, { status: 503 });
    if (operation === 'begin') {
      const id = `tx-${++transactionSequence}`;
      transactions.set(id, new Map());
      return Response.json({ transaction: id });
    }
    if (operation === 'read') {
      const parsed = new URL(url);
      const transaction = parsed.searchParams.get('transaction') || '';
      const name = decodeURIComponent(parsed.pathname.split('/documents/')[1]);
      const current = documents.get(name);
      transactions.get(transaction)?.set(name, current?.version ?? null);
      await Promise.resolve();
      return current
        ? Response.json({ name: `projects/test-project/databases/(default)/documents/${name}`, fields: current.fields, updateTime: current.updateTime })
        : new Response('', { status: 404 });
    }
    if (operation === 'commit') {
      const body = JSON.parse(String(init?.body || '{}'));
      const snapshot = transactions.get(String(body.transaction || ''));
      const writes = Array.isArray(body.writes) ? body.writes : [];
      for (const write of writes) {
        const name = String(write.update?.name || '').split('/documents/')[1] || '';
        const observed = snapshot?.get(name);
        const current = documents.get(name);
        if (observed === undefined || observed !== (current?.version ?? null)) {
          return Response.json({ error: { status: 'ABORTED' } }, { status: 409 });
        }
      }
      for (const write of writes) {
        const name = String(write.update.name).split('/documents/')[1];
        const version = ++versionSequence;
        documents.set(name, { fields: write.update.fields, version, updateTime: `2026-10-11T00:00:${String(version).padStart(2, '0')}.000000Z` });
      }
      transactions.delete(String(body.transaction || ''));
      return Response.json({});
    }
    if (operation === 'rollback') {
      const body = JSON.parse(String(init?.body || '{}'));
      transactions.delete(String(body.transaction || ''));
      return Response.json({});
    }
    return new Response('', { status: 404 });
  };
  return { calls, documents, fetch: fetch as typeof globalThis.fetch };
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  FIREBASE_PROJECT_ID: 'test-project',
  FIREBASE_CLIENT_EMAIL: 'service@test-project.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  CORS_ORIGINS: 'https://heavyar.com',
} as Env;
const originalFetch = globalThis.fetch;

describe('durable authenticated mutation rate limiting', () => {
  beforeEach(() => {
    __test.resetMutationLimits();
    __test.setFirestore(undefined);
    __test.captureWrites(undefined);
    __test.captureCommits(undefined);
    __test.setAuth(undefined);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    __test.resetMutationLimits();
    __test.setAuth(undefined);
  });

  test('preserves the listing and driver quotas with accurate retry timing and isolated hashed keys', async () => {
    const firestore = firestoreHarness();
    globalThis.fetch = firestore.fetch;
    const now = 1_800_000_000_000;

    const listing = [];
    for (let attempt = 0; attempt < 10; attempt += 1) listing.push(await __test.allowAuthenticatedMutation(env, 'provider-private-uid', 'listing_create', now));
    expect(listing.every(result => result.status === 'allowed')).toBe(true);
    expect(await __test.allowAuthenticatedMutation(env, 'provider-private-uid', 'listing_create', now)).toEqual({ status: 'limited', retryAfterSeconds: 600 });
    expect((await __test.allowAuthenticatedMutation(env, 'provider-private-uid', 'listing_create', now + 599_001))).toEqual({ status: 'limited', retryAfterSeconds: 1 });
    expect((await __test.allowAuthenticatedMutation(env, 'provider-private-uid', 'listing_create', now + 600_000)).status).toBe('allowed');

    const firstDriver = [];
    for (let attempt = 0; attempt < 30; attempt += 1) firstDriver.push(await __test.allowAuthenticatedMutation(env, 'driver-a', 'driver_profile_save', now));
    expect(firstDriver.filter(result => result.status === 'allowed')).toHaveLength(30);
    expect((await __test.allowAuthenticatedMutation(env, 'driver-a', 'driver_profile_save', now)).status).toBe('limited');
    expect((await __test.allowAuthenticatedMutation(env, 'driver-b', 'driver_profile_save', now)).status).toBe('allowed');

    const serialized = JSON.stringify([...firestore.documents.entries()]);
    expect(serialized).not.toContain('provider-private-uid');
    expect(serialized).not.toContain('driver-a');
    expect(serialized).not.toContain('driver-b');
    expect([...firestore.documents.keys()].every(key => /^authRecoveryRateLimits\/[A-Za-z0-9_-]{43}$/.test(key))).toBe(true);
    expect(firestore.documents.size).toBe(3);
  });

  test('concurrent callers and separate Worker instances share Firestore authority without exceeding quota', async () => {
    const firestore = firestoreHarness();
    globalThis.fetch = firestore.fetch;
    const now = 1_800_000_000_000;
    const instanceA = Array.from({ length: 12 }, () => __test.allowAuthenticatedMutation(env, 'shared-provider', 'listing_create', now));
    const instanceB = Array.from({ length: 12 }, () => __test.allowAuthenticatedMutation(env, 'shared-provider', 'listing_create', now));
    const results = await Promise.all([...instanceA, ...instanceB]);
    expect(results.filter(result => result.status === 'allowed').length <= 10).toBe(true);
    expect(results.filter(result => result.status === 'limited').length).toBeGreaterThan(0);
    expect((await __test.allowAuthenticatedMutation(env, 'shared-provider', 'listing_create', now)).status).toBe('limited');
  });

  test('bounds service-profile and organization mutation scopes with isolated hashed quotas', async () => {
    const firestore = firestoreHarness();
    globalThis.fetch = firestore.fetch;
    const now = 1_800_000_000_000;
    for (let attempt = 0; attempt < 3; attempt += 1) expect((await __test.allowAuthenticatedMutation(env, 'company-owner', 'organization_provision', now)).status).toBe('allowed');
    expect(await __test.allowAuthenticatedMutation(env, 'company-owner', 'organization_provision', now)).toEqual({ status: 'limited', retryAfterSeconds: 3600 });
    for (let attempt = 0; attempt < 10; attempt += 1) expect((await __test.allowAuthenticatedMutation(env, 'company-owner', 'organization_invite', now)).status).toBe('allowed');
    expect((await __test.allowAuthenticatedMutation(env, 'company-owner', 'organization_invite', now)).status).toBe('limited');
    for (let attempt = 0; attempt < 20; attempt += 1) expect((await __test.allowAuthenticatedMutation(env, 'employee-user', 'organization_membership', now)).status).toBe('allowed');
    expect((await __test.allowAuthenticatedMutation(env, 'employee-user', 'organization_membership', now)).status).toBe('limited');
    for (let attempt = 0; attempt < 30; attempt += 1) expect((await __test.allowAuthenticatedMutation(env, 'equipment-user', 'organization_equipment', now)).status).toBe('allowed');
    expect((await __test.allowAuthenticatedMutation(env, 'equipment-user', 'organization_equipment', now)).status).toBe('limited');
    for (let attempt = 0; attempt < 30; attempt += 1) expect((await __test.allowAuthenticatedMutation(env, 'booking-user', 'organization_booking', now)).status).toBe('allowed');
    expect((await __test.allowAuthenticatedMutation(env, 'booking-user', 'organization_booking', now)).status).toBe('limited');
    for (let attempt = 0; attempt < 20; attempt += 1) expect((await __test.allowAuthenticatedMutation(env, 'service-profile-user', 'service_profile_save', now)).status).toBe('allowed');
    expect((await __test.allowAuthenticatedMutation(env, 'service-profile-user', 'service_profile_save', now)).status).toBe('limited');
    for (let attempt = 0; attempt < 20; attempt += 1) expect((await __test.allowAuthenticatedMutation(env, 'organization-service-user', 'organization_service', now)).status).toBe('allowed');
    expect((await __test.allowAuthenticatedMutation(env, 'organization-service-user', 'organization_service', now)).status).toBe('limited');
    expect(JSON.stringify([...firestore.documents.entries()])).not.toContain('company-owner');
    expect(JSON.stringify([...firestore.documents.entries()])).not.toContain('employee-user');
    expect(JSON.stringify([...firestore.documents.entries()])).not.toContain('equipment-user');
    expect(JSON.stringify([...firestore.documents.entries()])).not.toContain('booking-user');
    expect(JSON.stringify([...firestore.documents.entries()])).not.toContain('service-profile-user');
    expect(JSON.stringify([...firestore.documents.entries()])).not.toContain('organization-service-user');
  });

  test('storage failure fails closed and normal reservations use three Firestore subrequests', async () => {
    const healthy = firestoreHarness();
    globalThis.fetch = healthy.fetch;
    expect((await __test.allowAuthenticatedMutation(env, 'normal-provider', 'listing_create', 1_800_000_000_000)).status).toBe('allowed');
    expect(healthy.calls.filter(call => call !== 'other')).toEqual(['begin', 'read', 'commit']);

    const failed = firestoreHarness({ fail: true });
    globalThis.fetch = failed.fetch;
    expect(await __test.allowAuthenticatedMutation(env, 'blocked-provider', 'listing_create', 1_800_000_000_000)).toEqual({ status: 'unavailable' });
  });

  test('HTTP contract returns stable 429/Retry-After, fail-closed 503, and bounded JSON 413', async () => {
    __test.setAuth({ uid: 'provider-1', admin: false, accountProfile: { role: 'provider', countryCode: 'SA', providerOnboardingCompleted: true } });
    __test.setAuthenticatedMutationLimiter(async () => ({ status: 'limited', retryAfterSeconds: 37 }));
    const limited = await worker.fetch(new Request('https://worker.test/api/listings', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json', Origin: 'https://heavyar.com' }, body: '{}',
    }), env);
    expect(limited.status).toBe(429);
    expect((await limited.json() as any).errorCode).toBe('RATE_LIMITED');
    expect(limited.headers.get('Retry-After')).toBe('37');
    expect(limited.headers.get('Access-Control-Expose-Headers')).toContain('Retry-After');

    __test.setAuthenticatedMutationLimiter(async () => ({ status: 'unavailable' }));
    const unavailable = await worker.fetch(new Request('https://worker.test/api/listings', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: '{}',
    }), env);
    expect(unavailable.status).toBe(503);
    expect((await unavailable.json() as any).errorCode).toBe('RATE_LIMIT_UNAVAILABLE');

    __test.setAuthenticatedMutationLimiter(async () => ({ status: 'allowed' }));
    __test.setFirestore((collection) => collection === 'users'
      ? { role: 'provider', accountStatus: 'active', countryCode: 'SA', providerOnboardingCompleted: true }
      : null);
    const oversized = await worker.fetch(new Request('https://worker.test/api/listings', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(256 * 1024) }),
    }), env);
    expect(oversized.status).toBe(413);
    expect((await oversized.json() as any).errorCode).toBe('PAYLOAD_TOO_LARGE');
  });
});
