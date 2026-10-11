import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  __privilegedSessionTest,
  assertActivePrivilegedSession,
  PRIVILEGED_SESSION_CACHE_TTL_MS,
  PrivilegedAuthUnavailableError,
  PrivilegedSessionRevokedError,
} from './privileged-session';

const env = { FIREBASE_PROJECT_ID: 'heavyar-test' };
const actor = { uid: 'owner-1', authTime: 1_000_000 };
async function rejectedBy(promise: Promise<unknown>, type: new (...args: never[]) => Error) {
  try {
    await promise;
    return false;
  } catch (error) {
    return error instanceof type;
  }
}

describe('privileged Firebase session validation', () => {
  beforeEach(() => __privilegedSessionTest.reset());
  afterEach(() => __privilegedSessionTest.reset());

  test('accepts an active identity and the exact validSince boundary', async () => {
    __privilegedSessionTest.setLookup(async () => ({ disabled: false, validSinceSeconds: 1_000 }));
    await expect(assertActivePrivilegedSession(env, actor)).resolves.toBeUndefined();
  });

  test('rejects disabled and revoked privileged sessions', async () => {
    __privilegedSessionTest.setLookup(async () => ({ disabled: true, validSinceSeconds: 0 }));
    expect(await rejectedBy(assertActivePrivilegedSession(env, actor), PrivilegedSessionRevokedError)).toBe(true);
    __privilegedSessionTest.reset();
    __privilegedSessionTest.setLookup(async () => ({ disabled: false, validSinceSeconds: 1_001 }));
    expect(await rejectedBy(assertActivePrivilegedSession(env, actor), PrivilegedSessionRevokedError)).toBe(true);
  });

  test('fails closed when the Auth directory is unavailable or the actor is malformed', async () => {
    __privilegedSessionTest.setLookup(async () => { throw new PrivilegedAuthUnavailableError(); });
    expect(await rejectedBy(assertActivePrivilegedSession(env, actor), PrivilegedAuthUnavailableError)).toBe(true);
    expect(await rejectedBy(assertActivePrivilegedSession(env, { uid: 'owner-1' }), PrivilegedSessionRevokedError)).toBe(true);
  });

  test('deduplicates concurrent lookups and caches only for the documented window', async () => {
    let currentTime = 10_000;
    let calls = 0;
    let validSinceSeconds = 0;
    __privilegedSessionTest.setNow(() => currentTime);
    __privilegedSessionTest.setLookup(async () => {
      calls += 1;
      await Promise.resolve();
      return { disabled: false, validSinceSeconds };
    });
    await Promise.all([
      assertActivePrivilegedSession(env, actor),
      assertActivePrivilegedSession(env, actor),
      assertActivePrivilegedSession(env, actor),
    ]);
    expect(calls).toBe(1);
    validSinceSeconds = 1_001;
    currentTime += PRIVILEGED_SESSION_CACHE_TTL_MS - 1;
    await expect(assertActivePrivilegedSession(env, actor)).resolves.toBeUndefined();
    expect(calls).toBe(1);
    currentTime += 1;
    expect(await rejectedBy(assertActivePrivilegedSession(env, actor), PrivilegedSessionRevokedError)).toBe(true);
    expect(calls).toBe(2);
    expect(__privilegedSessionTest.inFlightSize()).toBe(0);
  });

  test('does not cache Auth backend failures', async () => {
    let calls = 0;
    __privilegedSessionTest.setLookup(async () => {
      calls += 1;
      throw new PrivilegedAuthUnavailableError();
    });
    expect(await rejectedBy(assertActivePrivilegedSession(env, actor), PrivilegedAuthUnavailableError)).toBe(true);
    expect(await rejectedBy(assertActivePrivilegedSession(env, actor), PrivilegedAuthUnavailableError)).toBe(true);
    expect(calls).toBe(2);
    expect(__privilegedSessionTest.cacheSize()).toBe(0);
  });
});
