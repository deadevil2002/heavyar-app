import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { __adminTest, handleAdmin } from './admin';
import type { Env } from './index';

const env = { FIREBASE_PROJECT_ID: 'test-project' } as Env;
const actor = { uid: 'owner-1', admin: true, role: 'super_admin' as const, permissionRole: 'owner', testInjected: true as const };
const request = (suffix = '') => new Request(`https://worker.test/api/admin/account-integrity${suffix}`);
const name = (collection: string, id: string) => `projects/test-project/databases/(default)/documents/${collection}/${id}`;
const firestoreValue = (value: any): any => {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, firestoreValue(nested)])) } };
};
const found = (collection: string, id: string, data: Record<string, any>) => ({
  found: { name: name(collection, id), updateTime: '2026-10-09T00:00:00.000Z', fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)])) },
});
const complete = (role: 'customer' | 'provider' | 'driver', extra: Record<string, any> = {}) => ({
  role,
  email: `${role}@example.test`,
  nameEn: `${role} account`,
  countryCode: 'SA',
  region: 'Riyadh',
  city: 'Riyadh',
  ...(role === 'provider' ? { providerType: 'company', providerOnboardingCompleted: true } : {}),
  ...extra,
});

beforeEach(() => {
  __adminTest.setFirestore(undefined);
  __adminTest.setAccountIntegrityDirectory(undefined);
  __adminTest.setBatchGet(undefined);
});
afterEach(() => {
  __adminTest.setFirestore(undefined);
  __adminTest.setAccountIntegrityDirectory(undefined);
  __adminTest.setBatchGet(undefined);
});

describe('Account Integrity bounded read path', () => {
  test('loads 20 identities through one unordered 60-document batch and preserves completeness semantics', async () => {
    const ids = [
      'customer-complete', 'customer-incomplete', 'provider-complete', 'provider-incomplete',
      'driver-complete', 'driver-missing-profile', 'missing-user', 'provider-no-profile',
      'disabled-auth', 'legacy-identity', 'store-review',
      ...Array.from({ length: 9 }, (_, index) => `filler-${index + 1}`),
    ];
    let directoryCalls = 0;
    let batchCalls = 0;
    let capturedReferences: Array<{ collection: string; id: string }> = [];
    __adminTest.setAccountIntegrityDirectory(async () => {
      directoryCalls += 1;
      return { identities: ids.map(id => ({ uid: id, email: `${id}@example.test`, emailVerified: true, disabled: id === 'disabled-auth' })), nextPageToken: 'next-page' };
    });
    __adminTest.setBatchGet(async references => {
      batchCalls += 1;
      capturedReferences = references;
      const users = new Map<string, Record<string, any>>([
        ['customer-complete', complete('customer')],
        ['customer-incomplete', { role: 'customer', email: 'customer-incomplete@example.test' }],
        ['provider-complete', complete('provider')],
        ['provider-incomplete', { ...complete('provider'), providerType: '' }],
        ['driver-complete', complete('driver')],
        ['driver-missing-profile', complete('driver')],
        ['provider-no-profile', complete('provider')],
        ['disabled-auth', complete('customer')],
        ['legacy-identity', { email: 'legacy@example.test', nameEn: 'Legacy' }],
        ['store-review', complete('customer', { accountPurpose: 'store_review' })],
        ...Array.from({ length: 9 }, (_, index) => [`filler-${index + 1}`, complete('customer')] as [string, Record<string, any>]),
      ]);
      const providerProfiles = new Set(['provider-complete', 'provider-incomplete']);
      const driverProfiles = new Set(['driver-complete']);
      return references.map(reference => {
        const data = reference.collection === 'users' ? users.get(reference.id)
          : reference.collection === 'providerProfiles' && providerProfiles.has(reference.id) ? { operational: true }
            : reference.collection === 'driverProfiles' && driverProfiles.has(reference.id) ? { active: true }
              : undefined;
        return data ? found(reference.collection, reference.id, data) : { missing: name(reference.collection, reference.id) };
      }).reverse();
    });

    const result = await handleAdmin(request('?limit=20'), env, actor) as any;
    expect(result.success).toBe(true);
    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe('next-page');
    expect(directoryCalls).toBe(1);
    expect(batchCalls).toBe(1);
    expect(capturedReferences).toHaveLength(60);
    expect(new Set(capturedReferences.map(reference => reference.collection))).toEqual(new Set(['users', 'driverProfiles', 'providerProfiles']));

    const byId = new Map(result.items.map((item: any) => [item.id, item]));
    expect((byId.get('customer-complete') as any).registrationState).toBe('complete');
    expect((byId.get('customer-incomplete') as any).registrationState).toBe('incomplete');
    expect((byId.get('provider-complete') as any).registrationState).toBe('complete');
    expect((byId.get('provider-incomplete') as any).registrationState).toBe('incomplete');
    expect((byId.get('driver-complete') as any).registrationState).toBe('complete');
    expect((byId.get('driver-missing-profile') as any).missingFields).toContain('driver_profile');
    expect((byId.get('missing-user') as any).missingFields).toContain('user_profile');
    expect((byId.get('provider-no-profile') as any).registrationState).toBe('complete');
    expect((byId.get('provider-no-profile') as any).hasProviderProfile).toBe(false);
    expect((byId.get('disabled-auth') as any).registrationState).toBe('complete');
    expect((byId.get('legacy-identity') as any).registrationState).toBe('incomplete');
    expect((byId.get('store-review') as any).registrationState).toBe('complete');
  });

  test('returns stable safe errors for directory, storage and OAuth failures', async () => {
    __adminTest.setAccountIntegrityDirectory(async () => { throw new Error('provider response must stay private'); });
    expect(await handleAdmin(request(), env, actor)).toMatchObject({ status: 503, errorCode: 'ACCOUNT_INTEGRITY_AUTH_DIRECTORY_UNAVAILABLE' });

    __adminTest.setAccountIntegrityDirectory(async () => ({ identities: [{ uid: 'one', email: null, emailVerified: false, disabled: false }], nextPageToken: null }));
    __adminTest.setBatchGet(async () => { throw new Error('firestore private detail'); });
    expect(await handleAdmin(request(), env, actor)).toMatchObject({ status: 503, errorCode: 'ACCOUNT_INTEGRITY_STORAGE_UNAVAILABLE' });

    __adminTest.setBatchGet(async () => { throw new Error('Google service account unavailable'); });
    const oauth = await handleAdmin(request(), env, actor) as any;
    expect(oauth).toMatchObject({ status: 503, errorCode: 'ACCOUNT_INTEGRITY_STORAGE_UNAVAILABLE' });
    expect(JSON.stringify(oauth)).not.toContain('Google service account');
  });

  test('keeps permission and request validation failures distinct', async () => {
    const forbidden = await handleAdmin(request(), env, { ...actor, permissionRole: 'admin' }) as any;
    expect(forbidden.status).toBe(403);
    for (const suffix of ['?limit=21', '?limit=1.5', '?registrationState=unknown', `?q=${encodeURIComponent('bad\u0000query')}`]) {
      const result = await handleAdmin(request(suffix), env, actor) as any;
      expect(result).toMatchObject({ status: 400, errorCode: 'ACCOUNT_INTEGRITY_INVALID_REQUEST' });
    }
  });
});
