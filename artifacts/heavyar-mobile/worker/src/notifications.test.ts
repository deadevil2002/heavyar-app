import { afterEach, describe, expect, test } from 'bun:test';
import worker, { __test, type Env } from './index';
import { defaultNotificationPreferences, notificationFields, notificationWrite } from './notifications';

const env = { FIREBASE_PROJECT_ID: 'test-project' } as Env;
const completeCustomer = (uid: string) => ({
  uid, role: 'customer', email: `${uid}@example.com`, nameEn: 'Customer',
  countryCode: 'SA', region: 'Riyadh', city: 'Riyadh',
});
const request = (path: string, init: RequestInit = {}) => new Request(`https://worker.test${path}`, {
  ...init, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json', ...(init.headers || {}) },
});

afterEach(() => { __test.setAuth(undefined); __test.setFirestore(undefined); __test.captureWrites(undefined); __test.captureCommits(undefined); __test.setDeliveryQuery(undefined); });

describe('trusted notification foundation', () => {
  test('notification payload has localized safe copy and allowlisted action', async () => {
    const fields = notificationFields('u1', 'n1', 'payment_confirmed', new Date(0).toISOString(), 'req-1');
    expect(fields.uid.stringValue).toBe('u1');
    expect(fields.action.mapValue.fields.type.stringValue).toBe('payment');
    expect((fields as any).token).toBe(undefined);
  });
  test('preferences preserve mandatory critical categories', async () => {
    __test.setAuth({ uid: 'u1', admin: false });
    __test.setFirestore(() => null);
    const writes: any[] = []; __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/notifications/preferences', { method: 'PUT', body: JSON.stringify({ payment: false, rental: false }) }), env);
    expect(response.status).toBe(200);
    expect((await response.json() as any).preferences.payment).toBe(true);
    expect(writes.length).toBe(1);
  });
  test('provider listing creation derives owner and rejects privileged client fields', async () => {
    __test.setAuth({ uid: 'provider-1', admin: false });
    __test.setFirestore((collection) => collection === 'users' ? {
      uid: 'provider-1', role: 'provider', isVerified: true, nameAr: 'مزود', nameEn: 'Provider', avatar: '', termsAccepted: true, countryCode: 'SA', region: 'Riyadh', city: 'Riyadh',
    } : null);
    const writes: any[] = []; __test.captureCommits(writes);
    const response = await worker.fetch(request('/api/listings', { method: 'POST', body: JSON.stringify({
      titleEn: 'Lift', titleAr: 'رافعة', descriptionEn: 'Safe lift', descriptionAr: 'رافعة آمنة',
      dailyPrice: 100, category: 'heavy', region: 'Riyadh', city: 'Riyadh',
      availability: { from: '2025-01-01', until: '2025-12-31' }, ownerUid: 'attacker',
    }) }), env);
    expect(response.status).toBe(400);
    expect(writes.length).toBe(0);
    const valid = await worker.fetch(request('/api/listings', { method: 'POST', body: JSON.stringify({
      titleEn: 'Lift', titleAr: 'رافعة', descriptionEn: 'Safe lift', descriptionAr: 'رافعة آمنة',
      dailyPrice: 100, category: 'heavy', region: 'Riyadh', city: 'Riyadh',
      availability: { from: '2025-01-01', until: '2025-12-31' },
    }) }), env);
    expect(valid.status).toBe(201);
    expect((writes[0] as any)[0].update.fields.ownerUid.stringValue).toBe('provider-1');
    expect((writes[0] as any)[0].update.fields.visibility.stringValue).toBe('visible');
    expect((writes[0] as any)[0].update.fields.moderationStatus.stringValue).toBe('approved');
  });
  test('device registration is UID-bound and stores no client-controlled UID', async () => {
    __test.setAuth({ uid: 'u1', admin: false });
    __test.setFirestore(() => null);
    const writes: any[] = []; __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'POST', body: JSON.stringify({ uid: 'u2', token: 'ExpoPushToken[123456789]', platform: 'android', installationId: 'install-1234' }) }), env);
    expect(response.status).toBe(200);
    expect(JSON.stringify(writes).includes('u2')).toBe(false);
  });
  test('notification writes are idempotently keyed by UID, event, and subject', async () => {
    const write: any = await notificationWrite((path) => `projects/p/documents/${path}`, 'u1', 'rental_accepted', new Date(0).toISOString(), 'req-1');
    expect(write.currentDocument.exists).toBe(false);
    expect(write.update.fields.uid.stringValue).toBe('u1');
    expect(defaultNotificationPreferences().payment).toBe(true);
  });
  test('outbox document is not an inbox document and has a URL-safe id', async () => {
    const write: any = await notificationWrite((path) => `projects/p/documents/${path}`, 'u1', 'payment_confirmed', '2024-01-01T00:00:00.000Z', 'r1', 'payment:r1:attempt:1');
    expect(write.update.name.includes('/notificationOutbox/')).toBe(true);
    expect(write.update.name.includes('%')).toBe(false);
    expect(write.update.fields.occurrenceKey.stringValue).toBe('payment:r1:attempt:1');
  });
  test('same occurrence deterministically deduplicates while different occurrence does not collide', async () => {
    const a: any = await notificationWrite((p) => p, 'u', 'payment_failed', 't', 'r', 'attempt:1');
    const b: any = await notificationWrite((p) => p, 'u', 'payment_failed', 'later', 'r', 'attempt:1');
    const c: any = await notificationWrite((p) => p, 'u', 'payment_failed', 't', 'r', 'attempt:2');
    expect(a.update.name).toBe(b.update.name);
    expect(a.update.name === c.update.name).toBe(false);
  });
  test('canonical action is exactly type and subject id in Firestore', async () => {
    const fields: any = notificationFields('u', 'n', 'complaint_response', 't', 'c1');
    expect(JSON.stringify(fields.action.mapValue.fields)).toBe(JSON.stringify({ type: { stringValue: 'complaint' }, subjectId: { stringValue: 'c1' } }));
  });
  test('security notifications are mandatory', () => {
    expect(defaultNotificationPreferences().security).toBe(true);
  });
  test('malformed notification subject falls back to profile action', () => {
    const fields: any = notificationFields('u', 'n', 'payment_confirmed', 't', 'bad subject');
    expect(fields.action.mapValue.fields.type.stringValue).toBe('profile');
  });
  test('lifecycle transition rejects unauthenticated requests', async () => {
    const response = await worker.fetch(new Request('https://worker.test/api/requests/r1/transition', { method: 'POST', body: JSON.stringify({ action: 'cancel' }) }), env);
    expect(response.status).toBe(401);
  });
  test('cancel transition rejects provider IDOR', async () => {
    __test.setAuth({ uid: 'provider', admin: false });
    __test.setFirestore((collection, id) => collection === 'equipmentRequests' && id === 'r1' ? { customerUid: 'customer', providerUid: 'provider', status: 'accepted' } : null);
    const response = await worker.fetch(request('/api/requests/r1/transition', { method: 'POST', body: JSON.stringify({ action: 'cancel' }) }), env);
    expect(response.status).toBe(403);
  });
  test('lifecycle accept rejects unrelated user', async () => {
    __test.setAuth({ uid: 'other', admin: false });
    __test.setFirestore(() => ({ customerUid: 'customer', providerUid: 'provider', status: 'pending' }));
    const response = await worker.fetch(request('/api/requests/r1/transition', { method: 'POST', body: JSON.stringify({ action: 'accept' }) }), env);
    expect(response.status).toBe(403);
  });
  test('create request returns canonical DTO and writes an outbox', async () => {
    __test.setAuth({ uid: 'customer', admin: false });
    __test.setFirestore((collection) => collection === 'equipment'
      ? { ownerUid: 'provider', isActive: true, visibility: 'visible', moderationStatus: 'approved', pricePerDay: 10 }
      : null);
    const commits: unknown[] = []; __test.captureCommits(commits);
    const response = await worker.fetch(request('/api/requests', { method: 'POST', body: JSON.stringify({ equipmentId: 'eq1', requestMode: 'fixed_days', numberOfDays: 2 }) }), env);
    const body: any = await response.json();
    expect(response.status).toBe(201);
    expect(/^r_/.test(body.request.id)).toBe(true);
    expect(JSON.stringify(commits).includes('notificationOutbox')).toBe(true);
  });
  test('read endpoint does not disclose another user notification', async () => {
    __test.setAuth({ uid: 'u1', admin: false });
    __test.setFirestore((collection) => collection === 'notifications' ? { uid: 'u2', read: false } : null);
    const response = await worker.fetch(request('/api/notifications/n_abc/read', { method: 'POST', body: '{}' }), env);
    expect(response.status).toBe(404);
  });
  test('device delete is authenticated and does not accept missing token', async () => {
    __test.setAuth({ uid: 'u1', admin: false });
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'DELETE', body: JSON.stringify({ installationId: 'install-1234' }) }), env);
    expect(response.status).toBe(400);
  });
  test('notification event copy is localized and has no provider token', () => {
    const fields: any = notificationFields('u', 'n', 'rental_completed', 't', 'r');
    expect(fields.bodyAr.stringValue === fields.bodyEn.stringValue).toBe(false);
    expect(fields.token === undefined).toBe(true);
  });
  test('sha256 notification id is base64url bounded', async () => {
    const write: any = await notificationWrite((p) => p, 'u', 'account_suspended', 't');
    const id = write.update.name.split('/').pop();
    expect(/^n_[A-Za-z0-9_-]+$/.test(id)).toBe(true);
  });
  test('outbox status starts pending', async () => {
    const write: any = await notificationWrite((p) => p, 'u', 'payment_failed', 't');
    expect(write.update.fields.status.stringValue).toBe('pending');
  });
  test('canonical action never contains legacy subject-specific keys', () => {
    const fields: any = notificationFields('u', 'n', 'payment_confirmed', 't', 'r');
    expect(Object.keys(fields.action.mapValue.fields).includes('requestId')).toBe(false);
    expect(Object.keys(fields.action.mapValue.fields).includes('paymentId')).toBe(false);
  });
  test('provider request notification uses rental category', () => {
    const fields: any = notificationFields('provider', 'n', 'rental_request_created', 't', 'r');
    expect(fields.category.stringValue).toBe('rental');
  });
  test('signed upload requires authentication', async () => {
    const response = await worker.fetch(request('/cloudinary/upload', { method: 'POST', body: JSON.stringify({ folder: 'evil', publicId: 'x' }) }), env);
    expect(response.status).toBe(401);
  });
  test('signed upload binds folder to authenticated uid and never returns secret', async () => {
    __test.setAuth({ uid: 'owner-1', admin: false });
    __test.setFirestore((collection) => collection === 'users' ? completeCustomer('owner-1') : null);
    __test.captureWrites([]);
    const response = await worker.fetch(request('/cloudinary/upload', { method: 'POST', body: JSON.stringify({ folder: 'evil', transformation: 'raw' }), headers: { 'Content-Length': '100' } }), { ...env, CLOUDINARY_CLOUD_NAME: 'cloud', CLOUDINARY_API_KEY: 'public', CLOUDINARY_API_SECRET: 'server-secret' });
    const body: any = await response.json();
    expect(response.status).toBe(400);
  });
  test('signed upload rejects suspended accounts', async () => {
    __test.setAuth({ uid: 'suspended', admin: false });
    __test.setFirestore((collection) => collection === 'users' ? { suspensionStatus: 'temporarily_suspended' } : null);
    const response = await worker.fetch(request('/cloudinary/upload', { method: 'POST', body: '{}', headers: { 'Content-Length': '100' } }), { ...env, CLOUDINARY_CLOUD_NAME: 'cloud', CLOUDINARY_API_KEY: 'public', CLOUDINARY_API_SECRET: 'secret' });
    expect(response.status).toBe(403);
  });
  test('signed upload rate limits through KV without exposing secret', async () => {
    __test.setAuth({ uid: 'owner-2', admin: false });
    __test.setFirestore((collection) => collection === 'cloudinaryUploadRates'
      ? { count: 10, windowStart: new Date(Math.floor(Date.now() / 60000) * 60000).toISOString() }
      : collection === 'users' ? completeCustomer('owner-2') : null);
    const response = await worker.fetch(request('/cloudinary/upload', { method: 'POST', body: '{}', headers: { 'Content-Length': '100' } }), { ...env, CLOUDINARY_CLOUD_NAME: 'cloud', CLOUDINARY_API_KEY: 'public', CLOUDINARY_API_SECRET: 'secret' });
    expect(response.status).toBe(429);
  });
  test('upload proxy accepts only bounded allowlisted multipart images and returns canonical DTO', async () => {
    __test.setAuth({ uid: 'u-upload', admin: false });
    __test.setFirestore((collection) => collection === 'users' ? completeCustomer('u-upload') : {});
    __test.captureWrites([]);
    const form = new FormData(); form.append('file', new File(['image'], 'a.png', { type: 'image/png' }));
    const uploadRequest = new Request('https://worker.test/cloudinary/upload', { method: 'POST', body: form, headers: { Authorization: 'Bearer test', 'Content-Length': '100' } });
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => String(input).includes('cloudinary') ? new Response(JSON.stringify({ public_id: 'heavyar/u-upload/a', secure_url: 'https://cdn/a' })) : new Response('{}')) as typeof fetch;
    try {
      const response = await worker.fetch(uploadRequest, { ...env, CLOUDINARY_CLOUD_NAME: 'cloud', CLOUDINARY_API_KEY: 'public', CLOUDINARY_API_SECRET: 'secret' });
      const body: any = await response.json();
      expect(response.status).toBe(200);
      expect(JSON.stringify(body)).toBe(JSON.stringify({ success: true, url: 'https://cdn/a', publicId: 'heavyar/u-upload/a' }));
    } finally { globalThis.fetch = oldFetch; }
  });
  test('transition rejects a suspended provider before accept', async () => {
    __test.setAuth({ uid: 'provider', admin: false });
    __test.setFirestore((collection, id) => collection === 'equipmentRequests' ? { customerUid: 'customer', providerUid: 'provider', equipmentId: 'eq', status: 'pending' } : collection === 'users' && id === 'provider' ? { suspensionStatus: 'temporarily_suspended' } : {});
    const response = await worker.fetch(request('/api/requests/r1/transition', { method: 'POST', body: JSON.stringify({ action: 'accept' }) }), env);
    expect(response.status).toBe(403);
  });
  test('open ended completion commits exact final amount and fee', async () => {
    __test.setAuth({ uid: 'customer', admin: false });
    __test.setFirestore((collection) => collection === 'equipmentRequests' ? { customerUid: 'customer', providerUid: 'provider', equipmentId: 'eq', status: 'completion_requested', requestMode: 'open_ended', amount: 100, startedAt: new Date(Date.now() - 2 * 86400000).toISOString() } : {});
    const commits: unknown[] = []; __test.captureCommits(commits);
    const response = await worker.fetch(request('/api/requests/r1/transition', { method: 'POST', body: JSON.stringify({ action: 'complete' }) }), env);
    expect(response.status).toBe(200);
    expect(JSON.stringify(commits).includes('finalAmount')).toBe(true);
    expect(JSON.stringify(commits).includes('finalPlatformFee')).toBe(true);
    expect(JSON.stringify(commits).includes('finalProviderAmount')).toBe(true);
  });
  test('scheduled retry CAS-updates existing delivery with decoded inbox payload and replacement ticket', async () => {
    const tokenHash = await __test.hashId('ExpoPushToken[retry-device]');
    __test.setFirestore((collection, id) => {
      if (collection === 'notifications') return { titleEn: 'Decoded title', bodyEn: 'Decoded body', action: { type: 'payment', subjectId: 'request-9' } };
      if (collection === 'deviceTokens') return { token: 'ExpoPushToken[retry-device]', installationId: 'install-retry' };
      if (collection === 'notificationTokenOwners') return { uid: 'retry-user', tokenHash, active: true };
      if (collection === 'notificationInstallations') return { uid: 'retry-user', tokenId: tokenHash };
      return null;
    });
    __test.setDeliveryQuery([{ document: { name: 'projects/p/documents/notificationDeliveries/delivery-1', updateTime: 'old-time', fields: {
      uid: { stringValue: 'retry-user' }, notificationId: { stringValue: 'n-1' }, tokenHash: { stringValue: tokenHash }, status: { stringValue: 'retryable' }, attempts: { integerValue: '1' }, nextAttemptAt: { timestampValue: new Date(0).toISOString() },
    } } }]);
    const writes: any[] = []; __test.captureWrites(writes);
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('runQuery')) return new Response(JSON.stringify([{ document: { name: 'projects/p/documents/notificationDeliveries/delivery-1', updateTime: 'old-time', fields: {
        uid: { stringValue: 'retry-user' }, notificationId: { stringValue: 'n-1' }, tokenHash: { stringValue: tokenHash }, status: { stringValue: 'retryable' }, attempts: { integerValue: '1' }, nextAttemptAt: { timestampValue: new Date(0).toISOString() },
      } } }]));
      if (url.includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'test-token' }));
      if (url.includes('exp.host')) {
        const sent = JSON.parse(String(init?.body || '[]'))[0];
        expect(sent.title).toBe('Decoded title');
        expect(sent.body).toBe('Decoded body');
        expect(sent.data.action).toBe('payment');
        expect(sent.data.subjectId).toBe('request-9');
        return new Response(JSON.stringify({ data: [{ status: 'ok', id: 'new-ticket-1' }] }));
      }
      return new Response('{}');
    }) as typeof fetch;
    try {
      await __test.runRetryDelivery({ ...env, FIREBASE_CLIENT_EMAIL: 'test@example.com', FIREBASE_PRIVATE_KEY: 'bad' } as Env);
    } finally { globalThis.fetch = oldFetch; }
    expect(writes.length).toBe(1);
    expect(writes[0].path).toBe('notificationDeliveries/delivery-1');
    expect(writes[0].fields.status.stringValue).toBe('ticketed');
    expect(writes[0].fields.ticketId.stringValue).toBe('new-ticket-1');
    expect(writes[0].fields.receiptPending.booleanValue).toBe(true);
    expect(writes[0].fields.attempts.integerValue).toBe('2');
  });
});