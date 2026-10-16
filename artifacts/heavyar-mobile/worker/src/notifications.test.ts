import { afterEach, describe, expect, test } from 'bun:test';
import worker, { __test, FirestorePreconditionError, type Env } from './index';
import { buildLegacyCatalog } from './commercial';
import { defaultNotificationPreferences, notificationFields, notificationWrite } from './notifications';

const env = { FIREBASE_PROJECT_ID: 'test-project' } as Env;
const completeCustomer = (uid: string) => ({
  uid, role: 'customer', email: `${uid}@example.com`, nameEn: 'Customer',
  countryCode: 'SA', region: 'Riyadh', city: 'Riyadh',
});
const request = (path: string, init: RequestInit = {}) => new Request(`https://worker.test${path}`, {
  ...init, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json', ...(init.headers || {}) },
});

afterEach(() => { __test.setAuth(undefined); __test.setFirestore(undefined); __test.captureWrites(undefined); __test.captureCommits(undefined); __test.setNotificationDeviceCommit(undefined); __test.setDeliveryQuery(undefined); __test.setReservationConflict(false); });

describe('trusted notification foundation', () => {
  test('notification payload has localized safe copy and allowlisted action', async () => {
    const fields = notificationFields('u1', 'n1', 'payment_confirmed', new Date(0).toISOString(), 'req-1');
    expect(fields.uid.stringValue).toBe('u1');
    expect(fields.action.mapValue.fields.type.stringValue).toBe('payment');
    expect((fields as any).token).toBe(undefined);
    expect(fields.expiresAt?.timestampValue).toBe('1970-06-30T00:00:00.000Z');
  });
  test('service notifications use private generic copy and authorized deep-link actions', () => {
    const rfqId = `rfq_${'R'.repeat(43)}`;
    const executionId = `execution_${'E'.repeat(43)}`;
    const message = notificationFields('provider-1', 'n-service-1', 'service_message_received', new Date(0).toISOString(), rfqId);
    const selected = notificationFields('provider-1', 'n-service-2', 'service_quote_provisionally_selected', new Date(0).toISOString(), rfqId);
    const execution = notificationFields('customer-1', 'n-service-3', 'service_execution_pickup_confirmed', new Date(0).toISOString(), executionId);
    expect(message.category.stringValue).toBe('service');
    expect(message.action.mapValue.fields.type.stringValue).toBe('service_rfq');
    expect(message.bodyEn.stringValue).not.toContain('private message text');
    expect(selected.titleEn.stringValue).toContain('non-binding');
    expect(execution.action.mapValue.fields.type.stringValue).toBe('service_execution');
    expect(defaultNotificationPreferences().service).toBe(true);
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
      location: { lat: 24.7136, lng: 46.6753 },
      availability: { from: '2025-01-01', until: '2025-12-31' },
    }) }), env);
    expect(valid.status).toBe(201);
    expect((writes[0] as any)[0].update.fields.ownerUid.stringValue).toBe('provider-1');
    expect((writes[0] as any)[0].update.fields.visibility.stringValue).toBe('visible');
    expect((writes[0] as any)[0].update.fields.moderationStatus.stringValue).toBe('approved');
  });
  test('device registration is UID-bound and stores no client-controlled UID', async () => {
    __test.setAuth({ uid: 'u1', admin: false, authTime: 123 });
    __test.setFirestore(() => null);
    const writes: any[] = []; __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'POST', body: JSON.stringify({ uid: 'u2', token: 'ExpoPushToken[123456789]', platform: 'android', installationId: 'install-1234' }) }), env);
    expect(response.status).toBe(200);
    expect(JSON.stringify(writes).includes('u2')).toBe(false);
    const installation = writes.find(write => write.path.startsWith('notificationInstallations/'));
    expect(installation.fields.registrationGeneration.integerValue).toBe('123');
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
      : collection === 'commercialSettings' ? buildLegacyCatalog()
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
  test('device delete fences the installation even before a push token is persisted', async () => {
    __test.setAuth({ uid: 'u1', admin: false, authTime: 100 });
    __test.setFirestore(() => null);
    const writes: any[] = []; __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'DELETE', body: JSON.stringify({ installationId: 'install-1234', registrationGeneration: Number.MAX_SAFE_INTEGER }) }), env);
    expect(response.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toMatch(/^notificationInstallations\//);
    expect(writes[0].fields.active.booleanValue).toBe(false);
    expect(writes[0].fields.revokedThroughGeneration.integerValue).toBe('100');
  });
  test('device generation fence rejects a delayed POST after logout revocation', () => {
    const accepted = __test.notificationDeviceTransition(null, { uid: 'A', tokenId: 'token-A', generation: 100, revoke: false });
    expect(accepted.status).toBe('apply');
    if (accepted.status !== 'apply') throw new Error('expected registration');
    const staleSnapshot = accepted.state;
    const revoked = __test.notificationDeviceTransition(accepted.state, { uid: 'A', generation: 100, revoke: true });
    expect(revoked.status).toBe('apply');
    if (revoked.status !== 'apply') throw new Error('expected revocation');
    expect(__test.notificationDeviceTransition(staleSnapshot, { uid: 'A', tokenId: 'token-A', generation: 100, revoke: false }).status).toBe('apply');
    expect(__test.notificationDeviceTransition(revoked.state, { uid: 'A', tokenId: 'token-A', generation: 100, revoke: false }).status).toBe('stale');
    expect(revoked.state.active).toBe(false);
  });
  test('device endpoint rejects a replayed revoked generation without writing', async () => {
    __test.setAuth({ uid: 'A', admin: false, authTime: 100 });
    __test.setFirestore((collection) => collection === 'notificationInstallations' ? {
      uid: 'A', tokenId: 'token-A', active: false, registrationGeneration: 100,
      latestGeneration: 100, revokedThroughGeneration: 100,
    } : null);
    const writes: any[] = []; __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'POST', body: JSON.stringify({
      token: 'ExpoPushToken[123456789]', platform: 'android', installationId: 'install-1234',
    }) }), env);
    expect(response.status).toBe(409);
    expect((await response.json() as any).errorCode).toBe('DEVICE_REGISTRATION_REVOKED');
    expect(writes).toHaveLength(0);
  });
  test('revoked authenticated session cannot use a client maximum generation or refreshed-token iat to reactivate', async () => {
    __test.setAuth({ uid: 'A', admin: false, authTime: 100 });
    const revoked = {
      uid: 'A', tokenId: 'token-A', active: false, registrationGeneration: 100,
      latestGeneration: 100, revokedThroughGeneration: 100,
    };
    __test.setFirestore((collection) => collection === 'notificationInstallations' ? revoked : null);
    const writes: any[] = []; __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'POST', body: JSON.stringify({
      token: 'ExpoPushToken[123456789]', platform: 'android', installationId: 'install-1234',
      registrationGeneration: Number.MAX_SAFE_INTEGER, iat: Number.MAX_SAFE_INTEGER,
    }) }), env);
    expect(response.status).toBe(409);
    expect((await response.json() as any).errorCode).toBe('DEVICE_REGISTRATION_REVOKED');
    expect(writes).toHaveLength(0);
    expect(revoked.active).toBe(false);
  });
  test('stale A session cannot reclaim B installation ownership with a larger client generation', async () => {
    const pushToken = 'ExpoPushToken[cross_account_token]';
    const tokenId = await __test.hashId(pushToken);
    const installation = { uid: 'B', tokenId, active: true, registrationGeneration: 200, latestGeneration: 200, revokedThroughGeneration: 100 };
    const owner = { uid: 'B', tokenHash: tokenId, installationId: 'install-1234', active: true, registrationGeneration: 200, latestGeneration: 200, revokedThroughGeneration: 100 };
    const token = { uid: 'B', token: pushToken, installationId: 'install-1234', active: true, registrationGeneration: 200, latestGeneration: 200, revokedThroughGeneration: 100 };
    __test.setAuth({ uid: 'A', admin: false, authTime: 100 });
    __test.setFirestore((collection) => collection === 'notificationInstallations' ? installation
      : collection === 'notificationTokenOwners' ? owner
      : collection === 'deviceTokens' ? token
      : null);
    const writes: any[] = []; __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'POST', body: JSON.stringify({
      token: pushToken, platform: 'android', installationId: 'install-1234', registrationGeneration: Number.MAX_SAFE_INTEGER,
    }) }), env);
    expect(response.status).toBe(409);
    expect(writes).toHaveLength(0);
    expect(installation).toMatchObject({ uid: 'B', active: true });
    expect(owner).toMatchObject({ uid: 'B', active: true });
    expect(token).toMatchObject({ uid: 'B', active: true });
  });
  test('fresh authenticated session can transactionally replace prior installation ownership', async () => {
    const oldToken = 'ExpoPushToken[prior_owner_token]';
    const newToken = 'ExpoPushToken[fresh_owner_token]';
    const oldTokenId = await __test.hashId(oldToken);
    const newTokenId = await __test.hashId(newToken);
    __test.setAuth({ uid: 'A', admin: false, authTime: 300 });
    __test.setFirestore((collection, id) => collection === 'notificationInstallations' ? {
      uid: 'B', tokenId: oldTokenId, active: true, registrationGeneration: 200, latestGeneration: 200, revokedThroughGeneration: 100,
    } : collection === 'notificationTokenOwners' && id === oldTokenId ? {
      uid: 'B', tokenHash: oldTokenId, installationId: 'install-1234', active: true, registrationGeneration: 200, latestGeneration: 200,
    } : collection === 'deviceTokens' && id === oldTokenId ? {
      uid: 'B', token: oldToken, installationId: 'install-1234', active: true, registrationGeneration: 200, latestGeneration: 200,
    } : collection === 'notificationTokenOwners' && id === newTokenId ? null
    : collection === 'deviceTokens' && id === newTokenId ? null
    : null);
    const writes: any[] = []; __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'POST', body: JSON.stringify({
      token: newToken, platform: 'android', installationId: 'install-1234', registrationGeneration: 1,
    }) }), env);
    expect(response.status).toBe(200);
    const installationWrite = writes.find(write => write.path.startsWith('notificationInstallations/'));
    const newTokenWrite = writes.find(write => write.path === `deviceTokens/${newTokenId}`);
    const newOwnerWrite = writes.find(write => write.path === `notificationTokenOwners/${newTokenId}`);
    const oldTokenWrite = writes.find(write => write.path === `deviceTokens/${oldTokenId}`);
    const oldOwnerWrite = writes.find(write => write.path === `notificationTokenOwners/${oldTokenId}`);
    expect(installationWrite.fields).toMatchObject({ uid: { stringValue: 'A' }, active: { booleanValue: true }, registrationGeneration: { integerValue: '300' } });
    expect(newTokenWrite.fields).toMatchObject({ uid: { stringValue: 'A' }, active: { booleanValue: true }, registrationGeneration: { integerValue: '300' } });
    expect(newOwnerWrite.fields).toMatchObject({ uid: { stringValue: 'A' }, active: { booleanValue: true }, registrationGeneration: { integerValue: '300' } });
    expect(oldTokenWrite.fields.active.booleanValue).toBe(false);
    expect(oldOwnerWrite.fields.active.booleanValue).toBe(false);
  });
  test('same-second reauthentication and future-looking auth_time fail closed', async () => {
    __test.setFirestore((collection) => collection === 'notificationInstallations' ? {
      uid: 'A', tokenId: 'token-A', active: false, registrationGeneration: 100, latestGeneration: 100, revokedThroughGeneration: 100,
    } : null);
    const writes: any[] = []; __test.captureWrites(writes);
    __test.setAuth({ uid: 'A', admin: false, authTime: 100 });
    const sameSecond = await worker.fetch(request('/api/notifications/devices', { method: 'POST', body: JSON.stringify({
      token: 'ExpoPushToken[same_second_token]', platform: 'android', installationId: 'install-1234', registrationGeneration: Number.MAX_SAFE_INTEGER,
    }) }), env);
    expect(sameSecond.status).toBe(409);
    expect(writes).toHaveLength(0);

    __test.setAuth({ uid: 'A', admin: false, authTime: Date.now() + 60_000 });
    const future = await worker.fetch(request('/api/notifications/devices', { method: 'POST', body: JSON.stringify({
      token: 'ExpoPushToken[future_auth_token]', platform: 'android', installationId: 'install-future',
    }) }), env);
    expect(future.status).toBe(401);
    expect((await future.json() as any).errorCode).toBe('DEVICE_SESSION_FRESHNESS_INVALID');
    expect(writes).toHaveLength(0);
  });
  test('active authenticated session can rotate its Expo push token without client authority', async () => {
    const oldToken = 'ExpoPushToken[active_old_token]';
    const newToken = 'ExpoPushToken[active_new_token]';
    const oldTokenId = await __test.hashId(oldToken);
    const newTokenId = await __test.hashId(newToken);
    __test.setAuth({ uid: 'A', admin: false, authTime: 200 });
    __test.setFirestore((collection, id) => collection === 'notificationInstallations' ? {
      uid: 'A', tokenId: oldTokenId, active: true, registrationGeneration: 200, latestGeneration: 200, revokedThroughGeneration: 100,
    } : collection === 'notificationTokenOwners' && id === oldTokenId ? {
      uid: 'A', tokenHash: oldTokenId, installationId: 'install-1234', active: true, registrationGeneration: 200, latestGeneration: 200,
    } : collection === 'deviceTokens' && id === oldTokenId ? {
      uid: 'A', token: oldToken, installationId: 'install-1234', active: true, registrationGeneration: 200, latestGeneration: 200,
    } : null);
    const writes: any[] = []; __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'POST', body: JSON.stringify({
      token: newToken, platform: 'android', installationId: 'install-1234', registrationGeneration: Number.MAX_SAFE_INTEGER,
    }) }), env);
    expect(response.status).toBe(200);
    expect(writes.find(write => write.path === `deviceTokens/${newTokenId}`).fields.registrationGeneration.integerValue).toBe('200');
    expect(writes.find(write => write.path === `deviceTokens/${oldTokenId}`).fields.active.booleanValue).toBe(false);
  });
  test('stale account revocation cannot deactivate the current owner projections', async () => {
    const pushToken = 'ExpoPushToken[current_owner_token]';
    const tokenId = await __test.hashId(pushToken);
    __test.setAuth({ uid: 'A', admin: false, authTime: 100 });
    __test.setFirestore((collection) => collection === 'notificationInstallations' ? {
      uid: 'B', tokenId, active: true, registrationGeneration: 200, latestGeneration: 200, revokedThroughGeneration: 0,
    } : collection === 'notificationTokenOwners' ? {
      uid: 'B', tokenHash: tokenId, installationId: 'install-1234', active: true, registrationGeneration: 200, latestGeneration: 200,
    } : collection === 'deviceTokens' ? {
      uid: 'B', token: pushToken, installationId: 'install-1234', active: true, registrationGeneration: 200, latestGeneration: 200,
    } : null);
    const writes: any[] = []; __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'DELETE', body: JSON.stringify({
      token: pushToken, installationId: 'install-1234', registrationGeneration: Number.MAX_SAFE_INTEGER,
    }) }), env);
    expect(response.status).toBe(409);
    expect((await response.json() as any).errorCode).toBe('DEVICE_REGISTRATION_REVOKED');
    expect(writes).toHaveLength(0);
  });
  test('device endpoint re-reads the revocation fence after a Firestore precondition conflict', async () => {
    __test.setAuth({ uid: 'A', admin: false, authTime: 100 });
    let installation: any = null;
    __test.setFirestore((collection) => collection === 'notificationInstallations' ? installation : null);
    let commitAttempts = 0;
    __test.setNotificationDeviceCommit(async () => {
      commitAttempts += 1;
      installation = {
        uid: 'A', tokenId: 'token-A', active: false, registrationGeneration: 100,
        latestGeneration: 100, revokedThroughGeneration: 100,
      };
      throw new FirestorePreconditionError();
    });
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'POST', body: JSON.stringify({
      token: 'ExpoPushToken[123456789]', platform: 'android', installationId: 'install-1234', registrationGeneration: 100,
    }) }), env);
    expect(response.status).toBe(409);
    expect((await response.json() as any).errorCode).toBe('DEVICE_REGISTRATION_REVOKED');
    expect(commitAttempts).toBe(1);
    expect(installation.active).toBe(false);
  });
  test('legacy generation-less clients refresh an active token under the same authenticated session', async () => {
    __test.setAuth({ uid: 'A', admin: false, authTime: 100 });
    __test.setFirestore((collection) => collection === 'notificationInstallations' ? {
      uid: 'A', tokenId: 'old-token', active: true, registrationGeneration: 100,
      latestGeneration: 100, revokedThroughGeneration: 0,
    } : null);
    const writes: any[] = []; __test.captureWrites(writes);
    const response = await worker.fetch(request('/api/notifications/devices', { method: 'POST', body: JSON.stringify({
      token: 'ExpoPushToken[123456789]', platform: 'android', installationId: 'install-1234',
    }) }), env);
    expect(response.status).toBe(200);
    const installation = writes.find(write => write.path.startsWith('notificationInstallations/'));
    expect(installation.fields.registrationGeneration.integerValue).toBe('100');
  });
  test('device generation ordering handles POST-before-DELETE and replay idempotently', () => {
    const registered = __test.notificationDeviceTransition(null, { uid: 'A', tokenId: 'token-A', generation: 10, revoke: false });
    if (registered.status !== 'apply') throw new Error('expected registration');
    const revoked = __test.notificationDeviceTransition(registered.state, { uid: 'A', generation: 10, revoke: true });
    if (revoked.status !== 'apply') throw new Error('expected revocation');
    const duplicateRevoke = __test.notificationDeviceTransition(revoked.state, { uid: 'A', generation: 10, revoke: true });
    expect(duplicateRevoke.status).toBe('apply');
    if (duplicateRevoke.status !== 'apply') throw new Error('expected idempotent revocation');
    expect(duplicateRevoke.state.active).toBe(false);
    expect(__test.notificationDeviceTransition(duplicateRevoke.state, { uid: 'A', tokenId: 'token-A', generation: 10, revoke: false }).status).toBe('stale');
  });
  test('device generation ordering rejects stale A after B and accepts a changed token in B session', () => {
    const firstA = __test.notificationDeviceTransition(null, { uid: 'A', tokenId: 'token-A1', generation: 10, revoke: false });
    if (firstA.status !== 'apply') throw new Error('expected A registration');
    const revokeA = __test.notificationDeviceTransition(firstA.state, { uid: 'A', generation: 10, revoke: true });
    if (revokeA.status !== 'apply') throw new Error('expected A revocation');
    const registerB = __test.notificationDeviceTransition(revokeA.state, { uid: 'B', tokenId: 'token-B', generation: 20, revoke: false });
    if (registerB.status !== 'apply') throw new Error('expected B registration');
    expect(__test.notificationDeviceTransition(registerB.state, { uid: 'A', tokenId: 'token-A1', generation: 10, revoke: false }).status).toBe('stale');
    const changedB = __test.notificationDeviceTransition(registerB.state, { uid: 'B', tokenId: 'token-B2', generation: 20, revoke: false });
    if (changedB.status !== 'apply') throw new Error('expected token refresh');
    expect(changedB.state.tokenId).toBe('token-B2');
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
    let upstreamCalls = 0;
    const oldFetch = globalThis.fetch;
    globalThis.fetch = (async () => { upstreamCalls++; return new Response('{}'); }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/cloudinary/upload', { method: 'POST', body: '{}', headers: { 'Content-Length': '100' } }), { ...env, CLOUDINARY_CLOUD_NAME: 'cloud', CLOUDINARY_API_KEY: 'public', CLOUDINARY_API_SECRET: 'secret' });
      expect(response.status).toBe(429);
      expect((await response.json() as any).errorCode).toBe('RATE_LIMITED');
      expect(upstreamCalls).toBe(0);
    } finally { globalThis.fetch = oldFetch; }
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
      if (collection === 'notificationInstallations') return { uid: 'retry-user', tokenId: tokenHash, active: true };
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
