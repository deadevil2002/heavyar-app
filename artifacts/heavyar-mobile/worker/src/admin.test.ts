import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import worker, { __test, type Env } from './index';
import { __adminTest, handleAdmin, handleAdminDocument, AdminDocumentUnavailableError } from './admin';
import { claimSyncWrite, processStaffClaimSync } from './admin';

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
    __adminTest.setVerifiedEmail(undefined);
    __adminTest.setQuery(undefined);
  });
  afterEach(() => {
    __test.setAuth(undefined);
    __test.setFirestore(undefined);
    __test.captureCommits(undefined);
    __adminTest.setFirestore(undefined);
    __adminTest.captureCommits(undefined);
    __adminTest.setIdentity(undefined);
    __adminTest.setVerifiedEmail(undefined);
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
    __test.setAuth({ uid: 'finance-1', admin: true, role: 'admin', permissionRole: 'finance' });
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

  test('generic users and role endpoints cannot grant staff authority', async () => {
    __test.setAuth({ uid: 'super-1', admin: true, role: 'super_admin' });
    const commits: unknown[][] = [];
    __adminTest.captureCommits(commits);
    const response = await worker.fetch(request('/api/admin/roles', { uid: 'target-1', role: 'admin', operation: 'grant', reason: 'approved by governance' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(403);
    const actionResponse = await worker.fetch(request('/api/admin/action', { action: 'grant_role', targetType: 'user', targetId: 'target-1', role: 'admin', reason: 'bypass invitation' }, { Authorization: 'Bearer test' }), env);
    expect(actionResponse.status).toBe(403);
    expect(commits.length).toBe(0);
  });

  test('staff invitation acceptance requires the verified matching identity and is atomic', async () => {
    const token = 'staff-invitation-accept-token';
    const hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    __test.setAuth({ uid: 'existing-customer', admin: false, email: 'existing@example.test' });
    __adminTest.setVerifiedEmail(async () => 'existing@example.test');
    __adminTest.setFirestore((collection, id) => collection === 'staffInvitations' && id === `invite:${hash}` ? {
      email: 'existing@example.test', role: 'payouts', status: 'pending', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } : null);
    const commits: unknown[][] = []; __adminTest.captureCommits(commits);
    const response = await worker.fetch(request('/api/admin/staff/invitations/accept', { token }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(200);
    const writes = commits[0] as any[];
    expect(writes.some(write => String(write.update?.name).includes('/staffMembers/existing-customer'))).toBe(true);
    expect(writes.some(write => String(write.update?.name).includes('/staffClaimSync/'))).toBe(true);
    expect(writes.some(write => write.update?.fields?.status?.stringValue === 'accepted')).toBe(true);
  });

  test('expired or mismatched staff invitation cannot grant an existing user privileges', async () => {
    __test.setAuth({ uid: 'existing-customer', admin: false, email: 'existing@example.test' });
    __adminTest.setVerifiedEmail(async () => 'other@example.test');
    __adminTest.setFirestore(() => null);
    const response = await worker.fetch(request('/api/admin/staff/invitations/accept', { token: 'expired-token' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(403);
  });

  test('revoked and unverified staff invitations are rejected without authority writes', async () => {
    const token = 'revoked-invitation-token';
    const hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    __test.setAuth({ uid: 'customer-1', admin: false, email: 'customer@example.test' });
    __adminTest.setFirestore((collection, id) => collection === 'staffInvitations' && id === `invite:${hash}` ? {
      email: 'customer@example.test', role: 'support', status: 'revoked', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } : null);
    __adminTest.setVerifiedEmail(async () => 'customer@example.test');
    const writes: unknown[][] = []; __adminTest.captureCommits(writes);
    expect((await worker.fetch(request('/api/admin/staff/invitations/accept', { token }, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    __adminTest.setFirestore((collection, id) => collection === 'staffInvitations' && id === `invite:${hash}` ? {
      email: 'customer@example.test', role: 'support', status: 'pending', expiresAt: new Date(Date.now() - 1).toISOString(),
    } : null);
    expect((await worker.fetch(request('/api/admin/staff/invitations/accept', { token }, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    __adminTest.setFirestore((collection, id) => collection === 'staffInvitations' && id === `invite:${hash}` ? {
      email: 'customer@example.test', role: 'support', status: 'pending', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    } : null);
    __adminTest.setVerifiedEmail(async () => null);
    expect((await worker.fetch(request('/api/admin/staff/invitations/accept', { token }, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    expect(writes.length).toBe(0);
  });

  test('least-privilege reads keep finance, staff, and identity data from marketing and auditors', async () => {
    __test.setAuth({ uid: 'marketing-1', admin: true, role: 'admin', permissionRole: 'marketing' });
    expect((await worker.fetch(request('/api/admin/payments', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    expect((await worker.fetch(request('/api/admin/identity-integrations', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    expect((await worker.fetch(request('/api/admin/staff', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    __test.setAuth({ uid: 'auditor-1', admin: true, role: 'admin', permissionRole: 'auditor' });
    const overview = await worker.fetch(request('/api/admin/overview', undefined, { Authorization: 'Bearer test' }), env);
    expect(overview.status).toBe(200);
    expect('payments' in (await overview.json() as any).metrics).toBe(false);
    expect((await worker.fetch(request('/api/admin/notification-retry', { limit: 1 }, { Authorization: 'Bearer test' }), env)).status).toBe(403);
  });

  test('role-scoped reads allow only each operational surface and details keep the same gate', async () => {
    __adminTest.setQuery(() => []);
    __adminTest.setFirestore((collection) => collection === 'users' ? { displayName: 'Safe User' } : null);
    __test.setAuth({ uid: 'ops-1', admin: true, role: 'admin', permissionRole: 'operations' });
    expect((await worker.fetch(request('/api/admin/drivers', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(200);
    expect((await worker.fetch(request('/api/admin/payments', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    __test.setAuth({ uid: 'support-1', admin: true, role: 'admin', permissionRole: 'support' });
    expect((await worker.fetch(request('/api/admin/notification-health', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(200);
    expect((await worker.fetch(request('/api/admin/detail/payments/payment-1', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    __test.setAuth({ uid: 'verify-1', admin: true, role: 'admin', permissionRole: 'verification' });
    expect((await worker.fetch(request('/api/admin/identity-integrations', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(200);
    __test.setAuth({ uid: 'auditor-1', admin: true, role: 'admin', permissionRole: 'auditor' });
    expect((await worker.fetch(request('/api/admin/detail/users/user-1', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(200);
    expect((await worker.fetch(request('/api/admin/detail/staffMembers/staff-1', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    __test.setAuth({ uid: 'marketing-1', admin: true, role: 'admin', permissionRole: 'marketing' });
    expect((await worker.fetch(request('/api/admin/campaigns', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(200);
    expect((await worker.fetch(request('/api/admin/overview', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
  });

  test('payouts cannot read generic finance documents and moderators can act only on listings', async () => {
    __adminTest.setFirestore((collection) => collection === 'payments' ? { amount: 10, state: 'paid' }
      : collection === 'equipment' ? { moderationStatus: 'pending_review', visibility: 'visible' } : null);
    __test.setAuth({ uid: 'payouts-1', admin: true, role: 'admin', permissionRole: 'payouts' });
    expect((await worker.fetch(request('/api/admin/detail/payments/payment-1', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    expect((await worker.fetch(request('/api/admin/detail/equipment/equipment-1', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
    __test.setAuth({ uid: 'moderator-1', admin: true, role: 'admin', permissionRole: 'moderator' });
    const writes: unknown[][] = []; __adminTest.captureCommits(writes);
    const moderated = await worker.fetch(request('/api/admin/action', { action: 'approve_listing', targetType: 'equipment', targetId: 'equipment-1', reason: 'policy review complete' }, { Authorization: 'Bearer test' }), env);
    expect(moderated.status).toBe(200);
    expect((writes[0][0] as any).update.fields.moderationStatus.stringValue).toBe('approved');
    expect((await worker.fetch(request('/api/admin/detail/payments/payment-1', undefined, { Authorization: 'Bearer test' }), env)).status).toBe(403);
  });

  test('explicit listing approval normalizes only missing visibility and never reopens hidden or archived listings', async () => {
    let visibility: string | undefined;
    __test.setAuth({ uid: 'moderator-1', admin: true, role: 'admin', permissionRole: 'moderator' });
    __adminTest.setFirestore((collection) => collection === 'equipment' ? { moderationStatus: 'pending_review', visibility } : null);
    const commits: unknown[][] = []; __adminTest.captureCommits(commits);
    const approve = async () => worker.fetch(request('/api/admin/action', {
      action: 'approve_listing', targetType: 'equipment', targetId: 'legacy-listing', reason: 'moderation approved',
    }, { Authorization: 'Bearer test' }), env);
    expect((await approve()).status).toBe(200);
    expect((commits[0][0] as any).update.fields.visibility.stringValue).toBe('visible');
    expect((commits[0][0] as any).update.fields.isActive.booleanValue).toBe(true);
    visibility = 'hidden';
    expect((await approve()).status).toBe(200);
    expect((commits[1][0] as any).update.fields.visibility.stringValue).toBe('hidden');
    expect((commits[1][0] as any).update.fields.isActive.booleanValue).toBe(false);
    visibility = 'archived';
    expect((await approve()).status).toBe(200);
    expect((commits[2][0] as any).update.fields.visibility.stringValue).toBe('archived');
    expect((commits[2][0] as any).update.fields.isActive.booleanValue).toBe(false);
  });

  test('ownership initiation stays pending and never changes the canonical owner before acceptance', async () => {
    __test.setAuth({ uid: 'owner-1', admin: true, role: 'super_admin', permissionRole: 'owner', email: 'owner@example.test', authTime: Date.now() });
    __adminTest.setFirestore((collection, id) => collection === 'heavyarConfig' && id === 'owner' ? { ownerUid: 'owner-1', version: 1 } : null);
    const commits: unknown[][] = []; __adminTest.captureCommits(commits);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/admin/ownership', { email: 'next-owner@example.test', reason: 'governance succession' }, { Authorization: 'Bearer test' }), { ...env, RESEND_API_KEY: 'test-only' });
      expect(response.status).toBe(200);
      const writes = JSON.stringify(commits[0]);
      expect(writes.includes('ownershipTransfers/pending')).toBe(true);
      expect(writes.includes('staffMembers/')).toBe(false);
      expect(writes.includes('heavyarConfig/owner')).toBe(false);
    } finally { globalThis.fetch = originalFetch; }
  });

  test('authority invitation email uses the fixed UI acceptance link and fails explicitly without Resend', async () => {
    __test.setAuth({ uid: 'super-1', admin: true, role: 'super_admin', permissionRole: 'super_admin' });
    __adminTest.captureCommits([]);
    expect((await worker.fetch(request('/api/admin/staff/invitations', { email: 'new.staff@example.test', role: 'support' }, { Authorization: 'Bearer test' }), env)).status).toBe(503);
    let emailPayload: any;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      emailPayload = JSON.parse(String(init?.body || '{}'));
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    try {
      const response = await worker.fetch(request('/api/admin/staff/invitations', { email: 'new.staff@example.test', role: 'support' }, { Authorization: 'Bearer test' }), { ...env, RESEND_API_KEY: 'test-only' });
      expect(response.status).toBe(200);
      expect(emailPayload.html.includes('https://heavyar-app.web.app/accept-invite?type=staff&token=')).toBe(true);
      expect(emailPayload.html.includes('worker.test')).toBe(false);
      expect(emailPayload.html.includes('email-verified account')).toBe(true);
    } finally { globalThis.fetch = originalFetch; }
  });

  test('only current owner with fresh reauthentication can initiate ownership transfer', async () => {
    __test.setAuth({ uid: 'admin-1', admin: true, role: 'super_admin', permissionRole: 'owner', email: 'owner@example.test', authTime: Date.now() - 6 * 60_000 });
    __adminTest.setFirestore((collection, id) => collection === 'heavyarConfig' && id === 'owner' ? { ownerUid: 'owner-1' } : null);
    const writes: unknown[][] = []; __adminTest.captureCommits(writes);
    const stale = await worker.fetch(request('/api/admin/ownership', { email: 'next@example.test', reason: 'succession' }, { Authorization: 'Bearer test' }), env);
    expect(stale.status).toBe(403);
    __test.setAuth({ uid: 'owner-1', admin: true, role: 'super_admin', permissionRole: 'owner', email: 'owner@example.test', authTime: Date.now() - 6 * 60_000 });
    const old = await worker.fetch(request('/api/admin/ownership', { email: 'next@example.test', reason: 'succession' }, { Authorization: 'Bearer test' }), env);
    expect(old.status).toBe(409);
    expect(writes.length).toBe(0);
  });

  test('ownership acceptance detects a canonical-owner race before any switch', async () => {
    const token = 'ownership-accept-token';
    const tokenHash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    __test.setAuth({ uid: 'recipient-1', admin: false, email: 'recipient@example.test' });
    __adminTest.setVerifiedEmail(async () => 'recipient@example.test');
    __adminTest.setFirestore((collection, id) => {
      if (collection === 'ownershipTransfers' && id === 'pending') return { tokenHash, targetEmail: 'recipient@example.test', currentOwnerUid: 'old-owner', status: 'pending', expiresAt: new Date(Date.now() + 60_000).toISOString() };
      if (collection === 'heavyarConfig' && id === 'owner') return { ownerUid: 'newer-owner', version: 2 };
      return null;
    });
    const writes: unknown[][] = []; __adminTest.captureCommits(writes);
    expect((await worker.fetch(request('/api/admin/ownership/accept', { token }, { Authorization: 'Bearer test' }), env)).status).toBe(409);
    expect(writes.length).toBe(0);
  });

  test('document exports enforce trusted role scope and use filtered server pages', async () => {
    __test.setAuth({ uid: 'marketing-1', admin: true, role: 'admin', permissionRole: 'marketing' });
    let denied = false;
    try {
      await handleAdminDocument(new Request('https://worker.test/api/admin/exports/payments.xlsx?scope=all_filtered'), env, {
        uid: 'marketing-1', admin: true, role: 'admin', permissionRole: 'marketing', testInjected: true,
      });
    } catch (error) { denied = error instanceof Error && error.message === 'ADMIN_REQUIRED'; }
    expect(denied).toBe(true);

    __adminTest.setQuery((collection) => collection === 'payments' ? [{
      name: 'projects/p/databases/(default)/documents/payments/payment-1', data: {
        paymentId: 'payment-1', requestId: 'HV-REQ-01', amount: 100, state: 'paid', provider: 'tap', privateToken: 'never-export',
      },
    }] : []);
    __adminTest.captureCommits([]);
    __test.setAuth({ uid: 'finance-1', admin: true, role: 'admin', permissionRole: 'finance' });
    const document = await handleAdminDocument(new Request('https://worker.test/api/admin/exports/payments.xlsx?scope=all_filtered&state=paid'), env, {
      uid: 'finance-1', admin: true, role: 'admin', permissionRole: 'finance', testInjected: true,
    });
    expect(Boolean(document?.contentType.includes('spreadsheetml'))).toBe(true);
    expect(new TextDecoder().decode(document?.body.slice(0, 2))).toBe('PK');
    expect(JSON.stringify(document?.body).includes('never-export')).toBe(false);
  });

  test('missing editable configuration returns safe unsaved defaults without writes', async () => {
    __adminTest.setFirestore(() => null);
    const commits: unknown[][] = []; __adminTest.captureCommits(commits);
    const actor = { uid: 'owner-1', admin: true, permissionRole: 'owner', testInjected: true as const };
    const business: any = await handleAdmin(new Request('https://worker.test/api/admin/detail/heavyarConfig/business'), env, actor);
    expect(business.success).toBe(true);
    expect(business.item.missing).toBe(true);
    expect(business.item.legalBusinessNameEn).toBe('');
    const policy: any = await handleAdmin(new Request('https://worker.test/api/admin/detail/verificationPolicies/default'), env, actor);
    expect(policy.item.enabled).toBe(false);
    expect(policy.item.requireCustomerIdentityVerification).toBe(false);
    expect(commits.length).toBe(0);
    const denied: any = await handleAdmin(new Request('https://worker.test/api/admin/detail/heavyarConfig/business'), env, { ...actor, permissionRole: 'support' });
    expect(denied.status).toBe(403);
  });

  test('ownership read resolves only safe owner presentation fields', async () => {
    __adminTest.setFirestore((collection) => collection === 'heavyarConfig' ? { ownerUid: 'owner-1', version: 1 }
      : collection === 'users' ? { displayName: 'Current Owner', email: 'owner@example.test', privateToken: 'must-not-return' } : null);
    const result: any = await handleAdmin(new Request('https://worker.test/api/admin/ownership'), env, {
      uid: 'owner-1', admin: true, permissionRole: 'owner', testInjected: true,
    });
    expect(result.owner.name).toBe('Current Owner');
    expect(result.owner.email).toBe('owner@example.test');
    expect(JSON.stringify(result).includes('must-not-return')).toBe(false);
  });

  test('refund filters accept empty UI controls and preserve search/filter intersection', async () => {
    __adminTest.setQuery(() => [
      { name: 'projects/undefined/databases/(default)/documents/refunds/refund-1', data: { requestId: 'request-1', state: 'pending', amount: 10 } },
      { name: 'projects/undefined/databases/(default)/documents/refunds/refund-2', data: { requestId: 'request-1', state: 'completed', amount: 20 } },
    ]);
    __adminTest.setFirestore(() => null);
    const actor = { uid: 'finance-1', admin: true, permissionRole: 'finance', testInjected: true as const };
    const blank: any = await handleAdmin(new Request('https://worker.test/api/admin/refunds?q=&state=pending&sort=&direction='), env, actor);
    expect(blank.items.length).toBe(1);
    const searched: any = await handleAdmin(new Request('https://worker.test/api/admin/refunds?q=request-1&state=pending&sort=amount&direction=desc'), env, actor);
    expect(searched.items.length).toBe(1);
    expect(searched.items[0].id).toBe('refund-1');
    const malformed: any = await handleAdmin(new Request('https://worker.test/api/admin/refunds?cursor=invalid'), env, actor);
    expect(malformed.status).toBe(400);
  });

  test('current-page user export fails explicitly if real audit storage denies the write', async () => {
    __adminTest.setQuery(() => [{ name: 'projects/undefined/databases/(default)/documents/users/u1', data: { displayName: 'User', email: 'user@example.test' } }]);
    __adminTest.setFirestore(() => null);
    // Real commit path, deliberately no credentials: document production must
    // not be reported as successful when its mandatory audit cannot persist.
    let failure: unknown;
    try {
      await handleAdminDocument(new Request('https://worker.test/api/admin/exports/users.xlsx?scope=current_page&q='), env, {
        uid: 'owner-1', admin: true, permissionRole: 'owner', testInjected: true,
      });
    } catch (error) { failure = error; }
    expect(failure instanceof AdminDocumentUnavailableError).toBe(true);
    expect((failure as AdminDocumentUnavailableError).status).toBe(503);
    __test.setAuth({ uid: 'owner-1', admin: true, permissionRole: 'owner' });
    const response = await worker.fetch(request('/api/admin/exports/users.xlsx?scope=current_page&q=', undefined, {
      Authorization: 'Bearer test',
    }), env);
    expect(response.status).toBe(503);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Content-Disposition')).toBe(null);
    expect(JSON.stringify(await response.json())).toBe(JSON.stringify({
      success: false,
      error: 'Document download unavailable: audit recording failed. Contact the administrator.',
      code: 'ADMIN_DOCUMENT_AUDIT_UNAVAILABLE',
    }));
  });

  test('admin invoice PDFs reject absent payments and any invoice/payment/request linkage mismatch', async () => {
    const invoice = {
      requestId: 'request-1', customerId: 'customer-1', providerId: 'provider-1', equipmentId: 'equipment-1',
      invoiceNumber: 'INV-request-1-charge-1', buyerName: 'Customer', sellerName: 'Provider',
      subtotal: 90, totalAmount: 100, currency: 'SAR', status: 'paid', paymentReference: 'charge-1', createdAt: new Date().toISOString(),
    };
    const rental = {
      customerUid: 'customer-1', providerUid: 'provider-1', equipmentId: 'equipment-1', paymentStatus: 'paid',
      paymentState: 'paid', invoiceId: 'invoice-1', publicRequestNumber: 'HV-REQ-000001',
    };
    const actor = { uid: 'finance-1', admin: true, role: 'admin' as const, permissionRole: 'finance', testInjected: true as const };
    const rejected = async () => {
      let denied = false;
      try { await handleAdminDocument(new Request('https://worker.test/api/admin/invoices/invoice-1.pdf'), env, actor); }
      catch (error) { denied = error instanceof Error && error.message === 'Invoice not found'; }
      return denied;
    };
    __adminTest.setFirestore((collection, id) => collection === 'invoices' && id === 'invoice-1' ? invoice
      : collection === 'equipmentRequests' && id === 'request-1' ? rental
      : collection === 'equipment' && id === 'equipment-1' ? { title: 'Crane' } : null);
    expect(await rejected()).toBe(true);
    __adminTest.setFirestore((collection, id) => collection === 'invoices' && id === 'invoice-1' ? invoice
      : collection === 'equipmentRequests' && id === 'request-1' ? rental
      : collection === 'payments' && id === 'request-1' ? { requestId: 'different-request', invoiceId: 'invoice-1', state: 'paid', currency: 'SAR', amount: 100, providerReference: 'charge-1' }
      : collection === 'equipment' && id === 'equipment-1' ? { title: 'Crane' } : null);
    expect(await rejected()).toBe(true);
  });

  test('admin invoice PDFs preserve historical refunds but reject inconsistent settled totals', async () => {
    const invoiceId = 'INV-request-1-charge-1';
    const invoice: any = {
      requestId: 'request-1', customerId: 'customer-1', providerId: 'provider-1', equipmentId: 'equipment-1',
      invoiceNumber: invoiceId, buyerName: 'Customer', sellerName: 'Provider', subtotal: 90, vatAmount: 10,
      platformFee: 9, totalAmount: 100, currency: 'SAR', status: 'refunded', paymentReference: 'charge-1', createdAt: new Date().toISOString(),
    };
    const rental = {
      customerUid: 'customer-1', providerUid: 'provider-1', equipmentId: 'equipment-1', paymentStatus: 'paid', paymentState: 'paid',
      invoiceId, paymentId: 'charge-1', publicRequestNumber: 'HV-REQ-000001', finalAmount: 90, currency: 'SAR',
    };
    const payment: any = {
      requestId: 'request-1', invoiceId, state: 'partially_refunded', currency: 'SAR', customerUid: 'customer-1',
      amount: 100, providerReference: 'charge-1', provider: 'tap',
    };
    __adminTest.setFirestore((collection, id) => collection === 'invoices' && id === invoiceId ? invoice
      : collection === 'equipmentRequests' && id === 'request-1' ? rental
      : collection === 'payments' && id === 'request-1' ? payment
      : collection === 'equipment' && id === 'equipment-1' ? { title: 'Crane' } : null);
    __adminTest.captureCommits([]);
    const actor = { uid: 'finance-1', admin: true, role: 'admin' as const, permissionRole: 'finance', testInjected: true as const };
    const printable = await handleAdminDocument(new Request(`https://worker.test/api/admin/invoices/${invoiceId}.pdf`), env, actor);
    expect(new TextDecoder().decode(printable?.body.slice(0, 4))).toBe('%PDF');
    invoice.totalAmount = 101; payment.amount = 101;
    let denied = false;
    try { await handleAdminDocument(new Request(`https://worker.test/api/admin/invoices/${invoiceId}.pdf`), env, actor); }
    catch (error) { denied = error instanceof Error && error.message === 'Invoice not found'; }
    expect(denied).toBe(true);
  });

  test('multi-filter sparse pages use the last delivered cursor so matching drivers are not skipped', async () => {
    __test.setAuth({ uid: 'ops-1', admin: true, role: 'admin', permissionRole: 'operations' });
    __adminTest.setQuery((_collection, before) => before
      ? [{ name: 'projects/undefined/databases/(default)/documents/driverProfiles/d3', data: { city: 'Riyadh', region: 'Central', active: true } }]
      : [
        { name: 'projects/undefined/databases/(default)/documents/driverProfiles/d1', data: { city: 'Riyadh', region: 'Central', active: true } },
        { name: 'projects/undefined/databases/(default)/documents/driverProfiles/d2', data: { city: 'Jeddah', region: 'Western', active: true } },
        { name: 'projects/undefined/databases/(default)/documents/driverProfiles/d3', data: { city: 'Riyadh', region: 'Central', active: true } },
      ]);
    __adminTest.setFirestore(() => null);
    const first = await worker.fetch(new Request('https://worker.test/api/admin/drivers?city=Riyadh&region=Central&limit=1', { headers: { Authorization: 'Bearer test' } }), env);
    const firstBody: any = await first.json();
    expect(first.status).toBe(200);
    expect(firstBody.items[0].id).toBe('d1');
    const second = await worker.fetch(new Request(`https://worker.test/api/admin/drivers?city=Riyadh&region=Central&limit=1&cursor=${encodeURIComponent(firstBody.nextCursor)}`, { headers: { Authorization: 'Bearer test' } }), env);
    expect((await second.json() as any).items[0].id).toBe('d3');
    expect((await worker.fetch(new Request('https://worker.test/api/admin/drivers?sort=ownerUid', { headers: { Authorization: 'Bearer test' } }), env)).status).toBe(400);
  });

  test('public-number backfill is explicit, idempotent by field, and list GET performs no migration write', async () => {
    __test.setAuth({ uid: 'super-1', admin: true, role: 'super_admin' });
    __adminTest.setQuery((collection) => collection === 'equipment' ? [{
      name: 'projects/p/databases/(default)/documents/equipment/equipment-1', data: { title: 'Crane' },
    }] : []);
    __adminTest.setFirestore((collection) => collection === 'equipment' ? { title: 'Crane' }
      : collection === 'publicIdentifierCounters' ? { nextSequence: 7 } : null);
    const commits: unknown[][] = []; __adminTest.captureCommits(commits);
    const list = await worker.fetch(new Request('https://worker.test/api/admin/equipment', { headers: { Authorization: 'Bearer test' } }), env);
    expect(list.status).toBe(200);
    expect(commits.length).toBe(0);
    const response = await worker.fetch(request('/api/admin/public-identifiers/backfill', { entity: 'equipment', limit: 1, reason: 'legacy identifier migration' }, { Authorization: 'Bearer test' }), env);
    expect(response.status).toBe(200);
    expect((await response.json() as any).identifiers[0]).toBe('HV-EQP-000007');
    expect(JSON.stringify(commits[0]).includes('publicEquipmentNumber')).toBe(true);
    expect(JSON.stringify(commits[0]).includes('moderationStatus')).toBe(false);
  });

  test('admin equipment aliases prefer canonical public numbers after backfill', async () => {
    __test.setAuth({ uid: 'ops-1', admin: true, role: 'admin', permissionRole: 'operations' });
    const listing = {
      title: 'Crane',
      publicEquipmentNumber: 'HV-EQP-000042',
      equipmentNumber: 'legacy-equipment-document-id',
    };
    __adminTest.setQuery((collection) => collection === 'equipment' ? [{
      name: 'projects/p/databases/(default)/documents/equipment/equipment-1', data: listing,
    }] : collection === 'equipmentRequests' ? [{
      name: 'projects/p/databases/(default)/documents/equipmentRequests/request-1',
      data: { equipmentId: 'equipment-1', publicRequestNumber: 'HV-REQ-000009' },
    }] : []);
    __adminTest.setFirestore((collection, id) =>
      collection === 'equipment' && id === 'equipment-1' ? listing : null);

    const equipmentResponse = await worker.fetch(new Request('https://worker.test/api/admin/equipment', {
      headers: { Authorization: 'Bearer test' },
    }), env);
    expect(equipmentResponse.status).toBe(200);
    expect((await equipmentResponse.json() as any).items[0].equipmentNumber).toBe('HV-EQP-000042');

    const requestResponse = await worker.fetch(new Request('https://worker.test/api/admin/requests', {
      headers: { Authorization: 'Bearer test' },
    }), env);
    expect(requestResponse.status).toBe(200);
    expect((await requestResponse.json() as any).items[0].equipment.number).toBe('HV-EQP-000042');
  });

  test('staff claim sync jobs have durable bounded retry schema and complete idempotently', async () => {
    const job: any = claimSyncWrite(env, 'staff-1', 'marketing', true, 3);
    expect(String(job.update.name).includes('staffClaimSync')).toBe(true);
    expect(job.update.fields.uid.stringValue).toBe('staff-1');
    expect(job.update.fields.desiredRole.stringValue).toBe('marketing');
    expect(job.update.fields.desiredActive.booleanValue).toBe(true);
    expect(job.update.fields.desiredVersion.integerValue).toBe('3');
    expect(job.update.fields.status.stringValue).toBe('pending');
    expect(job.update.fields.attempts.integerValue).toBe('0');
    expect(Boolean(job.update.fields.nextAttemptAt.timestampValue)).toBe(true);
  });

  test('scheduled claim sync retries a due job and marks it completed', async () => {
    const writes: any[] = [];
    __adminTest.captureCommits(writes);
    __adminTest.setIdentity(async (_uid, role) => ({ role, previousRole: null }));
    __adminTest.setFirestore(() => ({ roleVersion: 0 }));
    __adminTest.setQuery(() => [{ name: 'staffClaimSync/staffClaimSync%3Astaff-1%3A1', updateTime: 'u1', data: {
      uid: 'staff-1', desiredRole: 'marketing', desiredActive: true, desiredVersion: 0, status: 'pending', attempts: 0, nextAttemptAt: new Date(0).toISOString(),
    } }]);
    await processStaffClaimSync(env);
    expect(writes.length > 0).toBe(true);
    const lease = writes.flat().find((write: any) => write.update?.fields?.leaseToken);
    expect(Boolean(lease)).toBe(true);
    expect(String(lease.update.fields.expiresAt.timestampValue) > new Date().toISOString()).toBe(true);
    const completed = writes.flat().find((write: any) => write.update?.fields?.status?.stringValue === 'completed');
    expect(Boolean(completed)).toBe(true);
  });

  test('stale claim jobs are superseded and lease contention prevents identity writes', async () => {
    let identityCalls = 0;
    __adminTest.setIdentity(async () => { identityCalls++; return { role: 'marketing', previousRole: null }; });
    __adminTest.setFirestore((collection) => collection === 'staffMembers' ? { roleVersion: 4 } : null);
    __adminTest.setQuery(() => [{ name: 'staffClaimSync/stale', updateTime: 'u1', data: {
      uid: 'staff-1', desiredRole: 'admin', desiredActive: true, desiredVersion: 3, status: 'pending', attempts: 0, nextAttemptAt: new Date(0).toISOString(),
    } }]);
    const writes: unknown[][] = []; __adminTest.captureCommits(writes);
    await processStaffClaimSync(env);
    expect(identityCalls).toBe(0);
    __adminTest.setFirestore((collection) => collection === 'staffClaimSyncLocks' ? { expiresAt: new Date(Date.now() + 60000).toISOString() } : { roleVersion: 4 });
    await processStaffClaimSync(env);
    expect(identityCalls).toBe(0);
  });

  test('claim jobs preserve distinct owner-transfer versions', () => {
    const target = claimSyncWrite(env, 'new-owner', 'owner', true, 4);
    const former = claimSyncWrite(env, 'old-owner', 'super_admin', true, 7);
    expect(target.update.name === former.update.name).toBe(false);
    expect(target.update.fields.desiredVersion.integerValue).toBe('4');
    expect(former.update.fields.desiredVersion.integerValue).toBe('7');
  });

  test('revoked staff claim jobs are fenced to null role before Firebase claim synchronization', async () => {
    let desiredRole: unknown = 'not-called';
    __adminTest.setIdentity(async (_uid, role) => { desiredRole = role; return { role, previousRole: 'support' }; });
    __adminTest.setFirestore((collection) => collection === 'staffMembers' ? { role: 'support', active: false, roleVersion: 0 } : null);
    __adminTest.setQuery(() => [{ name: 'staffClaimSync/revoked', updateTime: 'u1', data: {
      uid: 'revoked-1', desiredRole: null, desiredActive: false, desiredVersion: 0, status: 'pending', attempts: 0, nextAttemptAt: new Date(0).toISOString(),
    } }]);
    __adminTest.captureCommits([]);
    await processStaffClaimSync(env);
    expect(desiredRole).toBe(null);
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
    expect(response.status).toBe(404);
  });

  test('auth config admin detail exposes safe defaults when missing', async () => {
    const actor: any = { uid: 'config-1', admin: true, role: 'super_admin', permissionRole: 'super_admin', testInjected: true };
    __adminTest.setFirestore(() => null);
    const result: any = await handleAdmin(new Request('https://worker.test/api/admin/detail/authConfig/default'), env, actor);
    expect(result.success).toBe(true);
    expect(result.item.requested.requirePhoneOnSignup).toBe(false);
    expect(result.item.effective.allowEmailLogin).toBe(true);
    expect(result.item.effective.allowPhoneLogin).toBe(false);
    expect(result.item.effective.requirePhoneVerification).toBe(false);
  });

  test('auth config update enforces config permission, version and canonical mobile alias', async () => {
    const actor: any = { uid: 'config-1', admin: true, role: 'super_admin', permissionRole: 'super_admin', testInjected: true };
    __adminTest.setFirestore((collection, id) => collection === 'heavyarConfig' && id === 'auth' ? { version: 3, allowEmailLogin: true } : null);
    const denied: any = await handleAdmin(new Request('https://worker.test/api/admin/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_auth_config', targetType: 'authConfig', targetId: 'default', expectedVersion: 3, config: { requireMobileDuringSignup: true }, reason: 'update auth policy' }) }), env, { ...actor, permissionRole: 'support' });
    expect(denied.status).toBe(403);
    const conflict: any = await handleAdmin(new Request('https://worker.test/api/admin/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_auth_config', targetType: 'authConfig', targetId: 'default', expectedVersion: 2, config: { requireMobileDuringSignup: true }, reason: 'update auth policy' }) }), env, actor);
    expect(conflict.status).toBe(409);
    const commits: unknown[][] = []; __adminTest.captureCommits(commits);
    const success: any = await handleAdmin(new Request('https://worker.test/api/admin/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_auth_config', targetType: 'authConfig', targetId: 'default', expectedVersion: 3, config: { requireMobileDuringSignup: true, allowEmailLogin: false }, reason: 'update auth policy' }) }), env, actor);
    expect(success.success).toBe(true);
    expect((commits[0][0] as any).update.fields.requirePhoneOnSignup.booleanValue).toBe(true);
    expect((commits[0][0] as any).update.fields.version.integerValue).toBe('4');
    expect(JSON.stringify(commits).includes('adminAudit')).toBe(true);
  });
});