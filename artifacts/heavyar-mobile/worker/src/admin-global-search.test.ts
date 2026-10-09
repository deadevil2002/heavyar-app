import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { __adminTest, handleAdmin, type AdminUser } from './admin';
import type { Env } from './index';

const env = { FIREBASE_PROJECT_ID: 'search-project' } as Env;
const owner: AdminUser = { uid: 'owner', admin: true, role: 'super_admin', permissionRole: 'owner', emailVerified: true, testInjected: true };
const request = (path: string) => new Request(`https://worker.test/api/admin/${path}`);
const documentName = (collection: string, id: string) => `projects/search-project/databases/(default)/documents/${collection}/${id}`;

const value = (encoded: any): any => encoded?.stringValue
  ?? (encoded?.integerValue !== undefined ? Number(encoded.integerValue) : undefined)
  ?? encoded?.doubleValue
  ?? encoded?.booleanValue
  ?? encoded?.timestampValue
  ?? (encoded?.nullValue !== undefined ? null : undefined);

function matchesFilter(data: Record<string, any>, filter: any): boolean {
  if (filter.fieldFilter) {
    const actual = filter.fieldFilter.field.fieldPath.split('.').reduce((current: any, key: string) => current?.[key], data);
    const expected = value(filter.fieldFilter.value);
    if (filter.fieldFilter.op === 'EQUAL') return actual === expected;
    if (filter.fieldFilter.op === 'GREATER_THAN_OR_EQUAL') return typeof actual === 'string' && actual >= expected;
    if (filter.fieldFilter.op === 'LESS_THAN_OR_EQUAL') return typeof actual === 'string' && actual <= expected;
    return false;
  }
  const children = filter.compositeFilter?.filters || [];
  return filter.compositeFilter?.op === 'OR'
    ? children.some((child: any) => matchesFilter(data, child))
    : children.every((child: any) => matchesFilter(data, child));
}

function indexedFixtures(fixtures: Record<string, Array<{ id: string; data: Record<string, any> }>>, queryCount: { value: number }) {
  return (collection: string, _before: string, limit: number, query?: any) => {
    queryCount.value += 1;
    const rows = (fixtures[collection] || []).filter(row => !query?.where || matchesFilter(row.data, query.where));
    const order = query?.orderBy?.[0]?.field?.fieldPath;
    if (order && order !== '__name__') rows.sort((left, right) => String(left.data[order] || '').localeCompare(String(right.data[order] || '')) || left.id.localeCompare(right.id));
    return rows.slice(0, limit).map(row => ({ name: documentName(collection, row.id), data: row.data }));
  };
}

function users(count = 200) {
  return Array.from({ length: count }, (_, index) => ({
    id: `user-${String(index).padStart(3, '0')}`,
    data: {
      uid: `user-${String(index).padStart(3, '0')}`,
      role: 'customer',
      email: `person${index}@example.test`,
      emailLower: `person${index}@example.test`,
      nameAr: `مستخدم ${String(index).padStart(3, '0')}`,
      nameEn: `Person ${String(index).padStart(3, '0')}`,
      accountStatus: 'active',
      emailVerified: true,
    },
  }));
}

beforeEach(() => {
  __adminTest.setFirestore(undefined);
  __adminTest.setQuery(undefined);
  __adminTest.setBatchGet(undefined);
  __adminTest.setAccountIntegrityDirectory(undefined);
  __adminTest.setAuthIdentityLookup(undefined);
});

afterEach(() => {
  __adminTest.setFirestore(undefined);
  __adminTest.setQuery(undefined);
  __adminTest.setBatchGet(undefined);
  __adminTest.setAccountIntegrityDirectory(undefined);
  __adminTest.setAuthIdentityLookup(undefined);
});

describe('global indexed Admin search', () => {
  test('finds exact user and driver document identifiers without a list-page scan', async () => {
    __adminTest.setQuery(() => []);
    __adminTest.setFirestore((collection, id) => {
      if (collection === 'users' && id === 'customer-exact') return { uid: id, role: 'customer', nameEn: 'Exact Customer', accountStatus: 'active' };
      if (collection === 'driverProfiles' && id === 'driver-exact') return { uid: id, nameEn: 'Exact Driver', countryCode: 'SA', active: true };
      if (collection === 'users' && id === 'driver-exact') return { uid: id, role: 'driver', nameEn: 'Exact Driver', accountStatus: 'active' };
      return null;
    });

    const user = await handleAdmin(request('users?q=customer-exact'), env, owner) as any;
    const driver = await handleAdmin(request('drivers?q=driver-exact'), env, owner) as any;

    expect(user.items.map((item: any) => item.id)).toEqual(['customer-exact']);
    expect(driver.items.map((item: any) => item.id)).toEqual(['driver-exact']);
    expect(user.nextCursor).toBeUndefined();
    expect(driver.nextCursor).toBeUndefined();
  });

  test('finds user exact email and name prefix outside the first 20-record list page', async () => {
    const records = users();
    records[199].data.email = records[199].data.emailLower = 'outside@example.test';
    records[199].data.nameEn = 'Zircon Outside';
    const queryCount = { value: 0 };
    __adminTest.setQuery(indexedFixtures({ users: records }, queryCount));
    __adminTest.setFirestore(() => null);

    const email = await handleAdmin(request('users?q=OUTSIDE%40EXAMPLE.TEST&limit=20'), env, owner) as any;
    expect(email).toMatchObject({ success: true, searchMode: 'indexed', query: 'outside@example.test' });
    expect(email.items.map((item: any) => item.id)).toContain('user-199');
    expect(email.nextCursor).toBeUndefined();

    const name = await handleAdmin(request('users?q=Zircon&limit=20'), env, owner) as any;
    expect(name.items.map((item: any) => item.id)).toContain('user-199');
    expect(name.searchBudget.firestoreQueries <= 5).toBe(true);
    expect(name.searchBudget.sourceDocuments <= 50).toBe(true);
    expect(queryCount.value).toBeGreaterThan(0);
  });

  test('provider prefix search enforces role in Firestore and excludes wrong-role duplicates', async () => {
    const records = users();
    records[198].data = { ...records[198].data, role: 'customer', nameAr: 'مؤسسة الأطلس' };
    records[199].data = { ...records[199].data, role: 'provider', nameAr: 'مؤسسة الأطلس للمعدات' };
    const observed: any[] = [];
    const counter = { value: 0 };
    const execute = indexedFixtures({ users: records }, counter);
    __adminTest.setQuery((collection, before, limit, query) => { observed.push(query); return execute(collection, before, limit, query); });
    __adminTest.setFirestore(() => null);

    const result = await handleAdmin(request(`providers?q=${encodeURIComponent('مؤسسة الأطلس')}&limit=20`), env, owner) as any;
    expect(result.items.map((item: any) => item.id)).toEqual(['user-199']);
    expect(observed.some(query => JSON.stringify(query.where).includes('role') && JSON.stringify(query.where).includes('provider'))).toBe(true);
  });

  test('finds driver name prefix outside the first page and preserves canonical driver role', async () => {
    const profiles = Array.from({ length: 200 }, (_, index) => ({ id: `driver-${index}`, data: { uid: `driver-${index}`, displayName: `Driver ${index}`, nameEn: `Driver ${index}`, countryCode: 'SA' } }));
    profiles[199].data.nameEn = 'Zenith Operator';
    profiles[199].data.displayName = 'Zenith Operator';
    const counter = { value: 0 };
    __adminTest.setQuery(indexedFixtures({ driverProfiles: profiles }, counter));
    __adminTest.setFirestore((collection, id) => collection === 'users' && id.startsWith('driver-') ? { uid: id, role: id === 'driver-199' ? 'driver' : 'customer', accountStatus: 'active', emailVerified: true } : null);

    const result = await handleAdmin(request('drivers?q=Zenith&limit=20'), env, owner) as any;
    expect(result.items.map((item: any) => item.id)).toEqual(['driver-199']);
  });

  test('finds equipment public number, title prefix, and request public number outside first pages', async () => {
    const equipment = Array.from({ length: 200 }, (_, index) => ({ id: `equipment-${index}`, data: { ownerUid: 'provider', publicEquipmentNumber: `HV-EQP-${String(index).padStart(6, '0')}`, titleEn: `Machine ${index}` } }));
    equipment[199].data.publicEquipmentNumber = 'HV-EQP-999999';
    equipment[199].data.titleEn = 'Zenith Excavator';
    const requests = Array.from({ length: 200 }, (_, index) => ({ id: `request-${index}`, data: { publicRequestNumber: `HV-REQ-${String(index).padStart(6, '0')}`, customerUid: 'customer', providerUid: 'provider' } }));
    requests[199].data.publicRequestNumber = 'HV-REQ-999999';
    const counter = { value: 0 };
    __adminTest.setQuery(indexedFixtures({ equipment, equipmentRequests: requests }, counter));
    __adminTest.setFirestore(() => null);

    const equipmentNumber = await handleAdmin(request('equipment?q=hv-eqp-999999&limit=20'), env, owner) as any;
    expect(equipmentNumber.items.map((item: any) => item.id)).toContain('equipment-199');
    const equipmentTitle = await handleAdmin(request('equipment?q=Zenith&limit=20'), env, owner) as any;
    expect(equipmentTitle.items.map((item: any) => item.id)).toContain('equipment-199');
    const rental = await handleAdmin(request('requests?q=hv-req-999999&limit=20'), env, owner) as any;
    expect(rental.items.map((item: any) => item.id)).toContain('request-199');
  });

  test('finds payments, invoices, refunds, and complaints by their indexed exact identifiers', async () => {
    const counter = { value: 0 };
    __adminTest.setQuery(indexedFixtures({
      payments: [{ id: 'payment-outside', data: { requestId: 'request-outside', paymentId: 'payment-canonical', providerReference: 'tap-reference-outside' } }],
      invoices: [{ id: 'invoice-outside', data: { requestId: 'request-outside', invoiceNumber: 'HV-INV-999999' } }],
      refunds: [{ id: 'refund-outside', data: { requestId: 'request-outside', refundId: 'refund-canonical', publicRequestNumber: 'HV-REQ-999999' } }],
      complaints: [{ id: 'complaint-outside', data: { requestId: 'request-outside', status: 'open' } }],
    }, counter));
    __adminTest.setFirestore(() => null);

    const payment = await handleAdmin(request('payments?q=tap-reference-outside'), env, owner) as any;
    const invoice = await handleAdmin(request('invoices?q=HV-INV-999999'), env, owner) as any;
    const refund = await handleAdmin(request('refunds?q=refund-canonical'), env, owner) as any;
    const complaint = await handleAdmin(request('complaints?q=request-outside'), env, owner) as any;

    expect(payment.items.map((item: any) => item.id)).toEqual(['payment-outside']);
    expect(invoice.items.map((item: any) => item.id)).toEqual(['invoice-outside']);
    expect(refund.items.map((item: any) => item.id)).toEqual(['refund-outside']);
    expect(complaint.items.map((item: any) => item.id)).toEqual(['complaint-outside']);
    expect([payment, invoice, refund, complaint].every(result => result.nextCursor === undefined)).toBe(true);
  });

  test('caps broad prefix results, reports truncation, and stays within the source-read budget', async () => {
    const records = users(70).map((row, index) => ({
      ...row,
      data: { ...row.data, nameAr: `Massive ${String(index).padStart(3, '0')}`, nameEn: `Massive ${String(index).padStart(3, '0')}` },
    }));
    const counter = { value: 0 };
    __adminTest.setQuery(indexedFixtures({ users: records }, counter));
    __adminTest.setFirestore(() => null);

    const result = await handleAdmin(request('users?q=Massive&limit=20'), env, owner) as any;
    expect(result.items).toHaveLength(20);
    expect(result).toMatchObject({ searchMode: 'indexed', truncated: true });
    expect(result.searchBudget.firestoreQueries <= 5).toBe(true);
    expect(result.searchBudget.sourceDocuments <= 50).toBe(true);
  });

  test('dedupes multi-field matches and returns bounded honest negative contracts without 500', async () => {
    const records = users();
    records[199].data.email = records[199].data.emailLower = 'duplicate@example.test';
    records[199].data.nameAr = records[199].data.nameEn = 'duplicate@example.test';
    const counter = { value: 0 };
    __adminTest.setQuery(indexedFixtures({ users: records, equipment: [] }, counter));
    __adminTest.setFirestore(() => null);

    const duplicate = await handleAdmin(request('users?q=duplicate%40example.test&limit=20'), env, owner) as any;
    expect(duplicate.items.filter((item: any) => item.id === 'user-199')).toHaveLength(1);
    const missing = await handleAdmin(request('equipment?q=not-found&limit=20'), env, owner) as any;
    expect(missing).toMatchObject({ success: true, searchMode: 'indexed', items: [] });
    const malformed = await handleAdmin(request('equipment?q=HV-%25%25-bad&limit=20'), env, owner) as any;
    expect(malformed.status).not.toBe(500);
    const oneCharacter = await handleAdmin(request('users?q=Z&limit=20'), env, owner) as any;
    expect(oneCharacter.searchMode).toBe('indexed');
    const empty = await handleAdmin(request('users?q=&limit=20'), env, owner) as any;
    expect(empty.searchMode).toBeUndefined();
    const tooLong = await handleAdmin(request(`users?q=${'x'.repeat(201)}`), env, owner) as any;
    expect(tooLong.status).toBe(400);
    const unauthorized = await handleAdmin(request('users?q=Z'), env, { ...owner, permissionRole: 'marketing' }) as any;
    expect(unauthorized.status).toBe(403);
  });

  test('applies authoritative Auth verification after indexed search and does not refill unboundedly', async () => {
    const records = users();
    records[199].data.email = records[199].data.emailLower = 'verified-filter@example.test';
    const counter = { value: 0 };
    __adminTest.setQuery(indexedFixtures({ users: records }, counter));
    __adminTest.setFirestore(() => null);
    __adminTest.setAuthIdentityLookup(async ({ localIds }) => (localIds || []).map(uid => ({ uid, email: `${uid}@example.test`, emailVerified: false, disabled: false })));

    const result = await handleAdmin(request('users?q=verified-filter%40example.test&emailVerified=true&limit=20'), env, owner) as any;
    expect(result).toMatchObject({ success: true, searchMode: 'indexed', items: [], boundedAuthFiltered: true, truncated: true });
  });

  test('driver exact email missing its source profile returns a safe empty result', async () => {
    __adminTest.setFirestore(() => null);
    __adminTest.setQuery(() => []);
    __adminTest.setAuthIdentityLookup(async ({ emails }) => emails?.length ? [{ uid: 'missing-driver', email: emails[0], emailVerified: true, disabled: false }] : []);
    const result = await handleAdmin(request('drivers?q=driver%40example.test'), env, owner) as any;
    expect(result).toMatchObject({ success: true, searchMode: 'indexed', items: [] });
  });
});

describe('Account Integrity indexed search', () => {
  const completeUser = { role: 'customer', email: 'outside@example.test', nameEn: 'Outside Person', countryCode: 'SA', region: 'Riyadh', city: 'Riyadh' };

  function batchFor(userId: string) {
    return async (references: Array<{ collection: string; id: string }>) => references.map(reference => reference.collection === 'users' && reference.id === userId
      ? { found: { name: documentName('users', userId), fields: Object.fromEntries(Object.entries(completeUser).map(([key, item]) => [key, typeof item === 'string' ? { stringValue: item } : { nullValue: null }])) } }
      : { missing: documentName(reference.collection, reference.id) });
  }

  test('exact UID and email bypass Auth directory pagination and keep one profile batchGet', async () => {
    let directoryCalls = 0;
    let lookupCalls = 0;
    let batchCalls = 0;
    __adminTest.setAccountIntegrityDirectory(async () => { directoryCalls += 1; return { identities: [], nextPageToken: null }; });
    __adminTest.setAuthIdentityLookup(async lookup => {
      lookupCalls += 1;
      const uid = lookup.localIds?.[0] || 'outside-identity';
      return [{ uid, email: 'outside@example.test', emailVerified: true, disabled: false }];
    });
    const batch = batchFor('outside-identity');
    __adminTest.setBatchGet(async references => { batchCalls += 1; return batch(references); });
    __adminTest.setQuery(() => []);

    const byEmail = await handleAdmin(request('account-integrity?q=OUTSIDE%40EXAMPLE.TEST'), env, owner) as any;
    expect(byEmail).toMatchObject({ success: true, searchMode: 'indexed' });
    expect(byEmail.items[0].id).toBe('outside-identity');
    expect(directoryCalls).toBe(0);
    expect(lookupCalls).toBe(1);
    expect(batchCalls).toBe(1);

    __adminTest.setBatchGet(batchFor('outside-identity'));
    const byUid = await handleAdmin(request('account-integrity?q=outside-identity'), env, owner) as any;
    expect(byUid.items[0].id).toBe('outside-identity');
    expect(directoryCalls).toBe(0);
  });

  test('name prefix finds an identity outside the first Auth page without directory scan or N+1 reads', async () => {
    const targetUid = 'identity-199';
    const userRows = users().map((row, index) => ({ ...row, id: `identity-${index}`, data: { ...row.data, nameEn: index === 199 ? 'Zenith Integrity' : row.data.nameEn } }));
    const counter = { value: 0 };
    let batchCalls = 0;
    __adminTest.setQuery(indexedFixtures({ users: userRows }, counter));
    __adminTest.setAuthIdentityLookup(async ({ localIds }) => (localIds || []).filter(uid => uid === targetUid).map(uid => ({ uid, email: 'outside@example.test', emailVerified: true, disabled: false })));
    const batch = batchFor(targetUid);
    __adminTest.setBatchGet(async references => { batchCalls += 1; return batch(references); });
    __adminTest.setAccountIntegrityDirectory(async () => { throw new Error('directory scan must not run'); });

    const result = await handleAdmin(request('account-integrity?q=Zenith'), env, owner) as any;
    expect(result.items.map((item: any) => item.id)).toEqual([targetUid]);
    expect(result.searchBudget.firestoreQueries).toBe(2);
    expect(result.searchBudget.sourceDocuments <= 50).toBe(true);
    expect(batchCalls).toBe(1);
  });
});
