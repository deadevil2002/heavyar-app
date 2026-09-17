import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import worker, { __test, type Env } from './index';
import { __adminTest } from './admin';

const env = { CORS_ORIGINS: 'http://localhost' } as Env;
const request = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://worker.test${path}${body === undefined ? '' : ''}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('admin authorization and operational boundary', () => {
  beforeEach(() => {
    __test.setAuth(undefined);
    __test.setFirestore(undefined);
    __test.captureCommits(undefined);
    __adminTest.setFirestore(undefined);
    __adminTest.captureCommits(undefined);
    __adminTest.setIdentity(undefined);
    __adminTest.setQuery(undefined);
  });
  afterEach(() => {
    __test.setAuth(undefined);
    __test.setFirestore(undefined);
    __test.captureCommits(undefined);
    __adminTest.setFirestore(undefined);
    __adminTest.captureCommits(undefined);
    __adminTest.setIdentity(undefined);
    __adminTest.setQuery(undefined);
  });

  test('admin endpoints reject unauthenticated requests', async () => {
    expect((await worker.fetch(request('/api/admin/session'), env)).status).toBe(401);
    expect((await worker.fetch(request('/api/admin/overview'), env)).status).toBe(401);
  });

  test('authenticated normal users cannot access admin endpoints', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    expect((await worker.fetch(request('/api/admin/session', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    expect((await worker.fetch(request('/api/admin/action', {
      action: 'start_manual_review', targetType: 'verificationProfile', targetId: 'customer-1', reason: 'privilege attempt',
    }, { Authorization: 'Bearer test', 'X-Correlation-ID': 'normal-user-manual-review-01' }), env)).status).toBe(403);
  });

  test('trusted admin claim is accepted for session and overview', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'admin' });
    const session = await worker.fetch(request('/api/admin/session', undefined, { Authorization: 'Bearer test' }), env);
    expect(session.status).toBe(200);
    expect((await session.json()).role).toBe('admin');
    const overview = await worker.fetch(request('/api/admin/overview', undefined, { Authorization: 'Bearer test' }), env);
    expect(overview.status).toBe(200);
  });

  test('admin action validation rejects missing reason before any write', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'admin' });
    const response = await worker.fetch(request('/api/admin/action', { action: 'suspend_user', targetType: 'user', targetId: 'customer-1' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(400);
  });

  test('action target aliases are validated and unknown targets are rejected', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'admin' });
    const response = await worker.fetch(request('/api/admin/action', { payload: { action: 'suspend_user', targetType: 'mystery', targetId: 'x', reason: 'review' } }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(400);
    const roleResponse = await worker.fetch(request('/api/admin/roles', { operation: 'grant', targetType: 'user', targetId: 'x', role: 'admin', reason: 'approved' }, { Authorization: 'Bearer test' }), env);
    expect(roleResponse.status).toBe(403);
  });

  test('unsafe search does not silently scan unsupported resources', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'admin' });
    const response = await worker.fetch(new Request('https://worker.test/api/admin/audit?q=secret', { headers: { Authorization: 'Bearer test' } }), env);
    expect(response.status).toBe(400);
  });

  test('Firebase Hosting origins are included in default CORS', async () => {
    const response = await worker.fetch(new Request('https://worker.test/health', { headers: { Origin: 'https://heavyar-app.web.app' } }), { CORS_ORIGINS: '' } as Env);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://heavyar-app.web.app');
  });

  test('cancel rejects paid requests before mutation', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'admin' });
    __adminTest.setFirestore((collection) => collection === 'equipmentRequests' ? { status: 'completed', paymentState: 'paid' } : null);
    const response = await worker.fetch(request('/api/admin/action', { action: 'cancel_request', targetType: 'request', targetId: 'request-1', reason: 'fraud review' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(409);
  });

  test('refund creates an independent reserved document and preserves canonical payment', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'admin' });
    __adminTest.setFirestore((collection) => collection === 'payments' ? { requestId: 'request-1', paymentId: 'payment-1', state: 'paid', amount: 100 } : null);
    const commits: unknown[][] = [];
    __adminTest.captureCommits(commits);
    const response = await worker.fetch(request('/api/admin/action', { action: 'request_refund', targetType: 'payment', targetId: 'payment-1', amount: 25, reason: 'customer approved' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(200);
    const writes = commits[0] as any[];
    expect(writes[0].currentDocument.exists).toBe(false);
    expect(String(writes[0].update.name).includes('/refundReservations/request-1')).toBe(true);
    expect(writes[1].currentDocument.exists).toBe(false);
    expect(String(writes[1].update.name).includes('/refunds/refund%3Arequest-1')).toBe(true);
    expect(writes[1].update.fields.amount.doubleValue).toBe(25);
  });

  test('freeze uses operationsState and does not overwrite canonical request status', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'admin' });
    __adminTest.setFirestore(() => ({ status: 'in_progress' }));
    const commits: unknown[][] = [];
    __adminTest.captureCommits(commits);
    const response = await worker.fetch(request('/api/admin/action', { action: 'freeze_request', targetType: 'request', targetId: 'request-1', reason: 'safety review' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(200);
    const fields = (commits[0][0] as any).update.fields;
    expect(fields.operationsState.stringValue).toBe('frozen');
    expect(fields.status).toBe(undefined);
  });

  test('suspend_listing atomically disables and moderates a listing', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'admin' });
    __adminTest.setFirestore(() => ({ ownerUid: 'provider-1', isActive: true, moderationStatus: 'active' }));
    const commits: unknown[][] = [];
    __adminTest.captureCommits(commits);
    const response = await worker.fetch(request('/api/admin/action', { action: 'suspend_listing', targetType: 'listing', targetId: 'equipment-1', reason: 'policy violation' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(200);
    const fields = (commits[0][0] as any).update.fields;
    expect(fields.isActive.booleanValue).toBe(false);
    expect(fields.moderationStatus.stringValue).toBe('suspended');
  });

  test('role claim failure leaves a durable role-change intent', async () => {
    __test.setAuth({ uid: 'super-1', admin: true, role: 'super_admin' });
    __adminTest.setIdentity(async () => { throw new Error('Identity service unavailable'); });
    const commits: unknown[][] = [];
    __adminTest.captureCommits(commits);
    const response = await worker.fetch(request('/api/admin/roles', { uid: 'target-1', role: 'admin', operation: 'grant', reason: 'approved by governance' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(500);
    expect(commits.length > 0).toBe(true);
    expect(String((commits[0][0] as any).update.name).includes('role-intent')).toBe(true);
    expect((commits[0][0] as any).update.fields.action.stringValue).toBe('role_change_intent');
  });

  test('manual review validates transitions, emits a unique verification event, and cannot forge official identity', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'admin' });
    __adminTest.setFirestore((collection) => collection === 'verificationProfiles' ? {
      uid: 'provider-1', identity: { status: 'unverified', provider: 'unconfigured' },
      manualReview: { status: 'unverified' }, overallTrust: { status: 'unverified' },
    } : null);
    const commits: unknown[][] = [];
    __adminTest.captureCommits(commits);
    const started = await worker.fetch(request('/api/admin/action', {
      action: 'start_manual_review', targetType: 'verificationProfile', targetId: 'provider-1', reason: 'document review',
    }, { Authorization: 'Bearer test', 'X-Correlation-ID': 'manual-review-correlation-01' }), env);
    expect(started.status).toBe(200);
    const writes = commits[0] as any[];
    expect(writes[0].update.fields.manualReview.mapValue.fields.status.stringValue).toBe('manual_review');
    expect(String(writes[1].update.name).includes('manual_review_started')).toBe(true);
    const forged = await worker.fetch(request('/api/admin/action', {
      action: 'set_provider_component', targetType: 'verificationProfile', targetId: 'provider-1', component: 'individualIdentity', status: 'verified', reason: 'not provider proof',
    }, { Authorization: 'Bearer test', 'X-Correlation-ID': 'manual-review-correlation-02' }), env);
    expect(forged.status).toBe(400);
    __adminTest.setFirestore((collection) => collection === 'verificationProfiles' ? {
      manualReview: { status: 'verified' }, identity: { status: 'unverified' },
    } : null);
    const invalid = await worker.fetch(request('/api/admin/action', {
      action: 'complete_manual_review', targetType: 'verificationProfile', targetId: 'provider-1', reason: 'no active review',
    }, { Authorization: 'Bearer test', 'X-Correlation-ID': 'manual-review-correlation-03' }), env);
    expect(invalid.status).toBe(409);
  });

  test('legacy verification cases cannot be approved by an administrator', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'admin' });
    __adminTest.setFirestore((collection) => collection === 'verificationCases' ? { status: 'pending' } : null);
    const response = await worker.fetch(request('/api/admin/action', {
      action: 'update_verification', targetType: 'verificationCase', targetId: 'case-1',
      status: 'approved', reason: 'manual assertion is not provider evidence',
    }, { Authorization: 'Bearer test', 'X-Correlation-ID': 'legacy-case-denial-0001' }), env);
    expect(response.status).toBe(400);
  });

  test('retention cleanup is super-admin-only, bounded, and uses guarded deletes', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'admin' });
    expect((await worker.fetch(request('/api/admin/verification-cleanup', { limit: 1 }, { Authorization: 'Bearer test', 'X-Correlation-ID': 'retention-cleanup-id-01' }), env)).status).toBe(403);
    __test.setAuth({ uid: 'super-1', admin: true, role: 'super_admin' });
    __adminTest.setQuery(() => [
      { name: 'projects/test/databases/(default)/documents/verificationAttempts/old-1', updateTime: 'old-version', data: { expiresAt: '2000-01-01T00:00:00.000Z' } },
      { name: 'projects/test/databases/(default)/documents/verificationAttempts/old-2', updateTime: 'old-version-2', data: { expiresAt: '2000-01-02T00:00:00.000Z' } },
    ]);
    const commits: unknown[][] = [];
    __adminTest.captureCommits(commits);
    const response = await worker.fetch(request('/api/admin/verification-cleanup', { limit: 1 }, { Authorization: 'Bearer test', 'X-Correlation-ID': 'retention-cleanup-id-02' }), env);
    expect(response.status).toBe(200);
    const writes = commits[0] as any[];
    expect(writes.length).toBe(2);
    expect(writes[0].currentDocument.updateTime).toBe('old-version');
    expect((await response.json() as any).deletedAttempts).toBe(1);
  });

  test('provider component updates preserve independent states but cannot manufacture verified external results', async () => {
    __test.setAuth({ uid: 'super-1', admin: true, role: 'super_admin' });
    __adminTest.setFirestore((collection) => collection === 'verificationProfiles' ? {
      providerVerification: {
        status: 'unverified', requiredComponents: ['individualIdentity', 'commercialRegistration'],
        components: { individualIdentity: 'verified', businessLegalEntity: 'unverified', commercialRegistration: 'unverified', ownershipAuthorization: 'unverified', payoutBank: 'unverified' },
      },
    } : null);
    const commits: unknown[][] = [];
    __adminTest.captureCommits(commits);
    const response = await worker.fetch(request('/api/admin/action', {
      action: 'set_provider_component', targetType: 'verificationProfile', targetId: 'provider-1',
      component: 'commercialRegistration', status: 'manual_review', reason: 'registry review required',
    }, { Authorization: 'Bearer test', 'X-Correlation-ID': 'provider-component-update-01' }), env);
    expect(response.status).toBe(200);
    const providerVerification = (commits[0][0] as any).update.fields.providerVerification.mapValue.fields;
    expect(providerVerification.status.stringValue).toBe('manual_review');
    expect(providerVerification.components.mapValue.fields.businessLegalEntity.stringValue).toBe('unverified');
    const forged = await worker.fetch(request('/api/admin/action', {
      action: 'set_provider_component', targetType: 'verificationProfile', targetId: 'provider-1',
      component: 'commercialRegistration', status: 'verified', reason: 'untrusted external assertion',
    }, { Authorization: 'Bearer test', 'X-Correlation-ID': 'provider-component-update-02' }), env);
    expect(forged.status).toBe(400);
  });

  test('verification policy updates are super-admin-only and never mutate immutable payment records', async () => {
    __test.setAuth({ uid: 'super-1', admin: true, role: 'super_admin' });
    __adminTest.setFirestore((collection, id) => collection === 'verificationPolicies' && id === 'default' ? { version: 4 } : null);
    const commits: unknown[][] = [];
    __adminTest.captureCommits(commits);
    const response = await worker.fetch(request('/api/admin/action', {
      action: 'update_verification_policy', targetType: 'verificationPolicy', targetId: 'default', reason: 'approved policy update',
      policy: { enabled: true, requireCustomerIdentityVerification: false, verificationRequiredAboveAmountSAR: null, verificationRequiredForHighRiskEquipment: true, verificationRequiredForSpecificRequestTypes: ['regulated_equipment'] },
    }, { Authorization: 'Bearer test', 'X-Correlation-ID': 'verification-policy-update-01' }), env);
    expect(response.status).toBe(200);
    expect((commits[0][0] as any).update.fields.version.integerValue).toBe('5');
    expect(JSON.stringify(commits).includes('paymentQuotes')).toBe(false);
    expect(JSON.stringify(commits).includes('payments/')).toBe(false);
  });

  test('suspended accounts cannot start requests', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'users' ? { suspensionStatus: 'temporarily_suspended' } : {
      customerUid: 'customer-1', providerUid: 'provider-1', status: 'accepted',
    });
    const response = await worker.fetch(request('/api/start-request', { requestId: 'request-1' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(403);
  });
});