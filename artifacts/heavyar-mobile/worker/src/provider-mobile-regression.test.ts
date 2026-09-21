import { afterEach, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import worker, { __test, type Env } from './index';

const profile = { uid: 'review-provider', role: 'provider', email: 'heavyar.official+review.provider@gmail.com', accountPurpose: 'store_review', nameAr: 'مزود', nameEn: 'Provider', countryCode: 'SA', region: 'riyadh', city: 'riyadh', termsAccepted: true, providerOnboardingCompleted: true };
const request = (path: string, body?: unknown) => new Request(`https://worker.test${path}`, {
  method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; __test.setAuth(undefined); __test.setFirestore(undefined); __test.captureCommits(undefined); __test.resetMutationLimits(); });
function auth() {
  __test.setAuth({ uid: profile.uid, email: profile.email, emailVerified: true, admin: false });
  __test.setFirestore(collection => collection === 'users' ? profile : null);
}
test('exact current Add V2 shape persists without legacy daily fields and preserves Store Review isolation', async () => {
  auth();
  const writes: any[] = []; __test.captureCommits(writes);
  const response = await worker.fetch(request('/api/listings', {
    titleAr: 'معدة اختبار مؤقتة', titleEn: 'معدة اختبار مؤقتة', descriptionAr: '', descriptionEn: '',
    category: 'excavators', customCategory: '', region: 'riyadh', city: 'riyadh', customCity: '', district: '',
    location: { lat: 0, lng: 0 }, pricingModelVersion: 2,
    pricing: { currency: 'SAR', hourly: { enabled: false, amountMinor: 0 }, daily: { enabled: true, amountMinor: 10000 } },
    countryCode: 'SA', nativeCurrency: 'SAR', displayCurrency: 'SAR',
    images: [{ url: 'https://res.cloudinary.com/qa/image/upload/qa.png', publicId: 'heavyar/review-provider/qa' }],
    availability: { from: new Date().toISOString().slice(0, 10), temporarilyUnavailable: false },
  }), { FIREBASE_PROJECT_ID: 'test-project' } as Env);
  expect(response.status).toBe(201);
  const body: any = await response.json();
  expect(body.listing.visibility).toBe('hidden');
  const listing = writes.flat().find(w => w.update?.name.includes('/equipment/'));
  expect(listing.update.fields.pricingModelVersion.doubleValue).toBe(2);
  expect(listing.update.fields.pricePerDay).toBeUndefined();
  expect(listing.update.fields.ownerUid.stringValue).toBe(profile.uid);
});

test('unread endpoint makes one UID-scoped aggregate, preserves zero, and fails explicitly', async () => {
  auth();
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const env = { FIREBASE_PROJECT_ID: 'count-test', FIREBASE_CLIENT_EMAIL: 'count@test.invalid', FIREBASE_PRIVATE_KEY: key } as Env;
  let aggregate: any[] = [{ result: { aggregateFields: { unread: { integerValue: '0' } } } }];
  let calls = 0;
  globalThis.fetch = (async (input, init) => {
    if (String(input).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'test-only', expires_in: 3600 });
    expect(String(input)).toBe('https://firestore.googleapis.com/v1/projects/count-test/databases/(default)/documents:runAggregationQuery');
    const query = JSON.parse(String(init?.body)).structuredAggregationQuery;
    expect(query.structuredQuery.orderBy).toEqual([{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }]);
    expect(query.structuredQuery.where.compositeFilter.filters).toEqual([
      { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: profile.uid } } },
      { fieldFilter: { field: { fieldPath: 'read' }, op: 'EQUAL', value: { booleanValue: false } } },
    ]);
    calls++;
    return Response.json(aggregate);
  }) as typeof fetch;
  const response = await worker.fetch(request('/api/notifications/unread-count'), env);
  expect(await response.json()).toEqual({ success: true, unreadCount: 0 });
  expect(calls).toBe(1);
  aggregate = [];
  const failed = await worker.fetch(request('/api/notifications/unread-count'), env);
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ success: false, errorCode: 'NOTIFICATION_COUNT_UNAVAILABLE' });
});

test('bounded inbox pages and aggregate agree for legacy/malformed dates and explicit unread state', async () => {
  auth();
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const env = { FIREBASE_PROJECT_ID: 'inbox-test', FIREBASE_CLIENT_EMAIL: 'inbox@test.invalid', FIREBASE_PRIVATE_KEY: key } as Env;
  const root = 'projects/inbox-test/databases/(default)/documents/';
  // Firestore descending type order: string, timestamp, null.
  const documents = [
    { name: `${root}notifications/legacy`, fields: { uid: { stringValue: profile.uid }, read: { booleanValue: false }, createdAt: { stringValue: '2026-09-20' }, titleEn: { stringValue: 'Legacy title' } } },
    { name: `${root}notifications/valid`, fields: { uid: { stringValue: profile.uid }, read: { booleanValue: false }, createdAt: { timestampValue: '2026-09-19T00:00:00Z' }, titleAr: { stringValue: 'إشعار' } } },
    { name: `${root}notifications/malformed`, fields: { uid: { stringValue: profile.uid }, read: { booleanValue: false }, createdAt: { nullValue: null } }, createTime: '2026-09-18T00:00:00Z' },
    { name: `${root}notifications/missing-read`, fields: { uid: { stringValue: profile.uid }, createdAt: { nullValue: null } }, createTime: '2026-09-17T00:00:00Z' },
  ];
  let queryCalls = 0;
  globalThis.fetch = (async (input, init) => {
    if (String(input).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'test-only', expires_in: 3600 });
    const body = JSON.parse(String(init?.body));
    if (String(input).endsWith(':runAggregationQuery')) {
      expect(body.structuredAggregationQuery.structuredQuery.orderBy).toEqual([{ field: { fieldPath: 'createdAt' }, direction: 'ASCENDING' }]);
      return Response.json([{ result: { aggregateFields: { unread: { integerValue: '3' } } } }]);
    }
    expect(String(input)).toBe(`https://firestore.googleapis.com/v1/${root.slice(0, -1)}:runQuery`);
    const query = body.structuredQuery;
    expect(query.limit).toBe(3); // page size 2 plus one bounded lookahead
    expect(query.where.fieldFilter.value.stringValue).toBe(profile.uid);
    expect(query.orderBy.map((order: any) => order.field.fieldPath)).toEqual(['createdAt', '__name__']);
    let start = 0;
    if (query.startAt) {
      expect(query.startAt.before).toBe(false);
      const position = documents.findIndex(doc => doc.name === query.startAt.values[1].referenceValue);
      expect(query.startAt.values[0]).toEqual(documents[position].fields.createdAt);
      start = position + 1;
    }
    queryCalls++;
    return Response.json(documents.slice(start, start + query.limit).map(document => ({ document })));
  }) as typeof fetch;
  const page1: any = await (await worker.fetch(request('/api/notifications?limit=2'), env)).json();
  expect(page1.notifications).toHaveLength(2);
  expect(page1.unreadCount).toBe(3);
  expect(page1.hasMore).toBe(true);
  const page2: any = await (await worker.fetch(request(`/api/notifications?limit=2&cursor=${encodeURIComponent(page1.nextPageToken)}`), env)).json();
  expect(page2.notifications).toHaveLength(2);
  expect(page2.nextPageToken).toBeNull();
  expect(page2.hasMore).toBe(false);
  expect([...page1.notifications, ...page2.notifications].filter(item => !item.read)).toHaveLength(page2.unreadCount);
  expect(page2.notifications[0].titleEn).toBe('Notification details unavailable');
  expect(page2.notifications[0].createdAt).toBe(documents[2].createTime);
  expect(queryCalls).toBe(2);
  const legacyCursor = Buffer.from(JSON.stringify({ id: 'legacy', orderValue: documents[0].fields.createdAt })).toString('base64url');
  const afterString: any = await (await worker.fetch(request(`/api/notifications?limit=2&cursor=${legacyCursor}`), env)).json();
  expect(afterString.notifications.map((item: any) => item.id)).toEqual(['valid', 'malformed']);
  const afterNull: any = await (await worker.fetch(request(`/api/notifications?limit=2&cursor=${afterString.nextPageToken}`), env)).json();
  expect(afterNull.notifications.map((item: any) => item.id)).toEqual(['missing-read']);
  expect(afterNull.nextPageToken).toBeNull();
  const oldCursor = Buffer.from(JSON.stringify({ id: 'valid', createdAt: '2026-09-19T00:00:00Z' })).toString('base64url');
  const oldPage: any = await (await worker.fetch(request(`/api/notifications?limit=2&cursor=${oldCursor}`), env)).json();
  expect(oldPage.notifications.map((item: any) => item.id)).toEqual(['malformed', 'missing-read']);
});