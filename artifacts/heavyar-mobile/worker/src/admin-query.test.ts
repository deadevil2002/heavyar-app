import { afterEach, describe, expect, test } from 'bun:test';
import { __adminTest, handleAdmin, type AdminUser } from './admin';
import type { Env } from './index';

const env = { FIREBASE_PROJECT_ID: 'demo-admin-query' } as Env;
const actor: AdminUser = { uid: 'staff', admin: true, role: 'super_admin', permissionRole: 'super_admin', emailVerified: true, testInjected: true };
const request = (path: string) => new Request(`https://worker.test/api/admin/${path}`);
afterEach(() => { __adminTest.setQuery(); __adminTest.setFirestore(); });

describe('bounded admin queries', () => {
  for (const endpoint of ['users', 'providers']) {
    test(`${endpoint} reads exactly requested page plus lookahead and never repeats boundary`, async () => {
      const rows = Array.from({ length: 45 }, (_, i) => ({
        name: `projects/demo-admin-query/databases/(default)/documents/users/u${String(i).padStart(3, '0')}`,
        data: { role: endpoint === 'providers' ? 'provider' : 'user', displayName: `Person ${i}` },
      }));
      const queries: any[] = [];
      __adminTest.setFirestore(() => null);
      __adminTest.setQuery((collection, before, limit, query) => {
        expect(collection).toBe('users'); expect(limit).toBe(21); queries.push(query);
        const offset = before ? rows.findIndex(row => row.name === before) + 1 : 0;
        return rows.slice(offset, offset + limit);
      });
      const first: any = await handleAdmin(request(`${endpoint}?limit=20`), env, { ...actor });
      const second: any = await handleAdmin(request(`${endpoint}?limit=20&cursor=${first.nextCursor}`), env, { ...actor });
      expect(first.items.length).toBe(20);
      expect(second.items.length).toBe(20);
      expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(40);
      expect(queries[1].startAt.before).toBe(false);
      if (endpoint === 'providers') expect(queries[0].where.fieldFilter.value.stringValue).toBe('provider');
      expect(first.total).toBe(undefined);
    });
  }

  test('multiple equality filters are sent to Firestore, not a larger scan window', async () => {
    __adminTest.setFirestore(() => null);
    __adminTest.setQuery((_collection, _before, limit, query) => {
      expect(limit).toBe(21);
      expect(query.where.compositeFilter.filters.map((f: any) => f.fieldFilter.field.fieldPath).join(',')).toBe('role,accountStatus');
      return [];
    });
    await handleAdmin(request('providers?limit=20&accountStatus=active'), env, { ...actor });
  });

  test('empty search candidate page retains continuation instead of hiding later matches', async () => {
    __adminTest.setFirestore(() => null);
    __adminTest.setQuery((_collection, _before, limit) => Array.from({ length: limit }, (_, i) => ({
      name: `projects/demo-admin-query/databases/(default)/documents/users/u${i}`, data: { role: 'user', displayName: 'Other' },
    })));
    const result: any = await handleAdmin(request('users?limit=20&q=matching'), env, { ...actor });
    expect(result.items.length).toBe(0);
    expect(result.boundedCandidatePage).toBe(true);
    expect(result.candidatesExamined).toBe(20);
    expect(typeof result.nextCursor).toBe('string');
  });

  test('session reads staff once and does not read owner configuration for established staff', async () => {
    const reads: string[] = [];
    __adminTest.setFirestore((collection, id) => {
      reads.push(`${collection}/${id}`);
      return collection === 'staffMembers' ? { active: true, role: 'support', roleVersion: 2 } : null;
    });
    const result: any = await handleAdmin(request('session'), env, { uid: 'staff', admin: true, emailVerified: true });
    expect(result.role).toBe('support');
    expect(reads.join(',')).toBe('staffMembers/staff');
  });

  test('resolved suspended staff cannot use claims to bypass authorization', async () => {
    __adminTest.setFirestore(() => ({ active: false, role: 'super_admin', roleVersion: 2 }));
    let error: unknown;
    try { await handleAdmin(request('session'), env, { uid: 'staff', admin: true, role: 'super_admin', emailVerified: true }); } catch (caught) { error = caught; }
    expect(error instanceof Error && error.message).toBe('ADMIN_REQUIRED');
  });

  test('users enrichment reuses page profiles and only reads current-page reminders', async () => {
    const reads: string[] = [];
    __adminTest.setFirestore((collection, id) => { reads.push(`${collection}/${id}`); return null; });
    __adminTest.setQuery(() => [{ name: 'projects/demo-admin-query/databases/(default)/documents/users/user1', data: { role: 'user' } }]);
    await handleAdmin(request('users?limit=20'), env, { ...actor });
    expect(reads.join(',')).toBe('emailVerificationRateLimits/user1');
  });
});