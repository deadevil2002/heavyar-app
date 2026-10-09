export type GoogleServiceAccountEnv = {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
};

type CachedToken = { token: string; expiresAt: number };
type OAuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const TOKEN_REFRESH_MARGIN_MS = 60_000;
const MAX_TOKEN_LIFETIME_SECONDS = 3_600;
const tokenCache = new Map<string, CachedToken>();
const inFlightRefreshes = new Map<string, Promise<string>>();
let oauthFetch: OAuthFetch = (input, init) => fetch(input, init);

export class GoogleServiceAccountTokenError extends Error {
  constructor() {
    super('Google service account unavailable');
    this.name = 'GoogleServiceAccountTokenError';
  }
}

const encoder = new TextEncoder();
const base64Url = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(value)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const base64Bytes = (value: string) => Uint8Array.from(
  atob(value.replace(/-/g, '+').replace(/_/g, '/')),
  character => character.charCodeAt(0),
);

function tokenCacheKey(env: GoogleServiceAccountEnv, scope: string) {
  return JSON.stringify([env.FIREBASE_PROJECT_ID, env.FIREBASE_CLIENT_EMAIL, scope]);
}

async function exchangeToken(env: GoogleServiceAccountEnv, scope: string): Promise<CachedToken> {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY || !scope) {
    throw new GoogleServiceAccountTokenError();
  }
  try {
    const issuedAt = Math.floor(Date.now() / 1_000);
    const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    const payload = base64Url(encoder.encode(JSON.stringify({
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: issuedAt,
      exp: issuedAt + MAX_TOKEN_LIFETIME_SECONDS,
    })));
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      base64Bytes(env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s/g, '')),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const assertion = `${header}.${payload}.${base64Url(await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      encoder.encode(`${header}.${payload}`),
    ))}`;
    const response = await oauthFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`,
    });
    if (!response.ok) throw new GoogleServiceAccountTokenError();
    const result = await response.json() as { access_token?: unknown; expires_in?: unknown };
    if (typeof result.access_token !== 'string' || !result.access_token) throw new GoogleServiceAccountTokenError();
    const reportedLifetime = Number(result.expires_in ?? MAX_TOKEN_LIFETIME_SECONDS);
    const lifetimeSeconds = Number.isFinite(reportedLifetime)
      ? Math.max(1, Math.min(MAX_TOKEN_LIFETIME_SECONDS, Math.floor(reportedLifetime)))
      : MAX_TOKEN_LIFETIME_SECONDS;
    return { token: result.access_token, expiresAt: Date.now() + lifetimeSeconds * 1_000 };
  } catch (error) {
    if (error instanceof GoogleServiceAccountTokenError) throw error;
    throw new GoogleServiceAccountTokenError();
  }
}

export async function googleServiceAccountToken(
  env: GoogleServiceAccountEnv,
  scope = 'https://www.googleapis.com/auth/datastore',
): Promise<string> {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY || !scope) {
    throw new GoogleServiceAccountTokenError();
  }
  const key = tokenCacheKey(env, scope);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) return cached.token;
  const active = inFlightRefreshes.get(key);
  if (active) return active;

  const refresh = exchangeToken(env, scope)
    .then(value => {
      tokenCache.set(key, value);
      return value.token;
    })
    .finally(() => { inFlightRefreshes.delete(key); });
  inFlightRefreshes.set(key, refresh);
  return refresh;
}

export const __googleAuthTest = {
  reset() {
    tokenCache.clear();
    inFlightRefreshes.clear();
    oauthFetch = (input, init) => fetch(input, init);
  },
  setFetch(value: OAuthFetch) {
    oauthFetch = value;
  },
  cacheSize() {
    return tokenCache.size;
  },
  inFlightSize() {
    return inFlightRefreshes.size;
  },
};
