import { afterEach, expect, it, vi } from 'vitest';
import { invalidatePublicEquipment, subscribePublicEquipmentInvalidation } from '../services/discoveryInvalidation';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import ts from 'typescript';
import { safeSupportCode } from '../services/mutationError';

const unsubscribe: Array<() => void> = [];
afterEach(() => { unsubscribe.splice(0).forEach(stop => stop()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('isolates synchronous and asynchronous observer failures and still notifies peers', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const peer = vi.fn();
  unsubscribe.push(subscribePublicEquipmentInvalidation(() => { throw new Error('private data'); }));
  unsubscribe.push(subscribePublicEquipmentInvalidation(async () => { throw new Error('private data'); }));
  unsubscribe.push(subscribePublicEquipmentInvalidation(peer));
  expect(() => invalidatePublicEquipment()).not.toThrow();
  await Promise.resolve();
  expect(peer).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private data');
});
it('actual createListing returns committed success despite a failing observer', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  unsubscribe.push(subscribePublicEquipmentInvalidation(() => { throw new Error('observer'); }));
  const code = ts.transpileModule(readFileSync(new URL('../services/workerClient.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  const modules: Record<string, unknown> = {
    './firebaseConfig': { getFirebaseAuth: () => ({ currentUser: { uid: 'qa', getIdToken: async () => 'test-only' } }) },
    '../constants/worker': { WORKER_BASE_URL: 'https://worker.test' },
    './listingPayload': { sanitizeCreateListingPayload: (value: unknown) => value },
    './discoveryInvalidation': { invalidatePublicEquipment },
  };
  new Function('require', 'exports', code)((name: string) => modules[name] || {}, exports);
  const result = { success: true, id: 'committed-listing' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(result, { status: 201 })));
  await expect(exports.createListing({ titleAr: 'اختبار' })).resolves.toEqual(result);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(['before', 'token', 'response'])('pins Worker request identity across %s account switch', async phase => {
  const other = { uid: 'other', getIdToken: vi.fn(async () => 'other-token') };
  const auth = { currentUser: { uid: 'qa', getIdToken: vi.fn(async () => {
    if (phase === 'token') auth.currentUser = other;
    return 'original-token';
  }) } };
  if (phase === 'before') auth.currentUser = other;
  const code = ts.transpileModule(readFileSync(new URL('../services/workerClient.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  const modules: Record<string, unknown> = {
    './firebaseConfig': { getFirebaseAuth: () => auth },
    '../constants/worker': { WORKER_BASE_URL: 'https://worker.test' },
    './mutationError': { safeSupportCode },
  };
  new Function('require', 'exports', code)((name: string) => modules[name] || {}, exports);
  const mock = vi.fn(async () => { auth.currentUser = other; return Response.json({ success: true }); });
  vi.stubGlobal('fetch', mock);
  await expect(exports.request('/test', {}, true, 'qa')).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
  expect(other.getIdToken).not.toHaveBeenCalled();
  expect(mock).toHaveBeenCalledTimes(phase === 'response' ? 1 : 0);
});