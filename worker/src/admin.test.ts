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
  });
  afterEach(() => {
    __test.setAuth(undefined);
    __test.setFirestore(undefined);
    __test.captureCommits(undefined);
    __adminTest.setFirestore(undefined);
    __adminTest.captureCommits(undefined);
    __adminTest.setIdentity(undefined);
  });

  test('admin endpoints reject unauthenticated requests', async () => {
    expect((await worker.fetch(request('/api/admin/session'), env)).status).toBe(401);
    expect((await worker.fetch(request('/api/admin/overview'), env)).status).toBe(401);
  });

  test('authenticated normal users cannot access admin endpoints', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    expect((await worker.fetch(request('/api/admin/session', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
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

  test('suspended accounts cannot start requests', async () => {
    __test.setAuth({ uid: 'customer-1', admin: false });
    __test.setFirestore((collection) => collection === 'users' ? { suspensionStatus: 'temporarily_suspended' } : {
      customerUid: 'customer-1', providerUid: 'provider-1', status: 'accepted',
    });
    const response = await worker.fetch(request('/api/start-request', { requestId: 'request-1' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(403);
  });
});