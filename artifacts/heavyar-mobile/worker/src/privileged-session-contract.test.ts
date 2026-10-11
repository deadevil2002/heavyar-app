import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import worker, { __test, type Env } from './index';
import { __adminTest } from './admin';
import {
  __privilegedSessionTest,
  PrivilegedAuthUnavailableError,
} from './privileged-session';

const env = { CORS_ORIGINS: 'https://heavyar-app.web.app', FIREBASE_PROJECT_ID: 'heavyar-test' } as Env;
const authorized = (path: string, method = 'GET', body?: unknown) => new Request(`https://worker.test${path}`, {
  method,
  headers: { Authorization: 'Bearer test', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const setClaimedOwner = () => __test.setAuth({
  uid: 'owner-1',
  admin: true,
  role: 'super_admin',
  permissionRole: 'owner',
  emailVerified: true,
  authTime: 1_000_000,
  testInjected: false,
});
const activeOwnerStaff = (collection: string) => collection === 'staffMembers'
  ? { uid: 'owner-1', role: 'owner', active: true, roleVersion: 1 }
  : null;

describe('privileged authorization integration boundary', () => {
  beforeEach(() => {
    __test.setAuth(undefined);
    __test.setFirestore(undefined);
    __test.captureCommits(undefined);
    __adminTest.setFirestore(undefined);
    __adminTest.captureCommits(undefined);
    __privilegedSessionTest.reset();
  });
  afterEach(() => {
    __test.setAuth(undefined);
    __test.setFirestore(undefined);
    __test.captureCommits(undefined);
    __adminTest.setFirestore(undefined);
    __adminTest.captureCommits(undefined);
    __privilegedSessionTest.reset();
  });

  test('active Owner is authorized by live staff and active Firebase state', async () => {
    setClaimedOwner();
    __adminTest.setFirestore(activeOwnerStaff);
    __privilegedSessionTest.setLookup(async () => ({ disabled: false, validSinceSeconds: 1_000 }));
    const response = await worker.fetch(authorized('/api/admin/session'), env);
    expect(response.status).toBe(200);
    expect((await response.json()).role).toBe('owner');
  });

  const deniedStaffStates: Array<[string, Record<string, unknown> | null]> = [
    ['missing', null],
    ['not explicitly active', { uid: 'owner-1', role: 'owner', roleVersion: 1 }],
    ['suspended', { uid: 'owner-1', role: 'owner', active: true, status: 'suspended', roleVersion: 1 }],
    ['demoted', { uid: 'owner-1', role: 'customer', active: true, roleVersion: 2 }],
  ];
  for (const [label, staff] of deniedStaffStates) {
    test(`claim-only authority cannot bypass ${label} live staff state`, async () => {
      setClaimedOwner();
      __adminTest.setFirestore((collection) => collection === 'staffMembers' ? staff : null);
      __privilegedSessionTest.setLookup(async () => ({ disabled: false, validSinceSeconds: 0 }));
      const response = await worker.fetch(authorized('/api/admin/overview'), env);
      expect(response.status).toBe(403);
      expect((await response.json()).errorCode).toBe('PERMISSION_DENIED');
    });
  }

  test('disabled and revoked sessions are denied before privileged handlers run', async () => {
    setClaimedOwner();
    __adminTest.setFirestore(activeOwnerStaff);
    __privilegedSessionTest.setLookup(async () => ({ disabled: true, validSinceSeconds: 0 }));
    let response = await worker.fetch(authorized('/api/admin/session'), env);
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe('AUTH_SESSION_REVOKED');

    __privilegedSessionTest.reset();
    __privilegedSessionTest.setLookup(async () => ({ disabled: false, validSinceSeconds: 1_001 }));
    response = await worker.fetch(authorized('/api/admin/session'), env);
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe('AUTH_SESSION_REVOKED');
  });

  test('Auth backend failure cannot produce privileged access', async () => {
    setClaimedOwner();
    __adminTest.setFirestore(activeOwnerStaff);
    __privilegedSessionTest.setLookup(async () => { throw new PrivilegedAuthUnavailableError(); });
    const response = await worker.fetch(authorized('/api/admin/session'), env);
    expect(response.status).toBe(503);
    expect((await response.json()).errorCode).toBe('PRIVILEGED_AUTH_UNAVAILABLE');
  });

  test('claim-only bypasses outside /api/admin require the same live staff boundary', async () => {
    setClaimedOwner();
    __test.setFirestore((collection) => collection === 'equipmentRequests' ? {
      pricingModelVersion: 2,
      customerUid: 'customer-1',
      providerUid: 'provider-1',
      status: 'pending',
      rentalMode: 'fixed_days',
      rateUnit: 'daily',
      requestedStartAt: '2026-11-01T00:00:00.000Z',
      requestedEndAt: '2026-11-02T00:00:00.000Z',
      pricingSnapshot: { rateAmountMinor: 10_000 },
    } : null);
    __adminTest.setFirestore(() => null);
    __privilegedSessionTest.setLookup(async () => ({ disabled: false, validSinceSeconds: 0 }));
    let response = await worker.fetch(authorized('/api/requests/request-1/rental-summary'), env);
    expect(response.status).toBe(403);

    __adminTest.setFirestore(activeOwnerStaff);
    response = await worker.fetch(authorized('/api/requests/request-1/rental-summary'), env);
    expect(response.status).toBe(200);
  });

  test('live staff without operations permission cannot use marketplace bypasses', async () => {
    __test.setAuth({
      uid: 'auditor-1', admin: true, role: 'admin', permissionRole: 'auditor',
      emailVerified: true, authTime: 1_000_000, testInjected: false,
    });
    __test.setFirestore((collection) => collection === 'equipmentRequests' ? {
      pricingModelVersion: 2,
      customerUid: 'customer-1',
      providerUid: 'provider-1',
      status: 'pending',
      rentalMode: 'fixed_days',
      rateUnit: 'daily',
      requestedStartAt: '2026-11-01T00:00:00.000Z',
      requestedEndAt: '2026-11-02T00:00:00.000Z',
      pricingSnapshot: { rateAmountMinor: 10_000 },
    } : null);
    __adminTest.setFirestore((collection) => collection === 'staffMembers'
      ? { uid: 'auditor-1', role: 'auditor', active: true, roleVersion: 1 }
      : null);
    __privilegedSessionTest.setLookup(async () => ({ disabled: false, validSinceSeconds: 0 }));
    const response = await worker.fetch(authorized('/api/requests/request-1/rental-summary'), env);
    expect(response.status).toBe(404);
  });

  test('Owner bootstrap remains narrow and cannot bypass an existing canonical Owner', async () => {
    setClaimedOwner();
    __privilegedSessionTest.setLookup(async () => ({ disabled: false, validSinceSeconds: 0 }));
    __adminTest.setFirestore(() => null);
    let response = await worker.fetch(authorized('/api/admin/session'), env);
    expect(response.status).toBe(200);
    expect((await response.json()).bootstrapRequired).toBe(true);

    __adminTest.setFirestore((collection) => collection === 'heavyarConfig' ? { ownerUid: 'canonical-owner' } : null);
    response = await worker.fetch(authorized('/api/admin/session'), env);
    expect(response.status).toBe(403);
  });

  test('privilege-grant acceptance routes reject revoked Firebase sessions', async () => {
    __test.setAuth({ uid: 'invitee-1', admin: false, emailVerified: true, authTime: 1_000_000, testInjected: false });
    __privilegedSessionTest.setLookup(async () => ({ disabled: false, validSinceSeconds: 1_001 }));
    const response = await worker.fetch(authorized('/api/staff/invitations/accept', 'POST', { token: 'fixture-token' }), env);
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe('AUTH_SESSION_REVOKED');
  });

  test('ordinary authenticated customer behavior remains independent of privileged checks', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false, emailVerified: true });
    __test.setFirestore((collection) => collection === 'users' ? { role: 'customer', accountStatus: 'active' }
      : collection === 'equipmentRequests' ? {
        pricingModelVersion: 2,
        customerUid: 'customer-1',
        providerUid: 'provider-1',
        status: 'pending',
        rentalMode: 'fixed_days',
        rateUnit: 'daily',
        requestedStartAt: '2026-11-01T00:00:00.000Z',
        requestedEndAt: '2026-11-02T00:00:00.000Z',
        pricingSnapshot: { rateAmountMinor: 10_000 },
      } : null);
    __privilegedSessionTest.setLookup(async () => { throw new Error('must not be called'); });
    const response = await worker.fetch(authorized('/api/requests/request-1/rental-summary'), env);
    expect(response.status).toBe(200);
  });
});
