import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Env } from './index';
import { __adminTest, handleAdmin } from './admin';

const env = { CORS_ORIGINS: 'http://localhost' } as Env;
const owner = { uid: 'owner-1', admin: true, role: 'super_admin' as const, permissionRole: 'owner', testInjected: true as const };
const request = (uids: string[]) => new Request('https://worker.test/api/admin/users/deletion-preview', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uids }),
});
type Row = { name: string; data: Record<string, unknown> };

function queryFixture(rowsByCollection: Record<string, Row[]>, calls: { collection: string; limit: number; query: any }[]) {
  return (collection: string, before: string, limit: number, query?: any) => {
    calls.push({ collection, limit, query });
    const filters = query?.where?.compositeFilter?.filters || (query?.where ? [query.where] : []);
    const eligible = (rowsByCollection[collection] || []).filter(row => filters.some((filter: any) => {
      const field = filter?.fieldFilter?.field?.fieldPath;
      const values = filter?.fieldFilter?.value?.arrayValue?.values || [];
      return values.some((value: any) => String(row.data[field]) === String(value.stringValue));
    }));
    const start = before ? Math.max(0, eligible.findIndex(row => row.name === before) + 1) : 0;
    return eligible.slice(start, start + limit);
  };
}

describe('DP-016 bounded deletion preview', () => {
  beforeEach(() => {
    __adminTest.setFirestore(undefined);
    __adminTest.setQuery(undefined);
    __adminTest.setBatchGet(undefined);
    __adminTest.captureCommits(undefined);
  });
  afterEach(() => {
    __adminTest.setFirestore(undefined);
    __adminTest.setQuery(undefined);
    __adminTest.setBatchGet(undefined);
    __adminTest.captureCommits(undefined);
  });

  test('keeps exact one-target impact, media, and retained counts without double-counting multi-role documents', async () => {
    const uid = 'customer-1', calls: { collection: string; limit: number; query: any }[] = [];
    const rows: Record<string, Row[]> = {
      equipment: [
        { name: 'projects/undefined/databases/(default)/documents/equipment/e-1', data: { ownerUid: uid, images: [{ publicId: 'heavyar/customer-1/1' }, { publicId: 'heavyar/customer-1/2' }, { url: 'ignored' }] } },
        { name: 'projects/undefined/databases/(default)/documents/equipment/e-2', data: { ownerUid: uid, images: [{ publicId: 'heavyar/customer-1/3' }] } },
      ],
      payments: [
        { name: 'projects/undefined/databases/(default)/documents/payments/p-1', data: { customerUid: uid, providerUid: uid } },
        { name: 'projects/undefined/databases/(default)/documents/payments/p-2', data: { customerUid: 'other', providerUid: uid } },
      ],
      invoices: [{ name: 'projects/undefined/databases/(default)/documents/invoices/i-1', data: { customerId: uid, providerId: uid } }],
      refunds: [{ name: 'projects/undefined/databases/(default)/documents/refunds/r-1', data: { customerUid: uid, providerUid: uid } }],
      adminAudit: [{ name: 'projects/undefined/databases/(default)/documents/adminAudit/a-1', data: { actorUid: uid, targetId: uid } }],
    };
    __adminTest.setFirestore((collection, id) => {
      if (collection === 'heavyarConfig' && id === 'owner') return { ownerUid: owner.uid };
      if (collection === 'users' && id === uid) return { role: 'customer', avatarPublicId: 'heavyar/customer-1/avatar' };
      return null;
    });
    __adminTest.setQuery(queryFixture(rows, calls));
    __adminTest.captureCommits([]);

    const result = await handleAdmin(request([uid]), env, owner) as any;
    expect(result.success).toBe(true);
    expect(result.items[0].counts).toMatchObject({ equipment: 2, media: 4 });
    expect(result.items[0].retained).toEqual({ payments: 2, invoices: 1, refunds: 1, audits: 1 });
    expect(result.retained).toEqual({ payments: 2, invoices: 1, refunds: 1, audits: 1 });
    expect(calls.every(call => call.limit <= 500)).toBe(true);
    const equipmentQuery = calls.find(call => call.collection === 'equipment')?.query;
    expect(equipmentQuery.select.fields.map((field: any) => field.fieldPath)).toEqual(['ownerUid', 'images']);
  });

  test('counts more than 5,000 related documents exactly with bounded projections and operations', async () => {
    const uid = 'customer-large', calls: { collection: string; limit: number; query: any }[] = [];
    const notifications = Array.from({ length: 5_001 }, (_, index) => ({
      name: `projects/undefined/databases/(default)/documents/notifications/n-${String(index).padStart(5, '0')}`,
      data: { uid, privatePayload: 'not projected in Production' },
    }));
    __adminTest.setFirestore((collection, id) => {
      if (collection === 'heavyarConfig' && id === 'owner') return { ownerUid: owner.uid };
      if (collection === 'users' && id === uid) return { role: 'customer' };
      return null;
    });
    __adminTest.setQuery(queryFixture({ notifications }, calls));
    __adminTest.captureCommits([]);

    const result = await handleAdmin(request([uid]), env, owner) as any;
    expect(result.success).toBe(true);
    expect(result.items[0].counts.notifications).toBe(5_001);
    expect(calls.length <= 36).toBe(true);
    expect(Math.max(...calls.map(call => call.limit))).toBe(500);
    expect(calls.find(call => call.collection === 'notifications')?.query.select.fields).toEqual([{ fieldPath: 'uid' }]);
  });

  test('keeps 20-target multi-field queries within Firestore disjunction and Worker budgets', async () => {
    const uids = Array.from({ length: 20 }, (_, index) => `target-${index}`);
    const calls: { collection: string; limit: number; query: any }[] = [];
    __adminTest.setFirestore((collection, id) => {
      if (collection === 'heavyarConfig' && id === 'owner') return { ownerUid: owner.uid };
      if (collection === 'users' && uids.includes(id)) return { role: 'customer' };
      return null;
    });
    __adminTest.setQuery(queryFixture({}, calls));
    __adminTest.captureCommits([]);

    const result = await handleAdmin(request(uids), env, owner) as any;
    expect(result.success).toBe(true);
    expect(result.targeted).toBe(20);
    expect(calls.length <= 36).toBe(true);
    for (const call of calls) {
      const filters = call.query.where?.compositeFilter?.filters || [call.query.where];
      const disjunctions = filters.reduce((total: number, filter: any) => total + (filter.fieldFilter.value.arrayValue.values?.length || 0), 0);
      expect(disjunctions <= 30).toBe(true);
    }
  });

  test('fails closed without a token or snapshot when Firestore is unavailable', async () => {
    const commits: unknown[][] = [];
    __adminTest.setFirestore((collection, id) => {
      if (collection === 'heavyarConfig' && id === 'owner') return { ownerUid: owner.uid };
      if (collection === 'users' && id === 'target') return { role: 'customer' };
      return null;
    });
    __adminTest.setQuery(() => { throw new Error('missing index'); });
    __adminTest.captureCommits(commits);

    const result = await handleAdmin(request(['target']), env, owner) as any;
    expect(result).toMatchObject({ status: 503, errorCode: 'deletion_preview_unavailable' });
    expect(result.previewToken).toBeUndefined();
    expect(commits).toHaveLength(0);
  });

  test('fails closed without a token when the document budget is exhausted', async () => {
    const uid = 'customer-over-budget', commits: unknown[][] = [];
    const rows = Array.from({ length: 12_001 }, (_, index) => ({
      name: `projects/undefined/databases/(default)/documents/notifications/n-${String(index).padStart(5, '0')}`,
      data: { uid },
    }));
    __adminTest.setFirestore((collection, id) => {
      if (collection === 'heavyarConfig' && id === 'owner') return { ownerUid: owner.uid };
      if (collection === 'users' && id === uid) return { role: 'customer' };
      return null;
    });
    __adminTest.setQuery(queryFixture({ notifications: rows }, []));
    __adminTest.captureCommits(commits);

    const result = await handleAdmin(request([uid]), env, owner) as any;
    expect(result).toMatchObject({ status: 413, errorCode: 'preview_read_budget_exceeded' });
    expect(result.previewToken).toBeUndefined();
    expect(commits).toHaveLength(0);
  });
});
