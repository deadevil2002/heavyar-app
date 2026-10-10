import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { __googleAuthTest, googleServiceAccountToken } from './google-auth';
import { consumeScheduledSubrequest, createScheduledGlobalBudget, createScheduledProcessorBudget, ScheduledBudgetDeferredError } from './scheduled-budget';

let privateKey = '';
const env = () => ({
  FIREBASE_PROJECT_ID: 'test-project',
  FIREBASE_CLIENT_EMAIL: 'service@test-project.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: privateKey,
});

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const encoded = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64').match(/.{1,64}/g)?.join('\n');
  privateKey = `-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----\n`;
});

afterEach(() => __googleAuthTest.reset());

describe('Google service-account token transport', () => {
  test('reuses one valid token for sequential calls', async () => {
    let exchanges = 0;
    __googleAuthTest.setFetch(async () => {
      exchanges += 1;
      return Response.json({ access_token: 'sequential-token', expires_in: 3600 });
    });
    expect(await googleServiceAccountToken(env())).toBe('sequential-token');
    expect(await googleServiceAccountToken(env())).toBe('sequential-token');
    expect(exchanges).toBe(1);
  });

  test('deduplicates parallel refreshes for one project, client and scope', async () => {
    let exchanges = 0;
    __googleAuthTest.setFetch(async () => {
      exchanges += 1;
      await new Promise(resolve => setTimeout(resolve, 10));
      return Response.json({ access_token: 'parallel-token', expires_in: 3600 });
    });
    const tokens = await Promise.all(Array.from({ length: 20 }, () => googleServiceAccountToken(env())));
    expect(new Set(tokens)).toEqual(new Set(['parallel-token']));
    expect(exchanges).toBe(1);
    expect(__googleAuthTest.inFlightSize()).toBe(0);
  });

  test('keeps OAuth scopes isolated', async () => {
    let exchanges = 0;
    __googleAuthTest.setFetch(async (_input, init) => {
      exchanges += 1;
      const body = String(init?.body || '');
      return Response.json({ access_token: body.includes('assertion=') ? `scope-token-${exchanges}` : 'invalid', expires_in: 3600 });
    });
    const datastore = await googleServiceAccountToken(env(), 'https://www.googleapis.com/auth/datastore');
    const identity = await googleServiceAccountToken(env(), 'https://www.googleapis.com/auth/identitytoolkit');
    expect(datastore).not.toBe(identity);
    expect(exchanges).toBe(2);
    expect(__googleAuthTest.cacheSize()).toBe(2);
  });

  test('refreshes a token whose lifetime is inside the safety margin', async () => {
    let exchanges = 0;
    __googleAuthTest.setFetch(async () => Response.json({ access_token: `short-token-${++exchanges}`, expires_in: 30 }));
    expect(await googleServiceAccountToken(env())).toBe('short-token-1');
    expect(await googleServiceAccountToken(env())).toBe('short-token-2');
    expect(exchanges).toBe(2);
  });

  test('clears failed refreshes and never exposes tokens or provider errors', async () => {
    let exchanges = 0;
    __googleAuthTest.setFetch(async () => {
      exchanges += 1;
      if (exchanges === 1) return Response.json({ error: 'provider-secret-detail', access_token: 'leaked-token' }, { status: 500 });
      return Response.json({ access_token: 'recovered-token', expires_in: 3600 });
    });
    let message = '';
    try { await googleServiceAccountToken(env()); } catch (error) { message = error instanceof Error ? error.message : String(error); }
    expect(message).toBe('Google service account unavailable');
    expect(message).not.toContain('provider-secret-detail');
    expect(message).not.toContain('leaked-token');
    expect(__googleAuthTest.inFlightSize()).toBe(0);
    expect(await googleServiceAccountToken(env())).toBe('recovered-token');
    expect(exchanges).toBe(2);
  });

  test('counts a cache-miss OAuth exchange and preserves normal scheduled deferral', async () => {
    let exchanges = 0;
    __googleAuthTest.setFetch(async () => {
      exchanges += 1;
      return Response.json({ access_token: 'must-not-run', expires_in: 3600 });
    });
    const budget = createScheduledProcessorBudget(createScheduledGlobalBudget(), 'processRegulatoryExpiry');
    while (budget.state.workUsed < budget.workLimit) consumeScheduledSubrequest(budget, 'firestore');
    let deferred: unknown;
    try { await googleServiceAccountToken({ ...env(), __scheduledBudget: budget }); } catch (error) { deferred = error; }
    expect(deferred instanceof ScheduledBudgetDeferredError).toBe(true);
    expect(exchanges).toBe(0);
    expect(budget.state.lastKind).toBe('google_oauth');
  });
});
