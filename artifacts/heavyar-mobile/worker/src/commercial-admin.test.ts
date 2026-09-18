import { afterEach, describe, expect, test } from 'bun:test';
import { __adminTest, handleAdmin } from './admin';
import type { Env } from './index';
import { buildLegacyCatalog } from './commercial';
import { handleCommercialAdmin, type CommercialAdminStore } from './commercial-admin';

const env = {} as Env;
const request = (body?: any, path = '/api/admin/commercial') => new Request(`https://worker.test${path}`, {
  method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const actor = (role: string) => ({ uid: 'staff-test', admin: true, role: 'super_admin' as const, permissionRole: role, testInjected: true as const });
const terms = () => ({
  effectiveFrom: new Date(Date.now() + 3600000).toISOString(), effectiveTo: null, notes: 'Negotiated test',
  mode: 'percentage', percentageBps: 500, fixedAmountMinor: 0, minimumFeeMinor: 0, maximumFeeMinor: null,
  payer: 'provider', customerShareBps: 0, currency: '*', scope: { countryCode: null, categoryId: null, providerUid: null },
});
afterEach(() => {
  __adminTest.setFirestore(undefined);
  __adminTest.captureCommits(undefined);
});
describe('Commercial Admin authority and persistence', () => {
  test('initialization preserves legacy economics, refuses supplied terms and cannot overwrite', async () => {
    __adminTest.setFirestore(() => null);
    const commits: any[][] = [];
    __adminTest.captureCommits(commits);
    const init = { action: 'initialize', expectedRevision: 1, reason: 'Verified legacy migration' };
    expect((await handleAdmin(request({ ...init, rule: terms() }), env, actor('owner')) as any).status).toBe(400);
    const result = await handleAdmin(request(init), env, actor('owner')) as any;
    expect(result.initialized).toBe(true);
    expect(result.rules[0].percentageBps).toBe(1000);
    expect(result.rules[0].payer).toBe('provider');
    expect(commits[0][0].currentDocument.exists).toBe(false);
    __adminTest.setFirestore(c => c === 'commercialSettings' ? buildLegacyCatalog() : null);
    expect((await handleAdmin(request(init), env, actor('owner')) as any).status).toBe(409);
    expect(commits.length).toBe(1);
  });
  for (const role of ['support', 'marketing', 'moderator', 'operations', 'admin', 'payouts']) {
    test(`${role} cannot read or modify commercial settings`, async () => {
      expect((await handleAdmin(request(), env, actor(role)) as any).status).toBe(403);
      expect((await handleAdmin(request({ action: 'create' }), env, actor(role)) as any).status).toBe(403);
    });
  }
  for (const role of ['finance', 'auditor']) {
    test(`${role} has read-only visibility`, async () => {
      __adminTest.setFirestore(() => null);
      const result = await handleAdmin(request(), env, actor(role)) as any;
      expect(result.success).toBe(true);
      expect(result.canManage).toBe(false);
      expect((await handleAdmin(request({ action: 'create' }), env, actor(role)) as any).status).toBe(403);
    });
  }
  for (const role of ['owner', 'super_admin']) {
    test(`${role} saves catalog and full before/after audit atomically`, async () => {
      __adminTest.setFirestore(() => null);
      const commits: any[][] = [];
      __adminTest.captureCommits(commits);
      const result = await handleAdmin(request({ action: 'create', expectedRevision: 1, reason: 'Commercial test draft', rule: terms() }), env, actor(role)) as any;
      expect(result.success).toBe(true);
      expect(result.revision).toBe(2);
      expect(commits.length).toBe(1);
      expect(commits[0].length).toBe(2);
      expect(commits[0][0].currentDocument.exists).toBe(false);
      const audit = commits[0][1].update.fields;
      expect(audit.actorUid.stringValue).toBe('staff-test');
      expect(audit.before.mapValue.fields.revision.integerValue).toBe('1');
      expect(audit.after.mapValue.fields.revision.integerValue).toBe('2');
      expect(audit.reason.stringValue).toBe('Commercial test draft');
    });
  }
  test('existing catalog writes carry a real updateTime precondition', async () => {
    __adminTest.setFirestore(c => c === 'commercialSettings' ? buildLegacyCatalog() : null);
    const commits: any[][] = [];
    __adminTest.captureCommits(commits);
    await handleAdmin(request({ action: 'create', expectedRevision: 1, reason: 'Draft only', rule: terms() }), env, actor('owner'));
    expect(commits[0][0].currentDocument.updateTime).toBe('test-update-time');
  });
  test('stale revisions and client-selected versions cannot write', async () => {
    __adminTest.setFirestore(() => null);
    const commits: any[][] = [];
    __adminTest.captureCommits(commits);
    expect((await handleAdmin(request({ action: 'create', expectedRevision: 0, reason: 'Stale draft', rule: terms() }), env, actor('owner')) as any).status).toBe(412);
    expect((await handleAdmin(request({ action: 'create', expectedRevision: 1, reason: 'Forged version', rule: { ...terms(), version: 'forged' } }), env, actor('owner')) as any).status).toBe(400);
    expect(commits.length).toBe(0);
  });
  test('unknown providers and customer identities cannot receive provider overrides', async () => {
    for (const profile of [null, { role: 'customer' }]) {
      __adminTest.setFirestore(c => c === 'users' ? profile : null);
      const rule = { ...terms(), scope: { countryCode: null, categoryId: null, providerUid: 'not-provider' } };
      expect((await handleAdmin(request({ action: 'create', expectedRevision: 1, reason: 'Invalid provider', rule }), env, actor('owner')) as any).status).toBe(400);
    }
  });
  test('real provider override is explicit and retained', async () => {
    __adminTest.setFirestore(c => c === 'users' ? { role: 'provider', accountStatus: 'active' } : null);
    __adminTest.captureCommits([]);
    const rule = { ...terms(), scope: { countryCode: null, categoryId: null, providerUid: 'valid-provider' } };
    const result = await handleAdmin(request({ action: 'create', expectedRevision: 1, reason: 'Negotiated rate', rule }), env, actor('owner')) as any;
    expect(result.rules[1].scope.providerUid).toBe('valid-provider');
    expect(result.rules[1].status).toBe('draft');
  });
  test('preview preserves configured legacy tax/fee separation without writes', async () => {
    __adminTest.setFirestore(() => null);
    const commits: any[][] = [];
    __adminTest.captureCommits(commits);
    const result = await handleAdmin(request({ baseAmountMinor: 10000, countryCode: 'SA', categoryId: 'cranes', currency: 'SAR' }, '/api/admin/commercial/preview'), env, actor('auditor')) as any;
    expect(result.snapshot.platformFeeMinor).toBe(1000);
    expect(result.snapshot.taxAmountMinor).toBe(1500);
    expect(result.snapshot.gatewayFeeMinor).toBe(null);
    expect(result.snapshot.providerReceivableMinor).toBe(9000);
    expect(result.snapshot.customerPayableMinor).toBe(11500);
    expect(commits.length).toBe(0);
  });
  test('disabled country preview does not activate markets or invent tax', async () => {
    __adminTest.setFirestore(() => null);
    const result = await handleAdmin(request({ baseAmountMinor: 10001, countryCode: 'KW', categoryId: 'cranes', currency: 'KWD' }, '/api/admin/commercial/preview'), env, actor('owner')) as any;
    expect(result.snapshot.currency).toBe('KWD');
    expect(result.snapshot.taxAmountMinor).toBe(null);
    expect(result.snapshot.platformFeeMinor).toBe(1000);
  });
  test('preview cannot use a forged authoritative fee or mismatched currency', async () => {
    __adminTest.setFirestore(() => null);
    const input = { baseAmountMinor: 10000, countryCode: 'SA', categoryId: 'cranes', currency: 'SAR' };
    for (const patch of [{ platformFeeMinor: 0 }, { commissionConfigVersion: 'forged' }, { currency: 'AED' }]) {
      expect((await handleAdmin(request({ ...input, ...patch }, '/api/admin/commercial/preview'), env, actor('owner')) as any).status).toBe(400);
    }
  });
  test('catalog storage outage never falls back to legacy economics', async () => {
    const store: CommercialAdminStore = { read: async () => { throw new Error('storage unavailable'); }, save: async () => {} };
    let message = '';
    try { await handleCommercialAdmin(request(), store, { uid: 'owner', canRead: true, canManage: true }, {}); }
    catch (error) { message = (error as Error).message; }
    expect(message).toBe('storage unavailable');
  });
});