import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { QuotaCircuit, isQuotaResponse, deletionInterval, detailInterval, liveLists, authorizationFingerprint } from './query-policy';
import { actionRefreshKeys, refreshQueries } from './admin-feedback';
import { SafeApiError, userErrorMessage } from './error-messages';

const source = (path: string) => readFileSync(`artifacts/heavyar-admin/src/${path}`, 'utf8');
describe('Admin read budgets', () => {
  it('shares a cooldown and admits only one recovery probe with bounded exponential backoff', () => {
    let now = 0;
    const circuit = new QuotaCircuit(() => now);
    for (const delay of [30_000, 60_000, 120_000, 240_000, 480_000, 480_000]) {
      assert.equal(circuit.acquire(), true);
      circuit.busy(null);
      assert.equal(circuit.remaining(), delay);
      for (let page = 0; page < 20; page++) assert.equal(circuit.acquire(), false);
      now += delay;
      assert.equal(circuit.acquire(), true);
      assert.equal(circuit.acquire(), false);
      circuit.release(false);
      now += 30_000;
    }
    assert.equal(circuit.acquire(), true);
    circuit.release(true);
    assert.equal(circuit.failures, 0);
  });
  it('honors Retry-After and coalesces concurrent quota failures', () => {
    let now = 0;
    const circuit = new QuotaCircuit(() => now);
    circuit.busy('900');
    circuit.busy('900');
    assert.equal(circuit.failures, 1);
    assert.equal(circuit.remaining(), 900_000);
    now += 899_999;
    assert.equal(circuit.acquire(), false);
    now++;
    assert.equal(circuit.acquire(), true);
    assert.equal(circuit.acquire(), false);
  });
  it('recognizes backend 503 contract and raw 429 without exposing diagnostics', () => {
    for (const [status, body] of [[503, { code: 'SERVICE_TEMPORARILY_BUSY' }], [429, {}], [503, { error: { code: 'RESOURCE_EXHAUSTED' } }]] as const) assert.equal(isQuotaResponse(status, body), true);
    assert.equal(isQuotaResponse(503, { code: 'OTHER' }), false);
    const error = new SafeApiError('SERVICE_TEMPORARILY_BUSY', 503);
    assert.equal(userErrorMessage(error), 'The service is temporarily busy. Please try again shortly.');
    assert.equal(userErrorMessage(error, 'ar'), 'الخدمة مشغولة مؤقتًا. حاول مرة أخرى بعد قليل.');
  });
  it('stops hidden polling globally and uses a single visibility refresh listener', () => {
    const api = source('lib/api.ts');
    assert.match(api, /refetchIntervalInBackground: false/);
    assert.doesNotMatch(api, /refetchIntervalInBackground: true/);
    assert.match(api, /handleFocus\(document.visibilityState === 'visible'\)/);
    assert.match(api, /removeEventListener\('visibilitychange', changed\)/);
    assert.match(api, /staleTime: 30_000/);
  });
  it('removes configuration and immutable history polling', () => {
    for (const key of ['config', 'provider-configs', 'audit', 'verificationEvents', 'commercialRules', 'seoAdminView']) assert.equal(liveLists.has(key), false);
    assert.match(source('lib/seo-api.ts'), /refetchInterval: false/);
    assert.match(source('lib/api.ts').split('export function useCommercialRules()')[1].split('export function')[0], /refetchInterval: false/);
  });
  it('polls only loaded, genuinely active detail workflows', () => {
    assert.equal(detailInterval('users', { status: 'pending' }), false);
    assert.equal(detailInterval('requests', undefined), false);
    assert.equal(detailInterval('requests', { status: 'completed' }), false);
    assert.equal(detailInterval('requests', { status: 'processing' }), 15_000);
    assert.match(source('lib/api.ts'), /refetchInterval: query => id \? detailInterval/);
  });
  it('backs off active deletion jobs and stops closed, missing, terminal jobs', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 20].map(n => deletionInterval('job', 'processing', n)), [2000, 4000, 8000, 16000, 30000, 30000]);
    for (const status of [undefined, 'completed', 'partially_completed', 'failed']) assert.equal(deletionInterval('job', status, 4), false);
    assert.equal(deletionInterval(undefined, 'processing', 1), false);
  });
  it('normal token refresh timestamps do not change authorization', () => {
    assert.equal(authorizationFingerprint({ role: 'admin', iat: 1, exp: 2 }), authorizationFingerprint({ role: 'admin', iat: 5, exp: 6 }));
    assert.notEqual(authorizationFingerprint({ role: 'admin' }), authorizationFingerprint({ role: 'staff' }));
    assert.doesNotMatch(source('lib/auth.tsx'), /invalidateQueries\(\)/);
    assert.match(source('lib/auth.tsx'), /queryClient.clear\(\)/);
  });
  it('mutations refresh dependent lists without a full-query storm', async () => {
    const calls: string[] = [];
    await refreshQueries({ invalidateQueries: async ({ queryKey }) => { calls.push(queryKey[0]); } }, actionRefreshKeys('equipment'));
    assert.ok(calls.includes('equipment') && calls.includes('providers') && calls.includes('audit'));
    assert.ok(!calls.includes('seoAdminView') && !calls.includes('commercialRules') && !calls.includes('adminSession'));
    assert.doesNotMatch(source('hooks/use-admin-action.tsx'), /invalidateQueries\(\)/);
  });
  it('outage Retry respects shared cooldown and never logs out automatically', () => {
    const outage = source('App.tsx').split('if (error) {')[1].split('if (session?.bootstrapRequired)')[0];
    assert.match(outage, /if \(!quotaCircuit.remaining\(\)\) void refetch\(\)/);
    assert.match(outage, /disabled=\{isFetching \|\| cooldown > 0\}/);
    assert.doesNotMatch(outage, /await logout|logout\(\)/);
  });
});