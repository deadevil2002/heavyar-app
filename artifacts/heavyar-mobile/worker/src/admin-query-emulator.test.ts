import { afterEach, describe, expect, test } from 'bun:test';
import { __adminTest, handleAdmin, type AdminUser } from './admin';
import type { Env } from './index';

// Deliberately fail rather than falling back to any Google production endpoint.
const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = 'demo-heavyar-query';
const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
const env = { FIREBASE_PROJECT_ID: project } as Env;
const actor: AdminUser = { uid: 'staff', admin: true, role: 'super_admin', permissionRole: 'super_admin', emailVerified: true, testInjected: true };
const req = (path: string) => new Request(`https://worker.test/api/admin/${path}`);
const value = (v: unknown): any => typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
const decode = (fields: any) => Object.fromEntries(Object.entries(fields).map(([key, v]: [string, any]) => [key, v.stringValue ?? v.booleanValue]));
const emulatorTest = host ? test : (test as typeof test & { skip: typeof test }).skip;

afterEach(() => { __adminTest.setQuery(); __adminTest.setFirestore(); });

describe('Admin generated queries against local Firestore emulator', () => {
  emulatorTest('real equality queries read page+1 and exclusive cursors neither duplicate nor skip', async () => {
    if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) throw new Error('Requires FIRESTORE_EMULATOR_HOST=127.0.0.1:<port>; production access prohibited');
    const response = await fetch(`${base}:commit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ writes: Array.from({ length: 70 }, (_, i) => ({
        update: { name: `projects/${project}/databases/(default)/documents/users/query-${String(i).padStart(3, '0')}`,
          fields: Object.fromEntries(Object.entries({
            role: i < 45 ? 'provider' : 'user',
            accountStatus: i < 65 ? 'active' : 'restricted',
            displayName: `Query Person ${i}`,
          }).map(([key, v]) => [key, value(v)])) },
      })) }),
    });
    expect(response.ok).toBe(true);
    __adminTest.setFirestore(() => null);

    // Capture the actual production query builder, execute its exact REST
    // payload in the emulator, then replay those real documents through the
    // normal page/cursor projection. No hand-written duplicate query builder.
    async function page(path: string) {
      let generated: any;
      __adminTest.setQuery((_collection, _before, _limit, query) => { generated = query; return []; });
      await handleAdmin(req(path), env, { ...actor });
      expect(generated.limit).toBe(21);
      const result = await fetch(`${base}:runQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify({ structuredQuery: generated }),
      });
      if (!result.ok) throw new Error(`Local emulator query failed: ${result.status} ${await result.text()}`);
      const raw = (await result.json() as any[]).filter(row => row.document);
      expect(raw.length <= 21).toBe(true);
      __adminTest.setQuery((_collection, _before, _limit, query) => {
        expect(JSON.stringify(query)).toBe(JSON.stringify(generated));
        return raw.map(row => ({ name: row.document.name, data: decode(row.document.fields) }));
      });
      return { generated, readCount: raw.length, result: await handleAdmin(req(path), env, { ...actor }) as any };
    }

    const first = await page('providers?limit=20&accountStatus=active');
    expect(first.generated.where.compositeFilter.op).toBe('AND');
    expect(first.generated.where.compositeFilter.filters.length).toBe(2);
    expect(first.readCount).toBe(21);
    expect(first.result.items.length).toBe(20);
    const second = await page(`providers?limit=20&accountStatus=active&cursor=${first.result.nextCursor}`);
    expect(second.generated.startAt.before).toBe(false);
    expect(second.readCount).toBe(21);
    expect(second.result.items.length).toBe(20);
    const third = await page(`providers?limit=20&accountStatus=active&cursor=${second.result.nextCursor}`);
    expect(third.readCount).toBe(5);
    expect(third.result.items.length).toBe(5);
    expect(third.result.nextCursor).toBe(undefined);
    const delivered = [...first.result.items, ...second.result.items, ...third.result.items];
    expect(new Set(delivered.map(item => item.id)).size).toBe(45);
    expect(delivered.every(item => item.role === 'provider' && item.accountStatus === 'active')).toBe(true);
    expect(delivered[0].id).toBe('query-000');
    expect(delivered[44].id).toBe('query-044');

    const users = await page('users?limit=20&role=user&accountStatus=active');
    expect(users.readCount).toBe(20);
    expect(users.result.items.length).toBe(20);
    expect(users.result.items.every((item: any) => item.role === 'user' && item.accountStatus === 'active')).toBe(true);
    expect(users.result.nextCursor).toBe(undefined);
  });
});