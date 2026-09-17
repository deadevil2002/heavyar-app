import { afterEach, describe, expect, test } from 'bun:test';
import worker, { __test, type Env } from './index';
import type { IdentityVerificationProvider } from './verification';

const env = { FIREBASE_PROJECT_ID: 'test-project' } as Env;
const request = (path: string, init: RequestInit = {}) => new Request(`https://worker.test${path}`, {
  ...init, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json', ...(init.headers || {}) },
});

afterEach(() => {
  __test.setAuth(undefined); __test.setFirestore(undefined); __test.captureCommits(undefined); __test.setVerificationProvider(undefined);
});

describe('verification API boundary', () => {
  test('requires Firebase authentication', async () => {
    const response = await worker.fetch(new Request('https://worker.test/api/verification/profile'), env);
    expect(response.status).toBe(401);
  });
  test('returns only the safe disabled policy default for an absent or malformed policy', async () => {
    __test.setAuth({ uid: 'user-a', admin: false });
    __test.setFirestore((collection) => collection === 'verificationPolicies' ? { enabled: true } : null);
    const response = await worker.fetch(request('/api/verification/policy'), env);
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.policy.enabled).toBe(false);
    expect(body.policy.verificationRequiredAboveAmountSAR).toBe(null);
  });
  test('creates an opaque, safe, rate-limited backend-owned manual review attempt', async () => {
    const writes: unknown[] = [];
    __test.setAuth({ uid: 'user-a', admin: false });
    __test.setFirestore((collection) => collection === 'users' ? {} : null);
    __test.captureCommits(writes);
    const response = await worker.fetch(request('/api/verification/attempts', { method: 'POST', body: '{}' }), env);
    const body = await response.json() as any;
    expect(response.status).toBe(202);
    expect(body.attempt.provider).toBe('manual_review');
    expect(body.attempt.correlationId).toBe(undefined);
    expect(JSON.stringify(writes).includes('verificationAttempts')).toBe(true);
    expect(JSON.stringify(writes).includes('verificationRateLimits')).toBe(true);
  });
  test('sets a trusted expiry on an existing pending verification profile', async () => {
    const writes: unknown[] = [];
    __test.setAuth({ uid: 'user-a', admin: false });
    __test.setFirestore((collection, id) => {
      if (collection === 'users') return {};
      if (collection === 'verificationProfiles' && id === 'user-a') return {
        identity: { status: 'unverified', provider: 'unconfigured' },
      };
      return null;
    });
    __test.captureCommits(writes);
    const response = await worker.fetch(request('/api/verification/attempts', { method: 'POST', body: '{}' }), env);
    expect(response.status).toBe(202);
    const profileWrite = (writes[0] as any[]).find(write => String(write.update?.name || '').includes('/verificationProfiles/user-a'));
    expect(profileWrite.updateMask.fieldPaths.includes('identity.expiresAt')).toBe(true);
    expect(typeof profileWrite.update.fields.identity.mapValue.fields.expiresAt.timestampValue).toBe('string');
  });
  test('rejects a client attempt to select a UID or trusted status', async () => {
    __test.setAuth({ uid: 'user-a', admin: false });
    const response = await worker.fetch(request('/api/verification/attempts', { method: 'POST', body: JSON.stringify({ uid: 'user-b', status: 'verified' }) }), env);
    expect(response.status).toBe(400);
    const smuggled = await worker.fetch(request('/api/verification/attempts', { method: 'POST', body: JSON.stringify({ providerReference: 'forged' }) }), env);
    expect(smuggled.status).toBe(400);
  });
  test('does not disclose another user verification attempt', async () => {
    __test.setAuth({ uid: 'user-a', admin: false });
    __test.setFirestore((collection, id) => collection === 'verificationAttempts' && id === 'abcdefghijklmnop' ? { uid: 'user-b', status: 'verified' } : null);
    const response = await worker.fetch(request('/api/verification/attempts/abcdefghijklmnop'), env);
    expect(response.status).toBe(404);
  });
  test('surfaces an expired pending profile state from its trusted backend expiry', async () => {
    __test.setAuth({ uid: 'user-a', admin: false });
    __test.setFirestore((collection, id) => collection === 'verificationProfiles' && id === 'user-a' ? {
      identity: { status: 'pending', provider: 'manual_review', expiresAt: new Date(Date.now() - 60_000).toISOString() },
    } : null);
    const response = await worker.fetch(request('/api/verification/profile'), env);
    expect(response.status).toBe(200);
    expect((await response.json() as any).profile.identity.status).toBe('expired');
  });
  test('fails closed for an unconfigured official identity callback', async () => {
    const response = await worker.fetch(request('/api/webhooks/identity/abcdefghijklmnop', { method: 'POST', body: '{}' }), env);
    expect(response.status).toBe(503);
  });
  test('consumes a validated provider result atomically without persisting raw payloads', async () => {
    const writes: unknown[] = [];
    const provider: IdentityVerificationProvider = {
      name: 'official-test', mode: 'official',
      async start() { return { referenceId: 'ref' }; },
      async validateResult() { return { uid: 'user-a', correlationId: 'abcdefghijklmnop', status: 'verified' }; },
    };
    __test.setVerificationProvider(provider);
    __test.setFirestore((collection, id) => {
      if (collection === 'verificationAttempts' && id === 'attemptabcdefghijkl') return {
        uid: 'user-a', correlationId: 'abcdefghijklmnop', status: 'pending',
        expiresAt: new Date(Date.now() + 60_000).toISOString(), provider: 'official-test',
      };
      if (collection === 'verificationProfiles') return null;
      return null;
    });
    __test.captureCommits(writes);
    const response = await worker.fetch(request('/api/webhooks/identity/attemptabcdefghijkl', { method: 'POST', body: '{"untrusted":"payload"}' }), { ...env, IDENTITY_PROVIDER_MODE: 'official' });
    expect(response.status).toBe(200);
    expect(JSON.stringify(writes).includes('consumedAt')).toBe(true);
    expect(JSON.stringify(writes).includes('untrusted')).toBe(false);
  });
  test('an official identity result cannot clear an active manual-review restriction', async () => {
    const writes: unknown[] = [];
    __test.setVerificationProvider({
      name: 'official-test', mode: 'official',
      async start() { return { referenceId: 'ref' }; },
      async validateResult() { return { uid: 'user-a', correlationId: 'abcdefghijklmnop', status: 'verified' }; },
    });
    __test.setFirestore((collection, id) => {
      if (collection === 'verificationAttempts' && id === 'attemptabcdefghijkl') return {
        uid: 'user-a', correlationId: 'abcdefghijklmnop', status: 'pending',
        expiresAt: new Date(Date.now() + 60_000).toISOString(), provider: 'official-test',
      };
      if (collection === 'verificationProfiles') return { manualReview: { status: 'manual_review' }, overallTrust: { status: 'manual_review' } };
      return null;
    });
    __test.captureCommits(writes);
    const response = await worker.fetch(request('/api/webhooks/identity/attemptabcdefghijkl', { method: 'POST', body: '{}' }), { ...env, IDENTITY_PROVIDER_MODE: 'official' });
    expect(response.status).toBe(200);
    expect(JSON.stringify(writes).includes('"manual_review"')).toBe(true);
  });
  test('rejects expired, mismatched, and replayed callback attempts', async () => {
    const provider: IdentityVerificationProvider = {
      name: 'official-test', mode: 'official',
      async start() { return { referenceId: 'ref' }; },
      async validateResult() { return { uid: 'wrong-user', correlationId: 'qrstuvwxyzabcdef', status: 'verified' }; },
    };
    __test.setVerificationProvider(provider);
    __test.setFirestore((collection, id) => collection === 'verificationAttempts' && id === 'attemptabcdefghijkl' ? {
      uid: 'user-a', correlationId: 'abcdefghijklmnop', status: 'pending',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    } : null);
    const response = await worker.fetch(request('/api/webhooks/identity/attemptabcdefghijkl', { method: 'POST', body: '{}' }), { ...env, IDENTITY_PROVIDER_MODE: 'official' });
    expect(response.status).toBe(409);
  });
  test('makes an exact duplicate callback idempotent without another write', async () => {
    const provider: IdentityVerificationProvider = {
      name: 'official-test', mode: 'official',
      async start() { return { referenceId: 'ref' }; },
      async validateResult() { return { uid: 'user-a', correlationId: 'abcdefghijklmnop', status: 'verified' }; },
    };
    __test.setAuth(undefined);
    __test.setVerificationProvider(provider);
    __test.setFirestore((collection, id) => collection === 'verificationAttempts' && id === 'attemptabcdefghijkl' ? {
      uid: 'user-a', correlationId: 'abcdefghijklmnop', status: 'verified',
      consumedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), provider: 'official-test',
    } : null);
    const commits: unknown[] = [];
    __test.captureCommits(commits);
    const response = await worker.fetch(request('/api/webhooks/identity/attemptabcdefghijkl', { method: 'POST', body: '{}' }), { ...env, IDENTITY_PROVIDER_MODE: 'official' });
    expect(response.status).toBe(200);
    expect((await response.json() as any).idempotent).toBe(true);
    expect(commits.length).toBe(0);
  });
  test('rejects malformed provider results and correct-correlation wrong-UID results', async () => {
    const baseAttempt = {
      uid: 'user-a', correlationId: 'abcdefghijklmnop', status: 'pending',
      expiresAt: new Date(Date.now() + 60_000).toISOString(), provider: 'official-test',
    };
    __test.setFirestore((collection, id) => collection === 'verificationAttempts' && id === 'attemptabcdefghijkl' ? baseAttempt : null);
    __test.setVerificationProvider({
      name: 'official-test', mode: 'official', async start() { return { referenceId: 'ref' }; },
      async validateResult() { throw new Error('untrusted payload'); },
    });
    expect((await worker.fetch(request('/api/webhooks/identity/attemptabcdefghijkl', { method: 'POST', body: '{}' }), { ...env, IDENTITY_PROVIDER_MODE: 'official' })).status).toBe(400);
    __test.setVerificationProvider({
      name: 'official-test', mode: 'official', async start() { return { referenceId: 'ref' }; },
      async validateResult() { return { uid: 'user-b', correlationId: 'abcdefghijklmnop', status: 'verified' }; },
    });
    expect((await worker.fetch(request('/api/webhooks/identity/attemptabcdefghijkl', { method: 'POST', body: '{}' }), { ...env, IDENTITY_PROVIDER_MODE: 'official' })).status).toBe(409);
  });
});