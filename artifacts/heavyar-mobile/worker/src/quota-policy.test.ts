import { describe, expect, test } from 'bun:test';
import { createQuotaPolicy, QuotaBusyError, quotaResponse } from './quota-policy';
const url = 'https://firestore.googleapis.com/v1/projects/test/databases/(default)/documents/a';
describe('shared quota policy (local transport only)', () => {
  test('bounded exponential cooldown prevents transport storms and permits one half-open probe', async () => {
    let now = 0, calls = 0;
    let finish: ((r: Response) => void) | undefined;
    let deferred = false;
    const policy = createQuotaPolicy(() => now, (async () => {
      calls++;
      if (deferred) return new Promise<Response>(resolve => { finish = resolve; });
      return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED' } }), { status: 429 });
    }) as typeof fetch);
    for (const delay of [30, 60, 120, 240, 480, 900, 900]) {
      expect(await policy.fetch(url).then(() => false, e => e instanceof QuotaBusyError)).toBe(true);
      expect(policy.retryAfter()).toBe(delay);
      const before = calls;
      await Promise.all(Array.from({ length: 20 }, () => policy.fetch(url).catch(() => null)));
      expect(calls).toBe(before);
      now += delay * 1000;
    }
    deferred = true;
    const probe = policy.fetch(url);
    expect(await policy.fetch(url).then(() => false, e => e instanceof QuotaBusyError)).toBe(true);
    finish!(new Response('{}'));
    await probe;
    expect(policy.blocked()).toBe(false);
  });
  test('recognizes exhausted body, does not throttle non-Firestore services, and redacts UX', async () => {
    const policy = createQuotaPolicy(() => 0, (async () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 503 })) as typeof fetch);
    expect(await policy.fetch(url).then(() => false, e => e instanceof QuotaBusyError)).toBe(true);
    expect((await policy.fetch('https://example.com')).status).toBe(503);
    const response = quotaResponse(new Request('https://worker.test', { headers: { 'Accept-Language': 'ar-SA' } }), new QuotaBusyError(30));
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    const text = await response.text();
    expect(text.includes('الخدمة مشغولة')).toBe(true);
    expect(text.includes('RESOURCE_EXHAUSTED')).toBe(false);
    expect(text.includes('stack')).toBe(false);
  });
});