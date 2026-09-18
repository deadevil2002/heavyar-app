import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { __adminTest, earlyAccessStore, handleAdmin } from './admin';
import worker, { __test, type Env } from './index';
import { EA } from './early-access-model';
import { QuotaBusyError } from './quota-policy';

const prefix = 'projects/demo-early-access-contract/databases/(default)/documents/';
const actor = { uid: 'owner', admin: true, role: 'super_admin' as const, permissionRole: 'owner', email: 'owner@example.test', emailVerified: true, testInjected: true as const };
const req = (path: string, data?: any, method = data === undefined ? 'GET' : 'POST') => new Request(`https://worker.test${path}`, { method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.8' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
const encode = (v: any): any => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : typeof v === 'object' ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = (v: any) => Object.fromEntries(Object.entries(v).map(([k, v]) => [k, encode(v)]));
const decode = (v: any): any => v.stringValue ?? v.timestampValue ?? v.booleanValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.arrayValue ? (v.arrayValue.values || []).map(decode) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields).map(([k, v]) => [k, decode(v)])) : null);

describe('Early Access real adapter, signed shared webhook and REST preconditions', () => {
  let original: typeof fetch, env: Env, docs: Map<string, any>, commits: any[][], urls: string[], sends: any[], revision: number;
  let intercept: ((writes: any[]) => void) | undefined;
  const put = (collection: string, id: string, data: any) => docs.set(`${prefix}${collection}/${id}`, { name: `${prefix}${collection}/${id}`, fields: fields(data), updateTime: `2026-01-01T00:00:00.${String(++revision).padStart(6, '0')}Z` });
  beforeEach(async () => {
    __adminTest.setFirestore(); __adminTest.setQuery(); __adminTest.captureCommits(); __adminTest.setVerifiedEmail(async () => 'owner@example.test');
    __test.setAuth(actor); __test.setFirestore(); __test.captureCommits();
    const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 1024, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    env = { FIREBASE_PROJECT_ID: 'demo-early-access-contract', FIREBASE_CLIENT_EMAIL: 'local@example.test', FIREBASE_PRIVATE_KEY: btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey)))), RESEND_API_KEY: 'test-only', RESEND_SENDER_DOMAIN_VERIFIED: 'true' };
    docs = new Map(); commits = []; urls = []; sends = []; revision = 0; intercept = undefined;
    original = globalThis.fetch;
    globalThis.fetch = (async (input: any, init: any = {}) => {
      const url = new URL(String(input)); urls.push(url.href);
      if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'local-only' });
      if (url.hostname === 'api.resend.com') { sends.push({ ...JSON.parse(init.body), headers: init.headers }); return Response.json({ id: 'message-1' }); }
      if (url.hostname !== 'firestore.googleapis.com') throw new Error('Unexpected outbound request in local test');
      const payload = init.body ? JSON.parse(init.body) : {};
      if (url.pathname.endsWith('/documents:batchGet')) return Response.json(payload.documents.map((name: string) => docs.has(name) ? { found: docs.get(name) } : { missing: name }));
      if (url.pathname.endsWith('/documents:commit')) {
        intercept?.(payload.writes);
        for (const w of payload.writes) {
          const prior = docs.get(w.update.name), pre = w.currentDocument;
          if (pre?.exists === false && prior || pre?.updateTime && prior?.updateTime !== pre.updateTime) return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 400 });
        }
        for (const w of payload.writes) {
          const old = docs.get(w.update.name);
          docs.set(w.update.name, { ...w.update, fields: w.updateMask ? { ...old?.fields, ...w.update.fields } : w.update.fields, updateTime: `2026-01-01T00:00:01.${String(++revision).padStart(6, '0')}Z` });
        }
        commits.push(payload.writes); return Response.json({});
      }
      if (url.pathname.endsWith('/documents:runQuery')) {
        const q = payload.structuredQuery, collection = q.from[0].collectionId, filter = q.where?.fieldFilter;
        return Response.json([...docs.values()].filter(d => d.name.startsWith(`${prefix}${collection}/`) && (!filter || decode(d.fields[filter.field.fieldPath] || {}) === decode(filter.value))).slice(0, q.limit).map(document => ({ document })));
      }
      const name = decodeURIComponent(url.pathname.slice('/v1/'.length));
      return docs.has(name) ? Response.json(docs.get(name)) : Response.json({}, { status: 404 });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
    __adminTest.setFirestore(); __adminTest.setQuery(); __adminTest.captureCommits(); __adminTest.setVerifiedEmail();
    __test.setAuth(); __test.setFirestore(); __test.captureCommits();
  });

  test('registration config CAS, uniqueness create, hashed tokens, facet and TTL encoding, audit atomicity', async () => {
    put(EA.config, 'default', { enabled: true, revision: 1 });
    const response = await worker.fetch(req('/api/early-access/register', { email: 'Mixed@Example.test', consentMarketing: true }), env);
    expect(response.status).toBe(200); expect(sends.length).toBe(1);
    expect(urls.every(url => !url.includes('/documents/:'))).toBe(true);
    expect(urls.some(url => url.endsWith('/documents:commit'))).toBe(true);
    const registration = commits.find(batch => batch.some(w => w.update.name.includes(`/${EA.subscribers}/`)))!;
    expect(registration.some(w => w.update.name.includes('/adminAudit/'))).toBe(true);
    expect(registration.find(w => w.update.name.endsWith(`${EA.config}/default`)).currentDocument.updateTime).toBe('2026-01-01T00:00:00.000001Z');
    const subscriber = registration.find(w => w.update.name.includes(`/${EA.subscribers}/`));
    expect(subscriber.currentDocument.exists).toBe(false);
    expect(subscriber.update.fields.filterFacets.arrayValue.values.length).toBe(31);
    expect(typeof subscriber.update.fields.retentionAt.timestampValue).toBe('string');
    const delivery = registration.find(w => w.update.name.includes(`/${EA.deliveries}/`));
    expect(typeof delivery.update.fields.expiresAt.timestampValue).toBe('string');
    const proofLifetime = Date.parse(delivery.update.fields.expiresAt.timestampValue) - Date.parse(delivery.update.fields.createdAt.stringValue);
    expect(proofLifetime >= 366 * 86400000 && proofLifetime < 366 * 86400000 + 60000).toBe(true);
    expect(registration.filter(w => w.update.name.includes(`/${EA.tokens}/`)).every(w => /^[a-f0-9]{64}$/.test(w.update.name.split('/').pop()) && !!w.update.fields.expiresAt.timestampValue)).toBe(true);
    expect(typeof sends[0].headers['Idempotency-Key']).toBe('string');
    expect(sends[0].from).toBe('Heavyar <noreply@mail.heavyar.com>');
    expect(JSON.stringify(await response.json()).includes('Mixed')).toBe(false);
    const emailToken = /verify\?token=([a-f0-9]{64})/.exec(sends[0].html)![1];
    expect(JSON.stringify([...docs.values()]).includes(emailToken)).toBe(false);
    // The submitter's consent choice is not an email holder's consent.
    const verify = await worker.fetch(req(`/api/early-access/verify?token=${emailToken}`, {}), env);
    expect(verify.status).toBe(200);
    expect(docs.get(subscriber.update.name).fields.consentMarketing.booleanValue).toBe(false);
  });

  test('toggle race fails closed atomically and provider is never called', async () => {
    put(EA.config, 'default', { enabled: true, revision: 1 });
    intercept = writes => {
      if (writes.some(w => w.update.name.includes(`/${EA.subscribers}/`))) {
        intercept = undefined; put(EA.config, 'default', { enabled: false, revision: 2 });
      }
    };
    const response = await worker.fetch(req('/api/early-access/register', { email: 'a@example.test', consentMarketing: false }), env);
    expect(response.status).toBe(409); expect(sends.length).toBe(0);
    expect([...docs.keys()].some(k => k.includes(`/${EA.subscribers}/`))).toBe(false);
  });

  test('authenticated actor is server-derived and manual action is atomic with audit', async () => {
    put(EA.subscribers, 'subscriber', { email: 'a@example.test', status: 'active', updatedAt: new Date().toISOString() });
    const response = await worker.fetch(req('/api/admin/early-access/subscribers/subscriber/action', { action: 'anonymize', reason: 'privacy request' }), env);
    expect(response.status).toBe(200);
    const batch = commits.at(-1)!;
    expect(batch.length).toBe(3);
    expect(batch.find(w => w.update.name.includes('/adminAudit/')).update.fields.actorUid.stringValue).toBe('owner');
    expect(docs.get(`${prefix}${EA.subscribers}/subscriber`).fields.email.stringValue).toBe('');
    expect(docs.get(`${prefix}${EA.subscribers}/subscriber`).fields.retentionAt.nullValue).toBe(null);
  });

  test('shared signed webhook accepted/delivered/bounced/complained/failed projects then preview excludes failures; replay safe', async () => {
    put(EA.deliveries, 'delivery', { providerMessageId: 'message-1', deliveryStatus: 'pending' });
    put(EA.subscribers, 'subscriber', { email: 'recipient@example.test', consentMarketing: true, verified: true, status: 'active', language: 'ar', country: 'SA', deliveryStatus: 'pending', deliveryId: 'delivery' });
    put(EA.campaigns, 'campaign', { name: 'Launch', revision: 1, subjectAr: 'عربي', subjectEn: 'English', bodyAr: 'عربي', bodyEn: 'English' });
    const secretBytes = new TextEncoder().encode('local-svix-contract-key'), secret = btoa(String.fromCharCode(...secretBytes));
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    for (const [type, expected, count] of [['sent', 'accepted', 1], ['delivered', 'delivered', 1], ['bounced', 'bounced', 0], ['complained', 'complained', 0], ['failed', 'failed', 0]] as const) {
      const eventId = `ea-event-${type}`, timestamp = String(Math.floor(Date.now() / 1000)), payload = JSON.stringify({ type: `email.${type}`, data: { email_id: 'message-1' } });
      const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${eventId}.${timestamp}.${payload}`)))));
      const eventReq = () => new Request('https://worker.test/api/webhooks/resend', { method: 'POST', headers: { 'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }, body: payload });
      expect((await worker.fetch(eventReq(), { ...env, RESEND_WEBHOOK_SECRET: `whsec_${secret}` })).status).toBe(200);
      expect(docs.get(`${prefix}${EA.deliveries}/delivery`).fields.deliveryStatus.stringValue).toBe(expected);
      const before = commits.length;
      expect((await worker.fetch(eventReq(), { ...env, RESEND_WEBHOOK_SECRET: `whsec_${secret}` })).status).toBe(200);
      expect(commits.length).toBe(before);
      const preview: any = await handleAdmin(req('/api/admin/early-access/campaigns/campaign/preview', { subscriberIds: ['subscriber'] }), env, { ...actor });
      expect(preview.recipientCount).toBe(count);
      if (count === 0) expect(preview.exclusionReasons.delivery_failed).toBe(1);
    }
  });

  test('adapter never overwrites without a version and reconciles early webhook delivery', async () => {
    const store = earlyAccessStore(env, actor);
    let refused = false;
    try { await store.save([{ collection: EA.config, id: 'default', prior: { data: {} }, data: { enabled: true } }], 'early_access_enabled', 'default'); } catch { refused = true; }
    expect(refused).toBe(true); expect(commits.length).toBe(0);
    put(EA.deliveries, 'delivery', { subscriberId: 'subscriber', deliveryStatus: 'pending', createdAt: new Date().toISOString() });
    put('resendWebhookEvents', 'early', { providerMessageId: 'message-1', status: 'bounced', eventAt: new Date().toISOString() });
    const prior = await store.read(EA.deliveries, 'delivery');
    await store.save([{ collection: EA.deliveries, id: 'delivery', prior, data: { ...prior!.data, providerMessageId: 'message-1', deliveryStatus: 'accepted' } }], 'early_access_email_accepted', 'delivery');
    expect(docs.get(`${prefix}${EA.deliveries}/delivery`).fields.deliveryStatus.stringValue).toBe('bounced');
    expect(docs.get(`${prefix}${EA.deliveries}/delivery`).fields.expiresAt.nullValue).toBe(null);
    const reconcile = commits.at(-1)![0];
    expect(reconcile.currentDocument.updateTime === prior!.updateTime).toBe(false);
  });
  test('terminal subscriber proof survives TTL, missing proof fails closed, and old-generation events never suppress fresh verified generation', async () => {
    const oldExpiry = '2020-01-01T00:00:00.000Z';
    put(EA.deliveries, 'old', { subscriberId: 'subscriber', providerMessageId: 'old-message', deliveryStatus: 'accepted', expiresAt: oldExpiry });
    put(EA.deliveries, 'transient', { subscriberId: 'another', providerMessageId: 'transient-message', deliveryStatus: 'pending', expiresAt: oldExpiry });
    put(EA.deliveries, 'test', { actorUid: 'owner', providerMessageId: 'test-message', deliveryStatus: 'accepted', expiresAt: oldExpiry });
    put(EA.subscribers, 'subscriber', { verified: true, consentMarketing: true, status: 'active', deliveryId: 'old', language: 'ar', country: 'SA' });
    put(EA.campaigns, 'campaign', { revision: 1, subjectAr: 'عربي', subjectEn: 'English', bodyAr: 'عربي', bodyEn: 'English' });
    const secretBytes = new TextEncoder().encode('local-terminal-proof-key'), secret = btoa(String.fromCharCode(...secretBytes));
    const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    let eventNumber = 0;
    const event = async (type: string, message: string) => {
      const id = `terminal-${++eventNumber}`, timestamp = String(Math.floor(Date.now() / 1000));
      const payload = JSON.stringify({ type: `email.${type}`, data: { email_id: message } });
      const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`)))));
      expect((await worker.fetch(new Request('https://worker.test/api/webhooks/resend', { method: 'POST', headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }, body: payload }), { ...env, RESEND_WEBHOOK_SECRET: `whsec_${secret}` })).status).toBe(200);
    };
    const preview = async () => (await handleAdmin(req('/api/admin/early-access/campaigns/campaign/preview', { subscriberIds: ['subscriber'] }), env, { ...actor }) as any).recipientCount;
    await event('bounced', 'old-message');
    expect(docs.get(`${prefix}${EA.deliveries}/old`).fields.expiresAt.nullValue).toBe(null);
    await event('delivered', 'old-message'); // Never regress durable bounce evidence.
    expect(await preview()).toBe(0);
    await event('failed', 'transient-message');
    await event('bounced', 'test-message');
    expect(docs.get(`${prefix}${EA.deliveries}/transient`).fields.expiresAt.stringValue).toBe(oldExpiry);
    expect(docs.get(`${prefix}${EA.deliveries}/test`).fields.expiresAt.stringValue).toBe(oldExpiry);
    // Simulate deletion of expired metadata; terminal subscriber proof has no TTL.
    for (const [name, record] of docs) {
      const expiry = record.fields.expiresAt;
      if (name.includes(`/${EA.deliveries}/`) && Date.parse(expiry?.timestampValue || expiry?.stringValue || '') < Date.now()) docs.delete(name);
    }
    expect(docs.has(`${prefix}${EA.deliveries}/transient`)).toBe(false);
    expect(docs.has(`${prefix}${EA.deliveries}/old`)).toBe(true);
    expect(await preview()).toBe(0);
    const proof = docs.get(`${prefix}${EA.deliveries}/old`);
    docs.delete(`${prefix}${EA.deliveries}/old`); // Even unexpected removal must not restore eligibility.
    expect(await preview()).toBe(0);
    docs.set(`${prefix}${EA.deliveries}/old`, proof);
    put(EA.deliveries, 'fresh', { subscriberId: 'subscriber', providerMessageId: 'new-message', deliveryStatus: 'accepted' });
    put(EA.subscribers, 'subscriber', { verified: true, consentMarketing: true, status: 'active', deliveryId: 'fresh', language: 'ar', country: 'SA' });
    await event('complained', 'old-message');
    expect(docs.get(`${prefix}${EA.deliveries}/old`).fields.deliveryStatus.stringValue).toBe('complained');
    expect(await preview()).toBe(1);
    expect(docs.get(`${prefix}${EA.deliveries}/fresh`).fields.deliveryStatus.stringValue).toBe('accepted');
  });
  test('inner public/Admin quota errors preserve shared HTTP cooldown and safe storage failures do not leak', async () => {
    __adminTest.setFirestore(() => { throw new QuotaBusyError(37); });
    for (const path of ['/api/early-access/config', '/api/admin/early-access/config']) {
      const response = await worker.fetch(req(path), env), payload = await response.json() as any;
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('37');
      expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
      expect(payload.code).toBe('SERVICE_TEMPORARILY_BUSY');
      expect(payload.retryAfter).toBe(37);
    }
    __adminTest.setFirestore(() => { throw new Error('PRIVATE_BACKEND_TOKEN must never leak'); });
    for (const path of ['/api/early-access/config', '/api/admin/early-access/config']) {
      const response = await worker.fetch(req(path), env), payload = await response.text();
      expect(response.status).toBe(503);
      expect(payload.includes('PRIVATE_BACKEND_TOKEN')).toBe(false);
      expect(payload.includes('EARLY_ACCESS_UNAVAILABLE')).toBe(true);
    }
  });
});