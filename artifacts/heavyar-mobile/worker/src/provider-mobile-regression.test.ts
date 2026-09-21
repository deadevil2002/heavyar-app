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