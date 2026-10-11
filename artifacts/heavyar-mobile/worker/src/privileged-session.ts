import { googleServiceAccountToken as googleToken } from './google-auth';

type PrivilegedSessionEnv = {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
};

type PrivilegedSessionActor = {
  uid: string;
  authTime?: number;
  testInjected?: true;
};

type FirebaseIdentityState = {
  disabled: boolean;
  validSinceSeconds: number;
};

type CachedIdentityState = FirebaseIdentityState & { expiresAt: number };
type IdentityLookup = (env: PrivilegedSessionEnv, uid: string) => Promise<FirebaseIdentityState>;

export const PRIVILEGED_SESSION_CACHE_TTL_MS = 60_000;
const PRIVILEGED_SESSION_LOOKUP_TIMEOUT_MS = 5_000;
const MAX_CACHED_IDENTITIES = 256;

const identityCache = new Map<string, CachedIdentityState>();
const inFlightLookups = new Map<string, Promise<FirebaseIdentityState>>();
let now = () => Date.now();
let lookupOverride: IdentityLookup | undefined;

export class PrivilegedAuthUnavailableError extends Error {
  readonly code = 'PRIVILEGED_AUTH_UNAVAILABLE';

  constructor() {
    super('Privileged authentication verification unavailable');
    this.name = 'PrivilegedAuthUnavailableError';
  }
}

export class PrivilegedSessionRevokedError extends Error {
  readonly code = 'AUTH_SESSION_REVOKED';

  constructor() {
    super('Privileged session is no longer valid');
    this.name = 'PrivilegedSessionRevokedError';
  }
}

function cacheKey(env: PrivilegedSessionEnv, uid: string) {
  return `${env.FIREBASE_PROJECT_ID || ''}\u0000${uid}`;
}

function boundedCacheWrite(key: string, state: FirebaseIdentityState) {
  const currentTime = now();
  for (const [candidate, cached] of identityCache) {
    if (cached.expiresAt <= currentTime) identityCache.delete(candidate);
  }
  if (!identityCache.has(key) && identityCache.size >= MAX_CACHED_IDENTITIES) {
    const oldest = identityCache.keys().next().value;
    if (typeof oldest === 'string') identityCache.delete(oldest);
  }
  identityCache.set(key, { ...state, expiresAt: currentTime + PRIVILEGED_SESSION_CACHE_TTL_MS });
}

function validSinceSeconds(value: unknown) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PrivilegedAuthUnavailableError();
  }
  return parsed;
}

async function lookupFirebaseIdentity(env: PrivilegedSessionEnv, uid: string): Promise<FirebaseIdentityState> {
  if (lookupOverride) return lookupOverride(env, uid);
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new PrivilegedAuthUnavailableError();
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRIVILEGED_SESSION_LOOKUP_TIMEOUT_MS);
  const timeout = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener('abort', () => reject(new PrivilegedAuthUnavailableError()), { once: true });
  });
  try {
    // The shared OAuth token cache normally avoids an exchange here. Race both
    // that exchange and the directory call against the same request budget so
    // privileged authorization never waits indefinitely on Google services.
    const token = await Promise.race([
      googleToken(env, 'https://www.googleapis.com/auth/identitytoolkit'),
      timeout,
    ]);
    const response = await Promise.race([fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/accounts:lookup`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ localId: [uid] }),
        signal: controller.signal,
      },
    ), timeout]);
    if (!response.ok) throw new PrivilegedAuthUnavailableError();
    const record = (await response.json() as { users?: Array<{ localId?: unknown; disabled?: unknown; validSince?: unknown }> }).users?.[0];
    if (!record || record.localId !== uid) throw new PrivilegedSessionRevokedError();
    return { disabled: record.disabled === true, validSinceSeconds: validSinceSeconds(record.validSince) };
  } catch (error) {
    if (error instanceof PrivilegedSessionRevokedError || error instanceof PrivilegedAuthUnavailableError) throw error;
    throw new PrivilegedAuthUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}

async function identityState(env: PrivilegedSessionEnv, uid: string) {
  const key = cacheKey(env, uid);
  const cached = identityCache.get(key);
  if (cached && cached.expiresAt > now()) return cached;
  if (cached) identityCache.delete(key);
  const active = inFlightLookups.get(key);
  if (active) return active;
  const lookup = lookupFirebaseIdentity(env, uid)
    .then(state => {
      boundedCacheWrite(key, state);
      return state;
    })
    .finally(() => { inFlightLookups.delete(key); });
  inFlightLookups.set(key, lookup);
  return lookup;
}

/**
 * Performs the Firebase Auth directory check required before a request can
 * exercise staff authority or accept a staff/ownership grant. Successful
 * lookups are cached per isolate for at most 60 seconds; failures are never
 * cached and fail closed.
 */
export async function assertActivePrivilegedSession(env: PrivilegedSessionEnv, actor: PrivilegedSessionActor) {
  if (actor.testInjected) return;
  if (!actor.uid || !Number.isFinite(actor.authTime) || Number(actor.authTime) <= 0) {
    throw new PrivilegedSessionRevokedError();
  }
  const state = await identityState(env, actor.uid);
  const authTimeSeconds = Math.floor(Number(actor.authTime) / 1_000);
  if (state.disabled || authTimeSeconds < state.validSinceSeconds) {
    throw new PrivilegedSessionRevokedError();
  }
}

export const __privilegedSessionTest = {
  reset() {
    identityCache.clear();
    inFlightLookups.clear();
    lookupOverride = undefined;
    now = () => Date.now();
  },
  setLookup(value?: IdentityLookup) {
    lookupOverride = value;
  },
  setNow(value: () => number) {
    now = value;
  },
  cacheSize() {
    return identityCache.size;
  },
  inFlightSize() {
    return inFlightLookups.size;
  },
};
