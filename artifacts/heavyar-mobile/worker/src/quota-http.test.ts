import { afterEach, expect, test } from 'bun:test';
import worker, { __test } from './index';
import { __adminTest } from './admin';
import { QuotaBusyError, quotaBlocked } from './quota-policy';
import { seoPayloadCache } from './config-cache';

const env = { FIREBASE_PROJECT_ID: 'quota-http-local-test', CORS_ORIGINS: 'https://admin.example.test' };
afterEach(() => {
  __test.setFirestore(undefined);
  __adminTest.setFirestore(undefined);
  seoPayloadCache.invalidate(env.FIREBASE_PROJECT_ID);
});

test('outer quota catch preserves allowed browser origin and exposes cooldown', async () => {
  const blockedBefore = quotaBlocked();
  // Throw at the injected read boundary, never trip the shared transport circuit.
  __test.setFirestore(() => { throw new QuotaBusyError(120); });
  const response = await worker.fetch(new Request('https://worker.test/api/config/markets', {
    headers: { Origin: 'https://admin.example.test', 'Accept-Language': 'ar-SA' },
  }), env);
  expect(response.status).toBe(503);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.test');
  expect(response.headers.get('Access-Control-Expose-Headers')?.includes('Retry-After')).toBe(true);
  expect(response.headers.get('Retry-After')).toBe('120');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const body = await response.json() as any;
  expect(body.code).toBe('SERVICE_TEMPORARILY_BUSY');
  expect(body.error).toBe('الخدمة مشغولة مؤقتًا. حاول مرة أخرى بعد قليل.');
  expect(quotaBlocked()).toBe(blockedBefore);
});

test('outer quota catch does not grant private-route CORS to an untrusted origin', async () => {
  __test.setFirestore(() => { throw new QuotaBusyError(60); });
  const response = await worker.fetch(new Request('https://worker.test/api/config/markets', {
    headers: { Origin: 'https://untrusted.example.test' },
  }), env);
  expect(response.status).toBe(503);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('null');
  expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
});

test('public SEO adapter preserves quota identity and exposes Retry-After for GET and HEAD', async () => {
  const blockedBefore = quotaBlocked();
  seoPayloadCache.invalidate(env.FIREBASE_PROJECT_ID);
  let reads = 0;
  __adminTest.setFirestore(() => { reads++; throw new QuotaBusyError(90); });
  for (const method of ['GET', 'HEAD']) {
    const response = await worker.fetch(new Request('https://worker.test/api/seo/published', {
      method, headers: { Origin: 'https://public.example.test' },
    }), env);
    expect(response.status).toBe(503);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('null');
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    expect(response.headers.get('Retry-After')).toBe('90');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    if (method === 'HEAD') expect(await response.text()).toBe('');
    else {
      const body = await response.json() as any;
      expect(body.code).toBe('SERVICE_TEMPORARILY_BUSY');
      expect(body.error).toBe('The service is temporarily busy. Please try again shortly.');
    }
  }
  expect(reads).toBe(2); // failures never populate the published payload cache
  expect(quotaBlocked()).toBe(blockedBefore);
});