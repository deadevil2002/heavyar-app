import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import worker, { __test, type Env } from './index';

const env = { FIREBASE_PROJECT_ID: 'test-project' } as Env;
const uid = 'driver-user';
const validOperator = {
  equipmentCategories: ['excavators'], yearsExperience: 6,
  serviceArea: { countryCode: 'SA', region: 'riyadh', city: 'riyadh' }, availability: 'available',
  declarations: [{ kind: 'permit', title: 'Declared permit' }], description: 'Draft only',
};
const validTransporter = {
  vehicleCategory: 'lowbed', vehicleType: 'Lowbed', capacityKg: 60_000,
  dimensionsMm: { length: 14_000, width: 3_200, height: 4_000 },
  serviceArea: { countryCode: 'SA', region: 'riyadh', city: 'riyadh' }, availability: 'offline',
  declarations: [], description: '',
};
const call = (path: string, method = 'GET', body?: unknown) => worker.fetch(new Request(`https://worker.test${path}`, {
  method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), env);

function setDriver(accountStatus = 'active', moderationStatus = 'approved', profiles: Record<string, unknown> = {}) {
  __test.setAuth({ uid, admin: false, accountProfile: { role: 'driver', accountStatus, accountPurpose: 'standard' } });
  __test.setFirestore((collection, id) => {
    if (collection === 'users' && id === uid) return { role: 'driver', accountStatus, accountPurpose: 'standard' };
    if (collection === 'driverProfiles' && id === uid) return { uid, moderationStatus };
    return profiles[collection] || null;
  });
}

describe('personal M2-D1 service-profile API', () => {
  beforeEach(() => { __test.captureCommits(undefined); __test.resetMutationLimits(); });
  afterEach(() => { __test.setAuth(undefined); __test.setFirestore(undefined); __test.captureCommits(undefined); __test.resetMutationLimits(); });

  test('operator-only, transporter-only and dual profiles remain private non-publishable drafts', async () => {
    setDriver('active', 'approved', {
      operatorProfiles: { requestedCapability: 'operator', draft: validOperator, updatedAt: '2026-10-13T00:00:00.000Z' },
      transporterProfiles: { requestedCapability: 'transporter', draft: validTransporter, updatedAt: '2026-10-13T00:00:00.000Z' },
    });
    const response = await call('/api/service-profiles');
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(await response.json());
    expect(serialized).toContain('operator');
    expect(serialized).toContain('transporter');
    expect(serialized).toContain('declared_unverified');
    expect(serialized).not.toContain('verified_badge');
    expect(serialized).not.toContain('canReceiveRequests":true');
    expect(serialized).not.toContain('discoverable":true');
  });

  test('valid save is bounded, audited, CAS-protected and cannot forge authoritative states', async () => {
    const commits: unknown[] = [];
    setDriver(); __test.captureCommits(commits);
    expect((await call('/api/service-profiles/operator', 'PUT', { expectedRevision: null, draft: validOperator })).status).toBe(200);
    const serialized = JSON.stringify(commits);
    expect(serialized).toContain('/operatorProfiles/driver-user');
    expect(serialized).toContain('/serviceProfileAudit/');
    expect(serialized).toContain('declared_unverified');
    expect(serialized).not.toContain('canReceiveRequests":{"booleanValue":true');
    expect((await call('/api/service-profiles/transporter', 'PUT', { expectedRevision: null, draft: { ...validTransporter, verificationState: 'verified' } })).status).toBe(400);
    expect((await call('/api/service-profiles/transporter', 'PUT', { expectedRevision: null, draft: { ...validTransporter, capacityKg: '60000' } })).status).toBe(400);
  });

  test('existing revisions, restricted accounts, and mutation storage failures fail closed', async () => {
    setDriver('active', 'approved', { operatorProfiles: { requestedCapability: 'operator', draft: validOperator } });
    expect((await call('/api/service-profiles/operator', 'PUT', { expectedRevision: null, draft: validOperator })).status).toBe(409);
    setDriver('suspended');
    expect((await call('/api/service-profiles')).status).toBe(403);
    setDriver();
    __test.setAuthenticatedMutationLimiter(async () => ({ status: 'limited', retryAfterSeconds: 17 }));
    const limited = await call('/api/service-profiles/operator', 'PUT', { expectedRevision: null, draft: validOperator });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('17');
    __test.setAuthenticatedMutationLimiter(async () => ({ status: 'unavailable' }));
    expect((await call('/api/service-profiles/operator', 'PUT', { expectedRevision: null, draft: validOperator })).status).toBe(503);
  });

  test('customer/provider roles and rejected driver profiles cannot create personal service drafts', async () => {
    for (const role of ['customer', 'provider'] as const) {
      __test.setAuth({ uid, admin: false, accountProfile: { role, accountStatus: 'active' } });
      __test.setFirestore((collection, id) => collection === 'users' && id === uid ? { role, accountStatus: 'active' } : collection === 'driverProfiles' && id === uid ? { moderationStatus: 'approved' } : null);
      expect((await call('/api/service-profiles/operator', 'PUT', { expectedRevision: null, draft: validOperator })).status).toBe(403);
    }
    setDriver('active', 'rejected');
    expect((await call('/api/service-profiles/operator', 'PUT', { expectedRevision: null, draft: validOperator })).status).toBe(403);
  });
});
