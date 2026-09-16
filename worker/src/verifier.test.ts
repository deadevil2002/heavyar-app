import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { __test, type Env } from './index';

const env = { FIREBASE_PROJECT_ID: 'test-project' } as Env;
const enc = new TextEncoder();
const b64u = (value: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const now = () => Math.floor(Date.now() / 1000);

async function fixture(kid: string, overrides: Record<string, unknown> = {}) {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey), kid, alg: 'RS256', use: 'sig' };
  const time = now();
  const payload = { aud: 'test-project', iss: 'https://securetoken.google.com/test-project', sub: 'user-1', iat: time - 10, auth_time: time - 20, exp: time + 300, ...overrides };
  const header = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })));
  const encodedPayload = b64u(enc.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, enc.encode(`${header}.${encodedPayload}`));
  return { token: `${header}.${encodedPayload}.${b64u(signature)}`, jwk };
}

async function rejects(request: Request) {
  try { await __test.verifyToken(request, env); return false; } catch { return true; }
}

describe('Firebase ID token contract verification', () => {
  const oldFetch = globalThis.fetch;
  beforeEach(() => { globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [] }))) as typeof fetch; });
  afterEach(() => { globalThis.fetch = oldFetch; });

  test('rejects expired, future, misordered, and wrong audience/issuer claims', async () => {
    for (const claims of [
      { exp: now() - 1 },
      { iat: now() + 61 },
      { auth_time: now() + 61 },
      { auth_time: now(), iat: now() - 1 },
      { aud: 'wrong' },
      { iss: 'https://wrong.example' },
    ]) {
      const signed = await fixture(`claims-${JSON.stringify(claims).length}`, claims);
      globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [signed.jwk] }))) as typeof fetch;
      expect(await rejects(new Request('https://worker.test/health', { headers: { Authorization: `Bearer ${signed.token}` } }))).toBe(true);
    }
  });

  test('rejects bad signatures and unknown key IDs', async () => {
    const signed = await fixture('known-key');
    globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [signed.jwk] }))) as typeof fetch;
    const parts = signed.token.split('.');
    parts[2] = b64u(enc.encode('bad-signature'));
    expect(await rejects(new Request('https://worker.test/health', { headers: { Authorization: `Bearer ${parts.join('.')}` } }))).toBe(true);
    const unknown = await fixture('unknown-key');
    globalThis.fetch = (async () => new Response(JSON.stringify({ keys: [signed.jwk] }))) as typeof fetch;
    expect(await rejects(new Request('https://worker.test/health', { headers: { Authorization: `Bearer ${unknown.token}` } }))).toBe(true);
  });

  test('refreshes the JWK set when a rotated key ID is encountered', async () => {
    const first = await fixture('rotation-old');
    const rotated = await fixture('rotation-new');
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ keys: calls === 1 ? [first.jwk] : [rotated.jwk] }));
    }) as typeof fetch;
    expect((await __test.verifyToken(new Request('https://worker.test/health', { headers: { Authorization: `Bearer ${first.token}` } }), env)).uid).toBe('user-1');
    expect((await __test.verifyToken(new Request('https://worker.test/health', { headers: { Authorization: `Bearer ${rotated.token}` } }), env)).uid).toBe('user-1');
    expect(calls).toBe(2);
  });
});