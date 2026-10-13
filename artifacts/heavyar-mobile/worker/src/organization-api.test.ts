import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash, generateKeyPairSync } from 'node:crypto';
import worker, { __test, type Env } from './index';

type Stored = { fields: Record<string, any>; updateTime: string; version: number };

const encode = (value: any): any => value === null ? { nullValue: null }
  : typeof value === 'boolean' ? { booleanValue: value }
    : typeof value === 'number' ? Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
      : typeof value === 'string' ? (/^\d{4}-\d{2}-\d{2}T/.test(value) ? { timestampValue: value } : { stringValue: value })
        : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
          : { mapValue: { fields: Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key, encode(item)])) } };
const decodeValue = (value: any): any => value?.nullValue === null ? null
  : value?.integerValue !== undefined ? Number(value.integerValue)
    : value?.doubleValue ?? value?.booleanValue ?? value?.stringValue ?? value?.timestampValue
      ?? (value?.arrayValue ? (value.arrayValue.values || []).map(decodeValue) : value?.mapValue ? decodeFields(value.mapValue.fields || {}) : undefined);
const decodeFields = (fields: Record<string, any>) => Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
const digest = (value: string) => createHash('sha256').update(value).digest('base64url');

function firestoreHarness() {
  const documents = new Map<string, Stored>();
  const transactions = new Map<string, Map<string, number | null>>();
  let txSequence = 0, version = 0, beforeCommit: (() => void) | undefined;
  const put = (path: string, value: Record<string, unknown>) => documents.set(path, { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])), updateTime: `2026-10-13T00:00:${String(++version).padStart(2, '0')}.000000Z`, version });
  const data = (path: string) => documents.has(path) ? decodeFields(documents.get(path)!.fields) : null;
  const docResponse = (path: string, stored: Stored) => ({ name: `projects/test-project/databases/(default)/documents/${path}`, fields: stored.fields, updateTime: stored.updateTime });
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'organization-test-token', expires_in: 3600 });
    if (url.includes(':beginTransaction')) { const id = `tx-${++txSequence}`; transactions.set(id, new Map()); return Response.json({ transaction: id }); }
    if (url.includes(':rollback')) { transactions.delete(String(JSON.parse(String(init?.body || '{}')).transaction || '')); return Response.json({}); }
    if (url.includes(':runQuery')) {
      const query = JSON.parse(String(init?.body || '{}')).structuredQuery || {};
      const collection = String(query.from?.[0]?.collectionId || '');
      const filter = query.where?.fieldFilter;
      const field = String(filter?.field?.fieldPath || '');
      const expected = decodeValue(filter?.value);
      const cursor = String(query.startAt?.values?.[0]?.referenceValue || '');
      const rows = [...documents.entries()]
        .filter(([path, stored]) => path.startsWith(`${collection}/`) && (!filter || decodeFields(stored.fields)[field] === expected))
        .map(([path, stored]) => docResponse(path, stored)).filter(document => !cursor || document.name > cursor)
        .sort((a, b) => a.name.localeCompare(b.name)).slice(0, Number(query.limit || 100));
      return Response.json(rows.map(document => ({ document })));
    }
    if (url.includes(':batchGet')) {
      const body = JSON.parse(String(init?.body || '{}'));
      return Response.json((body.documents || []).map((name: string) => {
        const path = name.split('/documents/')[1], stored = documents.get(path);
        return stored ? { found: docResponse(path, stored) } : { missing: name };
      }));
    }
    if (url.includes(':commit')) {
      const body = JSON.parse(String(init?.body || '{}')), snapshot = transactions.get(String(body.transaction || ''));
      const writes = Array.isArray(body.writes) ? body.writes : [];
      const hook = beforeCommit; beforeCommit = undefined; hook?.();
      for (const write of writes) {
        const path = String(write.update?.name || write.delete || write.verify || '').split('/documents/')[1] || '';
        const current = documents.get(path);
        const observed = snapshot?.get(path);
        if (observed !== undefined && observed !== (current?.version ?? null)) return Response.json({ error: { status: 'ABORTED' } }, { status: 409 });
        if (write.currentDocument?.exists === false && current) return Response.json({ error: { status: 'ALREADY_EXISTS' } }, { status: 409 });
        if (write.currentDocument?.updateTime && write.currentDocument.updateTime !== current?.updateTime) return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 409 });
      }
      for (const write of writes) {
        const path = String(write.update?.name || write.delete || write.verify || '').split('/documents/')[1] || '';
        if (write.verify) continue;
        if (write.delete) { documents.delete(path); continue; }
        const current = documents.get(path), merged = write.updateMask ? { ...(current?.fields || {}), ...write.update.fields } : write.update.fields;
        documents.set(path, { fields: merged, updateTime: `2026-10-13T00:01:${String(++version).padStart(2, '0')}.000000Z`, version });
      }
      transactions.delete(String(body.transaction || ''));
      return Response.json({});
    }
    const marker = '/documents/';
    if (url.includes(marker)) {
      const parsed = new URL(url), path = decodeURIComponent(parsed.pathname.split(marker)[1]);
      const stored = documents.get(path), transaction = parsed.searchParams.get('transaction');
      if (transaction) transactions.get(transaction)?.set(path, stored?.version ?? null);
      await Promise.resolve();
      return stored ? Response.json(docResponse(path, stored)) : new Response('', { status: 404 });
    }
    return new Response('', { status: 404 });
  };
  return { documents, put, data, beforeNextCommit(hook: () => void) { beforeCommit = hook; }, fetch: fetch as typeof globalThis.fetch };
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { FIREBASE_PROJECT_ID: 'test-project', FIREBASE_CLIENT_EMAIL: 'service@test-project.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), CORS_ORIGINS: 'https://heavyar.com' } as Env;
const originalFetch = globalThis.fetch;
const ownerUid = 'company-owner', employeeUid = 'employee-user';
const organizationId = `org_${digest(`organization-owner:${ownerUid}`)}`;
const ownerMemberId = `orgmem_${digest(`organization-member:${ownerUid}:${ownerUid}`)}`;
const employeeMemberId = `orgmem_${digest(`organization-member:${ownerUid}:${employeeUid}`)}`;
const call = (path: string, method = 'GET', body?: unknown) => worker.fetch(new Request(`https://worker.test${path}`, { method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);

function setOwner() {
  __test.setAuth({ uid: ownerUid, admin: false, email: 'owner@example.test', emailVerified: true, accountProfile: { role: 'provider', providerType: 'company', accountStatus: 'active', nameEn: 'Owner Company' } });
}
function setEmployee(emailVerified = true) {
  __test.setAuth({ uid: employeeUid, admin: false, email: 'employee@example.test', emailVerified, accountProfile: { role: 'customer', accountStatus: 'active' } });
}

describe('company organization API security', () => {
  beforeEach(() => { __test.setFirestore(undefined); __test.captureCommits(undefined); __test.resetMutationLimits(); });
  afterEach(() => { globalThis.fetch = originalFetch; __test.setAuth(undefined); __test.resetMutationLimits(); });

  test('company provisioning is transactional, idempotent, and denied to individuals', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    setOwner();
    const [first, second] = await Promise.all([call('/api/organizations', 'POST', {}), call('/api/organizations', 'POST', {})]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(store.data(`organizations/${organizationId}`)).toMatchObject({ ownerUid, status: 'active', legalAuthorityVerified: false, verificationStatus: 'unverified' });
    expect(store.data(`organizationMemberships/${ownerMemberId}`)).toMatchObject({ uid: ownerUid, role: 'owner', organizationId });
    expect([...store.documents.keys()].some(key => key.startsWith('staffMembers/') || key.startsWith('staffInvitations/'))).toBe(false);

    __test.setAuth({ uid: 'individual-provider', admin: false, accountProfile: { role: 'provider', providerType: 'individual', accountStatus: 'active' } });
    expect((await call('/api/organizations', 'POST', {})).status).toBe(403);
  });

  test('invites are hashed, bounded, isolated from Admin, and duplicate pending invitations are denied', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch; setOwner();
    store.put(`organizations/${organizationId}`, { ownerUid, status: 'active', accountPurpose: 'standard', displayName: 'Owner Company', verificationStatus: 'unverified', legalAuthorityVerified: false });
    store.put(`organizationMemberships/${ownerMemberId}`, { organizationId, uid: ownerUid, role: 'owner', status: 'active', capabilities: [], accountPurpose: 'standard' });
    __test.setAuthenticatedMutationLimiter(async () => ({ status: 'limited', retryAfterSeconds: 41 }));
    const limited = await call(`/api/organizations/${organizationId}/invitations`, 'POST', { email: 'employee@example.test', capabilities: ['equipment.view'] });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('41');
    __test.setAuthenticatedMutationLimiter(async () => ({ status: 'unavailable' }));
    expect((await call(`/api/organizations/${organizationId}/invitations`, 'POST', { email: 'employee@example.test', capabilities: ['equipment.view'] })).status).toBe(503);
    __test.resetMutationLimits();
    const first = await call(`/api/organizations/${organizationId}/invitations`, 'POST', { email: 'employee@example.test', capabilities: ['equipment.view'] });
    expect(first.status).toBe(201);
    const response: any = await first.json();
    expect(response.token).toMatch(/^orginv_[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/);
    const stored = store.data(`organizationInvitations/${response.invitation.id}`);
    if (!stored) throw new Error('Expected stored organization invitation');
    expect(stored.email).toBeUndefined();
    expect(stored.token).toBeUndefined();
    expect(stored.tokenHash).not.toContain(response.token.split('.')[1]);
    expect((await call(`/api/organizations/${organizationId}/invitations`, 'POST', { email: 'employee@example.test', capabilities: ['equipment.view'] })).status).toBe(409);
    expect((await call(`/api/organizations/${organizationId}/invitations`, 'POST', { email: 'employee@example.test', capabilities: ['platform.admin'] })).status).toBe(400);
    expect((await call(`/api/organizations/${organizationId}/invitations/${response.invitation.id}/cancel`, 'POST', {})).status).toBe(200);
    expect(store.data(`organizationInvitations/${response.invitation.id}`)).toMatchObject({ status: 'cancelled', tokenHash: '' });
    const replacement = await call(`/api/organizations/${organizationId}/invitations`, 'POST', { email: 'employee@example.test', capabilities: ['equipment.view'] });
    expect(replacement.status).toBe(201);
    expect((await replacement.json() as any).token).not.toBe(response.token);
  });

  test('verified matching email accepts once under concurrency and cross-company forgery fails', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    const invitationId = `orginv_${digest(`organization-invitation:${ownerUid}:employee@example.test`)}`;
    const secret = 'ab'.repeat(32);
    store.put(`organizations/${organizationId}`, { ownerUid, status: 'active', accountPurpose: 'standard', displayName: 'Owner Company', verificationStatus: 'unverified', legalAuthorityVerified: false });
    store.put(`organizationInvitations/${invitationId}`, { organizationId, emailHash: digest('organization-email:employee@example.test'), emailHint: 'e***@example.test', tokenHash: digest(`organization-invitation-token:${secret}`), status: 'pending', capabilities: ['equipment.view'], accountPurpose: 'standard', expiresAt: '2030-10-20T00:00:00.000Z', createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z' });
    setEmployee(false);
    expect((await call('/api/organization-invitations/accept', 'POST', { token: `${invitationId}.${secret}` })).status).toBe(403);
    setEmployee(true);
    const [a, b] = await Promise.all([call('/api/organization-invitations/accept', 'POST', { token: `${invitationId}.${secret}` }), call('/api/organization-invitations/accept', 'POST', { token: `${invitationId}.${secret}` })]);
    expect([a.status, b.status].sort()).toEqual([200, 403]);
    expect(store.data(`organizationMemberships/${employeeMemberId}`)).toMatchObject({ uid: employeeUid, organizationId, role: 'employee', status: 'active', capabilities: ['equipment.view'] });
    expect(store.data(`organizationInvitations/${invitationId}`)).toMatchObject({ status: 'accepted', tokenHash: '' });

    const otherOrgId = `org_${digest('organization-owner:other-owner')}`;
    store.put(`organizations/${otherOrgId}`, { ownerUid: 'other-owner', status: 'active', accountPurpose: 'standard' });
    expect((await call(`/api/organizations/${otherOrgId}/workspace/equipment`)).status).toBe(403);
  });

  test('live membership revocation is immediate, sole owner is protected, and projections exclude private fields', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`organizations/${organizationId}`, { ownerUid, status: 'active', accountPurpose: 'standard', displayName: 'Owner Company', verificationStatus: 'unverified', legalAuthorityVerified: false });
    store.put(`organizationMemberships/${ownerMemberId}`, { organizationId, uid: ownerUid, role: 'owner', status: 'active', capabilities: [], accountPurpose: 'standard' });
    store.put(`organizationMemberships/${employeeMemberId}`, { organizationId, uid: employeeUid, role: 'employee', status: 'active', capabilities: ['equipment.view'], accountPurpose: 'standard' });
    store.put('equipment/listing-1', { ownerUid, titleAr: 'حفارة', titleEn: 'Excavator', exactLocation: { latitude: 24, longitude: 46 }, pricing: { daily: 10000 }, customerUid: 'private', isActive: true, moderationStatus: 'approved' });
    store.put('equipmentRequests/request-1', { providerUid: ownerUid, customerUid: 'private-customer', status: 'pending', equipmentSnapshot: { titleAr: 'حفارة', titleEn: 'Excavator', location: { latitude: 24, longitude: 46 } }, pricingSnapshot: { baseAmountMinor: 10000 }, notes: 'private notes', requestedStartAt: '2026-10-20T00:00:00.000Z', requestedEndAt: '2026-10-21T00:00:00.000Z' });
    setEmployee();
    const equipment = await call(`/api/organizations/${organizationId}/workspace/equipment`);
    expect(equipment.status).toBe(200);
    const serialized = JSON.stringify(await equipment.json());
    expect(serialized).toContain('Excavator');
    expect(serialized).not.toContain('exactLocation');
    expect(serialized).not.toContain('pricing');
    expect((await call(`/api/organizations/${organizationId}/workspace/bookings`)).status).toBe(403);

    setOwner();
    const bookings = await call(`/api/organizations/${organizationId}/workspace/bookings`);
    expect(bookings.status).toBe(200);
    const bookingProjection = JSON.stringify(await bookings.json());
    expect(bookingProjection).toContain('request-1');
    expect(bookingProjection).not.toContain('customerUid');
    expect(bookingProjection).not.toContain('pricingSnapshot');
    expect(bookingProjection).not.toContain('private notes');
    expect(bookingProjection).not.toContain('latitude');
    expect((await call(`/api/organizations/${organizationId}/members/${ownerMemberId}/revoke`, 'POST', {})).status).toBe(409);
    expect((await call(`/api/organizations/${organizationId}/members/${employeeMemberId}/revoke`, 'POST', {})).status).toBe(200);
    setEmployee();
    expect((await call(`/api/organizations/${organizationId}/workspace/equipment`)).status).toBe(403);
  });

  test('owner capability updates use an exact revision and never create platform authority', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch; setOwner();
    store.put(`organizations/${organizationId}`, { ownerUid, status: 'active', accountPurpose: 'standard', displayName: 'Owner Company' });
    store.put(`organizationMemberships/${ownerMemberId}`, { organizationId, uid: ownerUid, role: 'owner', status: 'active', capabilities: [], accountPurpose: 'standard' });
    store.put(`organizationMemberships/${employeeMemberId}`, { organizationId, uid: employeeUid, role: 'employee', status: 'active', capabilities: ['equipment.view'], accountPurpose: 'standard' });
    const revision = store.documents.get(`organizationMemberships/${employeeMemberId}`)!.updateTime;
    const updated = await call(`/api/organizations/${organizationId}/members/${employeeMemberId}/capabilities`, 'PATCH', { expectedRevision: revision, capabilities: ['equipment.manage', 'bookings.respond'] });
    expect(updated.status).toBe(200);
    expect(store.data(`organizationMemberships/${employeeMemberId}`)?.capabilities).toEqual(['equipment.manage', 'bookings.respond']);
    expect((await call(`/api/organizations/${organizationId}/members/${employeeMemberId}/capabilities`, 'PATCH', { expectedRevision: revision, capabilities: ['bookings.operate'] })).status).toBe(409);
    const freshRevision = store.documents.get(`organizationMemberships/${employeeMemberId}`)!.updateTime;
    expect((await call(`/api/organizations/${organizationId}/members/${employeeMemberId}/capabilities`, 'PATCH', { expectedRevision: freshRevision, capabilities: ['platform.admin'] })).status).toBe(400);
    expect([...store.documents.entries()].some(([path, record]) => path.startsWith('organizationAudit/') && store.data(path)?.actorUid === ownerUid && store.data(path)?.ownerUid === ownerUid)).toBe(true);
  });

  test('delegated equipment metadata is allowlisted and concurrent revocation aborts the write', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`organizations/${organizationId}`, { ownerUid, status: 'active', accountPurpose: 'standard', displayName: 'Owner Company' });
    store.put(`organizationMemberships/${employeeMemberId}`, { organizationId, uid: employeeUid, role: 'employee', status: 'active', capabilities: ['equipment.manage'], accountPurpose: 'standard' });
    store.put('equipment/listing-1', { ownerUid, titleAr: 'حفارة', titleEn: 'Excavator', descriptionAr: '', descriptionEn: '', countryCode: 'SA', availability: { from: '2026-10-13', blocked: [], temporarilyUnavailable: false }, visibility: 'visible', isActive: true, moderationStatus: 'approved' });
    setEmployee();
    const revision = store.documents.get('equipment/listing-1')!.updateTime;
    expect((await call(`/api/organizations/${organizationId}/equipment/listing-1/metadata`, 'PATCH', { expectedRevision: revision, patch: { pricing: { daily: 1 } } })).status).toBe(400);
    const saved = await call(`/api/organizations/${organizationId}/equipment/listing-1/metadata`, 'PATCH', { expectedRevision: revision, patch: { descriptionEn: 'Updated safely' } });
    expect(saved.status).toBe(200);
    expect(store.data('equipment/listing-1')).toMatchObject({ descriptionEn: 'Updated safely', ownerUid });
    expect(store.data('equipment/listing-1')?.pricing).toBeUndefined();

    const availabilityRevision = store.documents.get('equipment/listing-1')!.updateTime;
    const availability = await call(`/api/organizations/${organizationId}/equipment/listing-1/availability`, 'PATCH', { expectedRevision: availabilityRevision, availability: { from: '2026-10-13', blocked: [], temporarilyUnavailable: true } });
    expect(availability.status).toBe(200);
    expect(store.data('equipment/listing-1')?.availability?.temporarilyUnavailable).toBe(true);

    const secondRevision = store.documents.get('equipment/listing-1')!.updateTime;
    store.beforeNextCommit(() => store.put(`organizationMemberships/${employeeMemberId}`, { organizationId, uid: employeeUid, role: 'employee', status: 'revoked', capabilities: [], accountPurpose: 'standard' }));
    const revoked = await call(`/api/organizations/${organizationId}/equipment/listing-1/metadata`, 'PATCH', { expectedRevision: secondRevision, patch: { descriptionEn: 'Must not commit' } });
    expect(revoked.status).toBe(409);
    expect(store.data('equipment/listing-1')?.descriptionEn).toBe('Updated safely');
  });

  test('delegated booking actions preserve provider ownership and forbid financial finalization', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`organizations/${organizationId}`, { ownerUid, status: 'active', accountPurpose: 'standard', displayName: 'Owner Company' });
    store.put(`organizationMemberships/${employeeMemberId}`, { organizationId, uid: employeeUid, role: 'employee', status: 'active', capabilities: ['bookings.respond', 'bookings.operate'], accountPurpose: 'standard' });
    store.put('users/customer-user', { role: 'customer', accountStatus: 'active' });
    store.put(`users/${ownerUid}`, { role: 'provider', providerType: 'company', accountStatus: 'active' });
    store.put('equipment/listing-1', { ownerUid, countryCode: 'SA', category: 'excavator', availability: { from: '2026-10-13', until: null, blocked: [], temporarilyUnavailable: false } });
    const pricingSnapshot = { rateAmountMinor: 10000, currency: 'SAR' }, commercialSnapshot = { platformFeeMinor: 1000, providerReceivableMinor: 9000 };
    store.put('equipmentRequests/request-1', { providerUid: ownerUid, customerUid: 'customer-user', equipmentId: 'listing-1', status: 'pending', requestMode: 'fixed_days', startDate: '2026-10-20', endDate: '2026-10-21', numberOfDays: 2, amount: 200, currency: 'SAR', pricingSnapshot, commercialSnapshot, createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z' });
    setEmployee();
    expect((await call(`/api/organizations/${organizationId}/bookings/request-1/transition`, 'POST', { action: 'complete' })).status).toBe(403);
    const accepted = await call(`/api/organizations/${organizationId}/bookings/request-1/transition`, 'POST', { action: 'accept' });
    expect(accepted.status).toBe(200);
    expect(store.data('equipmentRequests/request-1')).toMatchObject({ status: 'accepted', providerUid: ownerUid });
    expect(store.data('equipmentRequests/request-1')?.lastOrganizationOperation).toMatchObject({ actorMemberId: employeeMemberId, action: 'booking_accept' });
    expect(store.data('equipmentRequests/request-1')?.pricingSnapshot).toEqual(pricingSnapshot);
    expect(store.data('equipmentRequests/request-1')?.commercialSnapshot).toEqual(commercialSnapshot);
    expect(store.data('equipmentRequests/request-1')?.paymentStatus).toBeUndefined();

    store.put('equipmentRequests/request-open', { providerUid: ownerUid, customerUid: 'customer-user', equipmentId: 'listing-1', status: 'in_progress', requestMode: 'open_ended', amount: 100, startedAt: '2026-10-12T00:00:00.000Z', createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z' });
    expect((await call(`/api/organizations/${organizationId}/bookings/request-open/transition`, 'POST', { action: 'request_completion' })).status).toBe(200);
    expect(store.data('equipmentRequests/request-open')).toMatchObject({ status: 'completion_requested', completionRequestedBy: employeeUid });

    store.put('equipmentRequests/request-revoked', { providerUid: ownerUid, customerUid: 'customer-user', equipmentId: 'listing-1', status: 'pending', requestMode: 'fixed_days', startDate: '2026-10-24', endDate: '2026-10-25', amount: 200, createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z' });
    store.beforeNextCommit(() => store.put(`organizationMemberships/${employeeMemberId}`, { organizationId, uid: employeeUid, role: 'employee', status: 'revoked', capabilities: [], accountPurpose: 'standard' }));
    expect((await call(`/api/organizations/${organizationId}/bookings/request-revoked/transition`, 'POST', { action: 'reject' })).status).toBe(409);
    expect(store.data('equipmentRequests/request-revoked')?.status).toBe('pending');
  });

  test('expired, mismatched, replayed, suspended and Store Review cross-purpose invitations fail closed', async () => {
    const cases = [
      { email: 'wrong@example.test', expiresAt: '2030-10-20T00:00:00.000Z', accountPurpose: 'standard', expected: 403 },
      { email: 'employee@example.test', expiresAt: '2020-01-01T00:00:00.000Z', accountPurpose: 'standard', expected: 403 },
      { email: 'employee@example.test', expiresAt: '2030-10-20T00:00:00.000Z', accountPurpose: 'store_review', expected: 403 },
    ];
    for (const [index, entry] of cases.entries()) {
      const store = firestoreHarness(); globalThis.fetch = store.fetch;
      const invitationId = `orginv_${digest(`case-${index}`)}`, secret = 'cd'.repeat(32);
      store.put(`organizations/${organizationId}`, { ownerUid, status: 'active', accountPurpose: entry.accountPurpose });
      store.put(`organizationInvitations/${invitationId}`, { organizationId, emailHash: digest(`organization-email:${entry.email}`), tokenHash: digest(`organization-invitation-token:${secret}`), status: 'pending', capabilities: ['bookings.view'], accountPurpose: entry.accountPurpose, expiresAt: entry.expiresAt });
      setEmployee();
      expect((await call('/api/organization-invitations/accept', 'POST', { token: `${invitationId}.${secret}` })).status).toBe(entry.expected);
    }
    const suspended = firestoreHarness(); globalThis.fetch = suspended.fetch;
    __test.setAuth({ uid: employeeUid, admin: false, email: 'employee@example.test', emailVerified: true, accountProfile: { role: 'customer', accountStatus: 'suspended' } });
    expect((await call('/api/organization-invitations/accept', 'POST', { token: `orginv_${'a'.repeat(43)}.${'aa'.repeat(32)}` })).status).toBe(403);
  });
});
