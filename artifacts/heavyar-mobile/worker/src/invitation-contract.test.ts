import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import worker, { __test, type Env } from './index';
import { __adminTest, requireAdmin } from './admin';

const prefix = 'projects/invitation-test/databases/(default)/documents/';
const id = 'invite:abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';
const legacyId = id.replace(':', '%3A');
const uuidLegacyId = 'heavyar-super-admin-11111111-2222-4333-8444-555555555555';
const request = (path: string, body?: unknown) => new Request(`https://worker.test${path}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const value = (v: any): any => typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
const fields = (data: any) => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, value(v)]));

describe('invitation HTTP and Firestore resource contract', () => {
  let env: Env;
  let originalFetch: typeof fetch;
  let docs: Map<string, any>;
  let commits: any[][];
  let requests: string[];
  let messages: string[];
  let beforeCommit: ((writes: any[]) => Response | void) | undefined;
  let revision: number;
  const put = (path: string, data: any) => docs.set(prefix + path, {
    name: prefix + path, fields: fields(data), updateTime: `2026-01-01T00:00:00.${String(++revision).padStart(6, '0')}Z`,
  });
  const pending = (overrides: any = {}) => ({
    email: 'recipient@example.test', role: 'support', status: 'pending',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(), createdAt: new Date(Date.now() - 600_000).toISOString(),
    deliveryStatus: 'delivered', providerMessageId: 'historical-message', invitedBy: 'original-inviter', ...overrides,
  });
  const cancel = (invitationId = id, reason: unknown = '  No longer needed  ') =>
    worker.fetch(request('/api/admin/staff/invitations/cancel', { id: invitationId, reason, cancelledBy: 'forged-actor' }), env);

  beforeEach(async () => {
    __adminTest.setFirestore(); __adminTest.captureCommits(); __adminTest.setQuery();
    __adminTest.setVerifiedEmail(async () => 'recipient@example.test');
    __adminTest.setIdentity(async (_uid, role) => ({ role, previousRole: null }));
    __test.setAuth({ uid: 'real-owner', admin: true, role: 'super_admin', permissionRole: 'owner', emailVerified: true });
    __test.setFirestore(); __test.captureCommits();
    // Ephemeral test-only signing material. Every network request is intercepted.
    const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 1024, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', keys.privateKey);
    env = { FIREBASE_PROJECT_ID: 'invitation-test', FIREBASE_CLIENT_EMAIL: 'fixture@example.test',
      FIREBASE_PRIVATE_KEY: btoa(String.fromCharCode(...new Uint8Array(pkcs8))), CORS_ORIGINS: 'http://localhost' } as Env;
    docs = new Map(); commits = []; requests = []; messages = []; revision = 0; beforeCommit = undefined;
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init: any = {}) => {
      const url = new URL(String(input)); requests.push(url.toString());
      if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'fixture-only' });
      if (url.hostname === 'api.resend.com') {
        messages.push(JSON.parse(init.body).html);
        return Response.json({ id: 'new-message' });
      }
      if (url.hostname !== 'firestore.googleapis.com') throw new Error(`Unexpected test network: ${url.hostname}`);
      const body = init.body ? JSON.parse(init.body) : null;
      if (url.pathname.endsWith(':runQuery')) {
        const collection = body.structuredQuery.from[0].collectionId;
        return Response.json([...docs.values()].filter(doc => doc.name.startsWith(`${prefix}${collection}/`)).map(document => ({ document })));
      }
      if (url.pathname.endsWith(':commit')) {
        const writes = body.writes;
        const intercepted = beforeCommit?.(writes);
        if (intercepted) return intercepted;
        // Validate the entire atomic batch before applying anything. Names in
        // JSON are literal; only GET URL path components are percent-decoded.
        for (const write of writes) {
          const doc = docs.get(write.update?.name || write.delete);
          const pre = write.currentDocument;
          if (pre?.exists === false && doc || pre?.updateTime && doc?.updateTime !== pre.updateTime) {
            return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 });
          }
        }
        for (const write of writes) {
          if (!write.update) continue;
          const old = docs.get(write.update.name);
          docs.set(write.update.name, { ...write.update,
            fields: write.updateMask ? { ...old?.fields, ...write.update.fields } : write.update.fields,
            updateTime: `2026-01-01T00:00:01.${String(++revision).padStart(6, '0')}Z` });
        }
        commits.push(writes);
        return Response.json({});
      }
      const name = decodeURIComponent(url.pathname.slice('/v1/'.length));
      if (init.method === 'PATCH') {
        docs.set(name, { name, fields: body.fields });
        return Response.json(docs.get(name));
      }
      return docs.has(name) ? Response.json(docs.get(name)) : Response.json({}, { status: 404 });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    __test.setAuth(); __test.setFirestore(); __test.captureCommits();
    __adminTest.setFirestore(); __adminTest.captureCommits(); __adminTest.setQuery();
    __adminTest.setVerifiedEmail(); __adminTest.setIdentity();
  });

  test('list ID roundtrips through cancellation for existing literal %3A documents; atomic audit and history preserved', async () => {
    put(`staffInvitations/${legacyId}`, pending());
    const listed = await worker.fetch(request('/api/admin/staff/invitations'), env);
    const listedId = (await listed.json() as any).invitations[0].id;
    expect(listedId).toBe(legacyId);
    expect((await cancel(listedId)).status).toBe(200);
    const doc = docs.get(`${prefix}staffInvitations/${legacyId}`);
    expect(doc.fields.status.stringValue).toBe('cancelled');
    expect(doc.fields.cancelledBy.stringValue).toBe('real-owner');
    expect(doc.fields.cancellationReason.stringValue).toBe('No longer needed');
    expect(typeof doc.fields.cancelledAt.timestampValue).toBe('string');
    expect(doc.fields.deliveryStatus.stringValue).toBe('delivered');
    expect(doc.fields.providerMessageId.stringValue).toBe('historical-message');
    expect(commits[0].length).toBe(2);
    expect(commits[0][0].currentDocument.updateTime).toBe('2026-01-01T00:00:00.000001Z');
    expect(commits[0][1].update.fields.actorUid.stringValue).toBe('real-owner');
    expect(commits[0][1].update.fields.targetId.stringValue).toBe(legacyId);
    expect(requests.some(url => url.includes('invite%253A'))).toBe(true);
    const repeat = await cancel(listedId, 'Different retry reason');
    expect((await repeat.json() as any).idempotent).toBe(true);
    expect(commits.length).toBe(1);
    expect(doc.fields.cancellationReason.stringValue).toBe('No longer needed');
  });

  test('new invitations use literal canonical resource names and cancellation ignores delivery status', async () => {
    const created = await worker.fetch(request('/api/admin/staff/invitations', { email: 'recipient@example.test', role: 'support' }), { ...env, RESEND_API_KEY: 'fixture-only' });
    const invitationId = (await created.json() as any).invitationId;
    expect(invitationId.startsWith('invite:')).toBe(true);
    expect(docs.has(`${prefix}staffInvitations/${invitationId}`)).toBe(true);
    expect(commits[0][0].update.name.includes('%3A')).toBe(false);
    expect((await cancel(invitationId)).status).toBe(200);
    for (const deliveryStatus of ['requested', 'failed', 'bounced', 'complained', 'accepted', 'delivered']) {
      put(`staffInvitations/${id}`, pending({ deliveryStatus }));
      expect((await cancel()).status).toBe(200);
      expect(docs.get(`${prefix}staffInvitations/${id}`).fields.deliveryStatus.stringValue).toBe(deliveryStatus);
    }
  });

  test('invitation reconciles a webhook arriving between the canonical event read and sender persistence', async () => {
    const eventAt = new Date().toISOString();
    beforeCommit = writes => {
      if (writes.some(write => write.update?.fields?.providerMessageId?.stringValue === 'new-message')) {
        beforeCommit = undefined;
        put('resendWebhookEvents/msg-prearrival', { status: 'delivered', eventType: 'email.delivered', providerMessageId: 'new-message', eventAt, processedAt: eventAt });
      }
    };
    const response = await worker.fetch(request('/api/admin/staff/invitations', { email: 'recipient@example.test', role: 'support' }), { ...env, RESEND_API_KEY: 'fixture-only' });
    expect(response.status).toBe(200);
    const invitationId = (await response.json() as any).invitationId;
    const invitation = docs.get(`${prefix}staffInvitations/${invitationId}`).fields;
    expect(invitation.providerMessageId.stringValue).toBe('new-message');
    expect(invitation.deliveryStatus.stringValue).toBe('delivered');
    expect(invitation.deliveryEventAt.timestampValue).toBe(eventAt);
    expect(invitation.role.stringValue).toBe('support');
  });

  test('a new reminder clears delivery ordering from the previous provider message', async () => {
    put('users/reminder-user', { email: 'recipient@example.test', emailVerified: false });
    put('emailVerificationRateLimits/reminder-user', {
      uid: 'reminder-user', providerMessageId: 'old-message', deliveryStatus: 'bounced',
      deliveryEventAt: '2026-01-01T00:00:00.000Z', nextAllowedAt: '2025-01-01T00:00:00.000Z',
    });
    const fixtureFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = new URL(String(input));
      if (url.hostname === 'identitytoolkit.googleapis.com') return Response.json({ oobLink: 'https://worker.test/verify' });
      return fixtureFetch(input, init);
    }) as typeof fetch;
    const response = await worker.fetch(request('/api/admin/email-verification/reminder', { uid: 'reminder-user' }), { ...env, RESEND_API_KEY: 'fixture-only' });
    expect(response.status).toBe(200);
    const reminder = docs.get(`${prefix}emailVerificationRateLimits/reminder-user`).fields;
    expect(reminder.providerMessageId.stringValue).toBe('new-message');
    expect(reminder.deliveryStatus.stringValue).toBe('accepted');
    expect(reminder.deliveryEventAt.nullValue).toBe(null);
  });

  test('production-shaped UUID list identity beats data.id and survives CAS cancellation and audit', async () => {
    put(`staffInvitations/${uuidLegacyId}`, pending({ id: 'shadowed-business-id' }));
    const list = await worker.fetch(request('/api/admin/staff/invitations'), env);
    const physicalId = (await list.json() as any).invitations[0].id;
    expect(physicalId).toBe(uuidLegacyId);
    beforeCommit = () => {
      beforeCommit = undefined;
      put(`staffInvitations/${uuidLegacyId}`, pending({ id: 'shadowed-business-id', deliveryStatus: 'bounced' }));
    };
    const response = await cancel(physicalId);
    expect(response.status).toBe(200);
    expect((await response.json() as any).invitationId).toBe(uuidLegacyId);
    expect(commits.length).toBe(1);
    expect(commits[0][0].update.name).toBe(`${prefix}staffInvitations/${uuidLegacyId}`);
    expect(commits[0][1].update.fields.targetId.stringValue).toBe(uuidLegacyId);
    expect(commits[0][1].update.fields.actorUid.stringValue).toBe('real-owner');
    expect(docs.get(`${prefix}staffInvitations/${uuidLegacyId}`).fields.deliveryStatus.stringValue).toBe('bounced');
    expect((await (await cancel(physicalId)).json() as any).idempotent).toBe(true);
    expect(commits.length).toBe(1);
  });

  test('UUID invitation state and concurrency checks do not depend on ID naming convention', async () => {
    for (const [status, errorCode] of [['accepted', 'INVITATION_ALREADY_ACCEPTED'], ['expired', 'INVITATION_EXPIRED']]) {
      put(`staffInvitations/${uuidLegacyId}`, pending({ status }));
      const response = await cancel(uuidLegacyId);
      expect(response.status).toBe(409);
      expect((await response.json() as any).errorCode).toBe(errorCode);
    }
    put(`staffInvitations/${uuidLegacyId}`, pending());
    beforeCommit = () => { beforeCommit = undefined; put(`staffInvitations/${uuidLegacyId}`, pending({ status: 'accepted' })); };
    expect((await (await cancel(uuidLegacyId)).json() as any).errorCode).toBe('INVITATION_ALREADY_ACCEPTED');
    expect(commits.length).toBe(0);
    put(`staffInvitations/${uuidLegacyId}`, pending());
    const responses = await Promise.all([cancel(uuidLegacyId), cancel(uuidLegacyId)]);
    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(commits.length).toBe(1);
  });

  test('management preserves opaque Unicode, percent sequences and whitespace without fallback or normalization', async () => {
    for (const physicalId of ['دعوة-الموظف', 'invite%253Aopaque', 'literal%2Fsegment', ' spaced-id ', 'x'.repeat(1500)]) {
      put(`staffInvitations/${physicalId}`, pending());
      const response = await cancel(physicalId);
      expect(response.status).toBe(200);
      expect((await response.json() as any).invitationId).toBe(physicalId);
      expect(commits[commits.length - 1][0].update.name).toBe(`${prefix}staffInvitations/${physicalId}`);
      expect(commits[commits.length - 1][1].update.fields.targetId.stringValue).toBe(physicalId);
    }
    put(`staffInvitations/${legacyId}`, pending());
    // A management ID is exact, unlike the narrowly token-derived fallback.
    const missingCanonical = await cancel(id);
    expect(missingCanonical.status).toBe(404);
    expect(docs.get(`${prefix}staffInvitations/${legacyId}`).fields.status.stringValue).toBe('pending');
    expect((await cancel(legacyId)).status).toBe(200);
  });

  test('both management endpoints reject invalid IDs before any Firestore request', async () => {
    for (const invalid of ['', '   ', '.', '..', '__reserved__', '../staffMembers/owner', 'a/b', 'a\\b', 'a\0b', 'a\nb', 'a\u007fb', 'x'.repeat(1501), 'ع'.repeat(751), null, {}, 42]) {
      for (const operation of ['cancel', 'resend']) {
        const response = await worker.fetch(request(`/api/admin/staff/invitations/${operation}`, { id: invalid, reason: 'Policy reason' }), env);
        expect(response.status).toBe(400);
        expect((await response.json() as any).errorCode).toBe('INVITATION_INVALID');
      }
    }
    expect(requests.length).toBe(0);
    expect(commits.length).toBe(0);
    const absentOpaque = await cancel('abc');
    expect(absentOpaque.status).toBe(404);
    expect((await absentOpaque.json() as any).errorCode).toBe('INVITATION_INVALID');
  });

  test('validation, accepted, expired, absent and unauthorized invitations have canonical codes with no writes', async () => {
    for (const [status, expected] of [['accepted', 'INVITATION_ALREADY_ACCEPTED'], ['expired', 'INVITATION_EXPIRED']]) {
      put(`staffInvitations/${id}`, pending({ status }));
      const response = await cancel();
      expect(response.status).toBe(409);
      expect((await response.json() as any).errorCode).toBe(expected);
    }
    expect((await (await cancel('bad/id')).json() as any).errorCode).toBe('INVITATION_INVALID');
    for (const reason of ['', 'ab', { text: 'do not coerce' }, 'x'.repeat(1001)]) {
      expect((await (await cancel(id, reason)).json() as any).errorCode).toBe('INVITATION_REASON_REQUIRED');
    }
    docs.clear();
    expect((await (await cancel()).json() as any).errorCode).toBe('INVITATION_INVALID');
    __test.setAuth({ uid: 'moderator', admin: true, role: 'admin', permissionRole: 'moderator', emailVerified: true });
    expect((await (await cancel()).json() as any).errorCode).toBe('PERMISSION_DENIED');
    expect(commits.length).toBe(0);
  });

  test('webhook-only CAS conflict retries without losing history; competing cancellation is idempotent', async () => {
    put(`staffInvitations/${id}`, pending());
    beforeCommit = () => { beforeCommit = undefined; put(`staffInvitations/${id}`, pending({ deliveryStatus: 'bounced' })); };
    expect((await cancel()).status).toBe(200);
    expect(commits.length).toBe(1);
    expect(docs.get(`${prefix}staffInvitations/${id}`).fields.deliveryStatus.stringValue).toBe('bounced');
    put(`staffInvitations/${id}`, pending());
    beforeCommit = () => { beforeCommit = undefined; put(`staffInvitations/${id}`, pending({ status: 'cancelled', cancelledBy: 'other-owner' })); };
    expect((await (await cancel()).json() as any).idempotent).toBe(true);
    expect(commits.length).toBe(1);
    expect(docs.get(`${prefix}staffInvitations/${id}`).fields.cancelledBy.stringValue).toBe('other-owner');
  });

  test('acceptance wins CAS against cancellation without staff revocation or misleading success', async () => {
    put(`staffInvitations/${id}`, pending());
    beforeCommit = () => { beforeCommit = undefined; put(`staffInvitations/${id}`, pending({ status: 'accepted', acceptedBy: 'recipient' })); };
    const response = await cancel();
    expect(response.status).toBe(409);
    expect((await response.json() as any).errorCode).toBe('INVITATION_ALREADY_ACCEPTED');
    expect(commits.length).toBe(0);
  });

  test('bounded conflicts are 409, but infrastructure failures remain 500, never already accepted', async () => {
    put(`staffInvitations/${id}`, pending());
    beforeCommit = () => Response.json({ error: { status: 'ABORTED' } }, { status: 409 });
    expect((await (await cancel()).json() as any).errorCode).toBe('INVITATION_CONFLICT');
    beforeCommit = () => Response.json({}, { status: 503 });
    expect((await cancel()).status).toBe(500);
    expect(commits.length).toBe(0);
  });

  test('simultaneous cancellation requests commit one transition and one real actor audit', async () => {
    put(`staffInvitations/${id}`, pending());
    const responses = await Promise.all([cancel(), cancel()]);
    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(commits.length).toBe(1);
    const bodies = await Promise.all(responses.map(response => response.json() as Promise<any>));
    expect(bodies.filter(body => body.idempotent).length).toBe(1);
    expect([...docs.keys()].filter(name => name.includes('/adminAudit/')).length).toBe(1);
  });

  test('resend resolves legacy ID, rotates business identity and does not copy delivery history', async () => {
    put(`staffInvitations/${legacyId}`, pending({ deliveryFailedAt: '2025-01-01T00:00:00Z' }));
    const response = await worker.fetch(request('/api/admin/staff/invitations/resend', { id: legacyId }), { ...env, RESEND_API_KEY: 'fixture-only' });
    expect(response.status).toBe(200);
    const nextId = (await response.json() as any).invitationId;
    expect(nextId.startsWith('invite:')).toBe(true);
    const prior = docs.get(`${prefix}staffInvitations/${legacyId}`).fields;
    expect(prior.status.stringValue).toBe('cancelled');
    expect(prior.cancelledBy.stringValue).toBe('real-owner');
    expect(prior.providerMessageId.stringValue).toBe('historical-message');
    const next = docs.get(`${prefix}staffInvitations/${nextId}`).fields;
    expect(next.status.stringValue).toBe('pending');
    expect(next.deliveryFailedAt).toBe(undefined);
    expect(next.providerMessageId.stringValue).toBe('new-message');
    expect((await cancel(nextId)).status).toBe(200);
  });

  test('UUID legacy records cannot become bearer authority; resend rotates through the existing hashed-token architecture', async () => {
    const unknownLegacyToken = 'synthetic-unproven-legacy-token';
    const hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(unknownLegacyToken))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    // A tokenHash field alone is not evidence of an established legacy lookup
    // contract. The Worker must not invent one or accept a physical ID as token.
    put(`staffInvitations/${uuidLegacyId}`, pending({ tokenHash: hash }));
    for (const token of [uuidLegacyId, unknownLegacyToken]) {
      const denied = await worker.fetch(request('/api/staff/invitations/accept', { token, id: uuidLegacyId }), env);
      expect((await denied.json() as any).errorCode).toBe('INVITATION_INVALID');
    }
    expect(commits.length).toBe(0);
    const response = await worker.fetch(request('/api/admin/staff/invitations/resend', { id: uuidLegacyId }), { ...env, RESEND_API_KEY: 'fixture-only' });
    expect(response.status).toBe(200);
    const nextId = (await response.json() as any).invitationId;
    expect(commits[0][0].update.name).toBe(`${prefix}staffInvitations/${uuidLegacyId}`);
    expect(commits[0][0].currentDocument.updateTime).toBe('2026-01-01T00:00:00.000001Z');
    const audit = commits[0][2].update.fields;
    expect(audit.actorUid.stringValue).toBe('real-owner');
    expect(audit.before.mapValue.fields.invitationId.stringValue).toBe(uuidLegacyId);
    expect(audit.targetId.stringValue).toBe(nextId);
    expect(docs.get(`${prefix}staffInvitations/${uuidLegacyId}`).fields.status.stringValue).toBe('cancelled');
    const newToken = messages[0].match(/token=([^"]+)/)?.[1];
    expect(typeof newToken).toBe('string');
    __test.setAuth({ uid: 'recipient', admin: false, emailVerified: true });
    const accepted = await worker.fetch(request('/api/staff/invitations/accept', { token: newToken }), env);
    expect(accepted.status).toBe(200);
    expect(docs.get(`${prefix}staffInvitations/${nextId}`).fields.status.stringValue).toBe('accepted');
    expect(docs.get(`${prefix}staffInvitations/${uuidLegacyId}`).fields.status.stringValue).toBe('cancelled');
  });

  test('UUID resend CAS conflict cannot revive a concurrently cancelled invitation', async () => {
    put(`staffInvitations/${uuidLegacyId}`, pending());
    beforeCommit = () => { beforeCommit = undefined; put(`staffInvitations/${uuidLegacyId}`, pending({ status: 'cancelled' })); };
    const response = await worker.fetch(request('/api/admin/staff/invitations/resend', { id: uuidLegacyId }), { ...env, RESEND_API_KEY: 'fixture-only' });
    expect(response.status).toBe(409);
    expect((await response.json() as any).errorCode).toBe('INVITATION_CONFLICT');
    expect(commits.length).toBe(0);
    expect([...docs.keys()].filter(name => name.includes('/staffInvitations/')).length).toBe(1);
    expect(docs.get(`${prefix}staffInvitations/${uuidLegacyId}`).fields.status.stringValue).toBe('cancelled');
  });

  test('signed Resend events only write communication fields even for cancelled invitations', async () => {
    put(`staffInvitations/${legacyId}`, pending({ status: 'cancelled' }));
    const secretBytes = new TextEncoder().encode('local-test-webhook-key');
    const secret = btoa(String.fromCharCode(...secretBytes));
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    for (const type of ['email.sent', 'email.delivered', 'email.bounced', 'email.complained', 'email.failed']) {
      const eventId = `test-${type.replace('.', '-')}`, timestamp = String(Math.floor(Date.now() / 1000));
      const body = JSON.stringify({ type, data: { email_id: 'historical-message', status: 'accepted', role: 'owner' } });
      const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${eventId}.${timestamp}.${body}`)))));
      const response = await worker.fetch(new Request('https://worker.test/api/webhooks/resend', {
        method: 'POST', headers: { 'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }, body,
      }), { ...env, RESEND_WEBHOOK_SECRET: `whsec_${secret}` });
      expect(response.status).toBe(200);
      const doc = docs.get(`${prefix}staffInvitations/${legacyId}`);
      expect(doc.fields.status.stringValue).toBe('cancelled');
      expect(doc.fields.role.stringValue).toBe('support');
    }
    expect(commits.every(batch => batch.filter(write => !write.update.name.includes('/resendWebhookEvents/')).every(write =>
      write.updateMask.fieldPaths.every((field: string) => ['deliveryStatus', 'deliveryUpdatedAt', 'deliveryEventAt'].includes(field))))).toBe(true);
    expect(commits.every(batch => batch.at(-1).currentDocument.exists === false)).toBe(true);
    expect([...docs.keys()].some(name => name.includes('/staffMembers/'))).toBe(false);
  });

  test('Resend webhook uses standard Base64, strict validation, and atomic replay-safe projection', async () => {
    put('emailVerificationRateLimits/reminder', { uid: 'reminder', deliveryStatus: 'accepted', providerMessageId: 'shared-message' });
    put(`staffInvitations/${legacyId}`, pending({ status: 'cancelled', providerMessageId: 'shared-message' }));
    const secretBytes = new TextEncoder().encode('standard-base64-webhook-key');
    const secret = btoa(String.fromCharCode(...secretBytes));
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: 'email.delivered', created_at: new Date(Number(timestamp) * 1000).toISOString(), data: { email_id: 'shared-message' } });
    const sign = async (eventId: string, time = timestamp, payload = body) =>
      btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${eventId}.${time}.${payload}`)))));
    let eventId = '', signature = '';
    for (let attempt = 0; attempt < 10000; attempt++) {
      eventId = `msg_standard_${attempt}`;
      signature = await sign(eventId);
      if (signature.includes('+') && signature.includes('/') && signature.endsWith('=')) break;
    }
    expect(signature.includes('+') && signature.includes('/') && signature.endsWith('=')).toBe(true);
    const send = (idValue = eventId, time = timestamp, payload = body, supplied = `v1,invalid== v1,${signature}`) =>
      worker.fetch(new Request('https://worker.test/api/webhooks/resend', {
        method: 'POST', headers: { 'svix-id': idValue, 'svix-timestamp': time, 'svix-signature': supplied }, body: payload,
      }), { ...env, RESEND_WEBHOOK_SECRET: `whsec_${secret}` });

    expect((await send()).status).toBe(200);
    expect(commits.length).toBe(1);
    expect(commits[0].length).toBe(3);
    for (const path of ['emailVerificationRateLimits/reminder', `staffInvitations/${legacyId}`]) {
      const projected = docs.get(prefix + path);
      expect(projected.fields.deliveryStatus.stringValue).toBe('delivered');
      expect(projected.fields.status?.stringValue).toBe(path.startsWith('staff') ? 'cancelled' : undefined);
    }
    const firstUpdatedAt = docs.get(`${prefix}staffInvitations/${legacyId}`).fields.deliveryUpdatedAt.timestampValue;
    expect((await send()).status).toBe(200);
    expect(commits.length).toBe(1);
    expect(docs.get(`${prefix}staffInvitations/${legacyId}`).fields.deliveryUpdatedAt.timestampValue).toBe(firstUpdatedAt);

    const oldBody = JSON.stringify({ type: 'email.bounced', created_at: new Date((Number(timestamp) - 60) * 1000).toISOString(), data: { email_id: 'shared-message' } });
    const oldId = 'msg_older_terminal';
    expect((await send(oldId, timestamp, oldBody, `v1,${await sign(oldId, timestamp, oldBody)}`)).status).toBe(200);
    const sentBody = JSON.stringify({ type: 'email.sent', created_at: new Date((Number(timestamp) + 1) * 1000).toISOString(), data: { email_id: 'shared-message' } });
    const sentId = 'msg_late_sent';
    expect((await send(sentId, timestamp, sentBody, `v1,${await sign(sentId, timestamp, sentBody)}`)).status).toBe(200);
    expect(docs.get(`${prefix}staffInvitations/${legacyId}`).fields.deliveryStatus.stringValue).toBe('delivered');

    const concurrentBody = JSON.stringify({ type: 'email.complained', created_at: new Date((Number(timestamp) + 2) * 1000).toISOString(), data: { email_id: 'shared-message' } });
    const concurrentId = 'msg_concurrent';
    const concurrentSignature = `v1,${await sign(concurrentId, timestamp, concurrentBody)}`;
    const concurrent = await Promise.all([
      send(concurrentId, timestamp, concurrentBody, concurrentSignature),
      send(concurrentId, timestamp, concurrentBody, concurrentSignature),
    ]);
    expect(concurrent.every(response => response.status === 200)).toBe(true);
    expect(docs.get(`${prefix}staffInvitations/${legacyId}`).fields.deliveryStatus.stringValue).toBe('complained');
    expect(commits.length).toBe(4);

    const badCases: Array<[string, string, string, string]> = [
      ['bad/id', timestamp, body, `v1,${await sign('bad/id')}`],
      ['msg_nan', 'NaN', body, `v1,${await sign('msg_nan', 'NaN')}`],
      ['msg_stale', String(Number(timestamp) - 301), body, `v1,${await sign('msg_stale', String(Number(timestamp) - 301))}`],
      ['msg_tampered', timestamp, body, `v1,${signature.slice(0, -2)}AA`],
    ];
    for (const [badId, badTime, badBody, badSignature] of badCases) expect((await send(badId, badTime, badBody, badSignature)).status).toBe(401);
    expect(commits.length).toBe(4);

    const unsupportedBody = JSON.stringify({ type: 'email.opened', data: { email_id: 'shared-message' } });
    const unsupportedId = 'msg_unsupported';
    expect((await send(unsupportedId, timestamp, unsupportedBody, `v1,${await sign(unsupportedId, timestamp, unsupportedBody)}`)).status).toBe(200);
    expect(commits.length).toBe(4);
  });

  test('Resend webhook commit failure is atomic and safely retryable', async () => {
    put(`staffInvitations/${legacyId}`, pending({ status: 'cancelled' }));
    const secretBytes = new TextEncoder().encode('retryable-webhook-key');
    const secret = btoa(String.fromCharCode(...secretBytes));
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const eventId = 'msg_retryable', timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'historical-message' } });
    const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${eventId}.${timestamp}.${body}`)))));
    const send = () => worker.fetch(new Request('https://worker.test/api/webhooks/resend', {
      method: 'POST', headers: { 'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }, body,
    }), { ...env, RESEND_WEBHOOK_SECRET: `whsec_${secret}` });
    beforeCommit = () => Response.json({ error: { status: 'UNAVAILABLE' } }, { status: 503 });
    expect((await send()).status).toBe(500);
    expect(docs.get(`${prefix}staffInvitations/${legacyId}`).fields.deliveryStatus.stringValue).toBe('delivered');
    expect(docs.has(`${prefix}resendWebhookEvents/${eventId}`)).toBe(false);
    beforeCommit = undefined;
    expect((await send()).status).toBe(200);
    expect(docs.get(`${prefix}staffInvitations/${legacyId}`).fields.deliveryStatus.stringValue).toBe('bounced');
    expect(commits.length).toBe(1);
  });

  test('token acceptance resolves legacy identity and cannot accept cancelled or expired invites', async () => {
    const token = 'test-invitation-token';
    const hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tokenId = `invite%3A${hash}`;
    put(`staffInvitations/${tokenId}`, pending());
    expect((await cancel(tokenId)).status).toBe(200);
    __test.setAuth({ uid: 'recipient', admin: false, emailVerified: true });
    const accept = () => worker.fetch(request('/api/staff/invitations/accept', { token }), env);
    expect((await (await accept()).json() as any).errorCode).toBe('INVITATION_ALREADY_CANCELLED');
    put(`staffInvitations/${tokenId}`, pending({ expiresAt: new Date(Date.now() - 1).toISOString() }));
    expect((await (await accept()).json() as any).errorCode).toBe('INVITATION_EXPIRED');
    expect(docs.has(`${prefix}staffMembers/recipient`)).toBe(false);
    put(`staffInvitations/${tokenId}`, pending());
    beforeCommit = () => { beforeCommit = undefined; put(`staffInvitations/${tokenId}`, pending({ status: 'cancelled' })); };
    expect((await (await accept()).json() as any).errorCode).toBe('INVITATION_ALREADY_CANCELLED');
    expect(docs.has(`${prefix}staffMembers/recipient`)).toBe(false);
    expect(commits.length).toBe(1);
    put(`staffInvitations/${tokenId}`, pending());
    expect((await accept()).status).toBe(200);
    expect(docs.get(`${prefix}staffInvitations/${tokenId}`).fields.status.stringValue).toBe('accepted');
    expect(commits[1].some(write => write.update?.name === `${prefix}staffInvitations/${tokenId}`)).toBe(true);
  });

  test('equipment moderation requires verified actor, not verified owner, and preserves action reason policy', async () => {
    put('equipment/listing', { ownerUid: 'unverified-provider', moderationStatus: 'pending_review', visibility: 'visible' });
    put('users/unverified-provider', { emailVerified: false });
    const action = (name: string, reason?: string) => worker.fetch(request('/api/admin/action', { action: name, targetType: 'equipment', targetId: 'listing', reason }), env);
    __test.setAuth({ uid: 'moderator', admin: true, role: 'admin', permissionRole: 'moderator', emailVerified: false });
    const denied = await action('approve_listing');
    expect(denied.status).toBe(403);
    expect((await denied.json() as any).verificationSubject).toBe('actor');
    expect(commits.length).toBe(0);
    __test.setAuth({ uid: 'moderator', admin: true, role: 'admin', permissionRole: 'moderator', emailVerified: true });
    for (const name of ['approve_listing', 'hide_listing', 'show_listing']) expect((await action(name)).status).toBe(200);
    for (const name of ['reject_listing', 'suspend_listing']) {
      expect((await action(name)).status).toBe(400);
      expect((await action(name, 'Policy reason')).status).toBe(200);
    }
    expect(requests.some(url => url.includes('/users/unverified-provider'))).toBe(false);
    // Also exercise the non-test authority boundary with authoritative staff.
    put('staffMembers/moderator', { role: 'moderator', active: true, roleVersion: 1 });
    let error = '';
    try { await requireAdmin({ uid: 'moderator', admin: true, emailVerified: false }, env); } catch (e) { error = (e as Error).message; }
    expect(error).toBe('EMAIL_VERIFICATION_REQUIRED');
  });

  test('removing the moderation owner gate does not bypass provider submission verification', async () => {
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: false });
    put('users/provider', { role: 'provider', emailVerified: false });
    put('emailVerificationPolicies/default', { enabled: true, requireBeforeListingSubmission: true });
    const response = await worker.fetch(request('/api/listings', { titleEn: 'Equipment' }), env);
    expect(response.status).toBe(403);
    const body = await response.json() as any;
    expect(body.error).toBe('EMAIL_VERIFICATION_REQUIRED');
    expect(body.errorCode).toBe('EMAIL_VERIFICATION_REQUIRED');
    expect(commits.length).toBe(0);
  });
});