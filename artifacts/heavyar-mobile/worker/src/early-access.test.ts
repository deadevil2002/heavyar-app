import { describe, expect, test } from 'bun:test';
import { EA, EarlyAccessError, eligible, hash, permissions, registration, subscriberFacets, template, type Change, type EarlyAccessStore, type RecordVersion } from './early-access-model';
import { handleEarlyAccessPublic, suppress } from './early-access-public';
import { handleEarlyAccessAdmin, page } from './early-access-admin';
import { dailyEarlyAccessRetention, retainEarlyAccess } from './early-access-retention';

function memoryStore() {
  const docs = new Map<string, NonNullable<RecordVersion>>(), sent: any[] = [], audit: any[] = [], queries: any[] = [];
  let version = 0;
  const put = (collection: string, id: string, data: any) => docs.set(`${collection}/${id}`, { data: structuredClone(data), updateTime: String(++version), name: `projects/demo-early/databases/(default)/documents/${collection}/${id}` });
  const store: EarlyAccessStore = {
    read: async (c, id) => structuredClone(docs.get(`${c}/${id}`) || null),
    save: async (changes, action, target) => {
      for (const c of changes) if (docs.get(`${c.collection}/${c.id}`)?.updateTime !== c.prior?.updateTime) throw new EarlyAccessError('CONCURRENT_UPDATE', 409);
      for (const c of changes) put(c.collection, c.id, c.data);
      if (action) audit.push({ action, target });
    },
    send: async (to, subject, html, key) => { sent.push({ to, subject, html, key }); return { delivered: true, messageId: 'provider-id' }; },
    ownEmail: async () => 'actor@example.com',
    query: async (collection, query) => { queries.push(query); return [...docs.values()].filter(d => d.name!.includes(`/${collection}/`)).slice(0, query.limit); },
  };
  const token = (kind: string) => sent.at(-1)?.html.match(new RegExp(`/${kind}\\?token=([a-f0-9]{64})`))?.[1];
  return { store, docs, sent, audit, put, token, queries };
}
const request = (path: string, value?: unknown, method = value === undefined ? 'GET' : 'POST') => new Request(`https://worker.test${path}`, { method, headers: { 'CF-Connecting-IP': '192.0.2.1', 'Content-Type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
const register = (value: any) => request('/api/early-access/register', value);
const actor = { uid: 'owner', role: 'owner' };
const campaign = { name: 'Launch', subjectAr: 'الوصول المبكر', subjectEn: 'Early access', bodyAr: 'نستعد للإطلاق', bodyEn: 'Preparing for launch' };
async function errorCode(fn: () => Promise<unknown>) { try { await fn(); return ''; } catch (error) { return (error as EarlyAccessError).code; } }
function enabled(m: ReturnType<typeof memoryStore>) { m.put(EA.config, 'default', { enabled: true, revision: 1 }); }

describe('Early Access privacy and races', () => {
  test('OFF by default and config reveals only enabled; no email or mutation while closed', async () => {
    const m = memoryStore();
    expect(JSON.stringify(await handleEarlyAccessPublic(request('/api/early-access/config'), m.store))).toBe('{"enabled":false}');
    expect(await errorCode(() => handleEarlyAccessPublic(register({ email: 'a@example.com', consentMarketing: true }), m.store))).toBe('REGISTRATION_CLOSED');
    expect(m.docs.size).toBe(0); expect(m.sent.length).toBe(0);
  });
  test('validation is strict; defaults are Arabic and optional country; normalized uniqueness', () => {
    expect(registration({ email: ' Person@Example.COM ', consentMarketing: false }).email).toBe('person@example.com');
    expect(registration({ email: 'a@example.com', consentMarketing: false }).language).toBe('ar');
    for (const data of [{ email: 'bad', consentMarketing: true }, { email: 'a@example.com' }, { email: 'a@example.com', consentMarketing: 'true' }, { email: 'a@example.com', consentMarketing: false, country: 'US' }, { email: 'a@example.com', consentMarketing: false, language: 'fr' }]) {
      let rejected = false; try { registration(data); } catch { rejected = true; } expect(rejected).toBe(true);
    }
  });
  test('no-consent registration verifies without marketing; scanner GET is nonconsuming; repeat safe', async () => {
    const m = memoryStore(); enabled(m);
    await handleEarlyAccessPublic(register({ email: ' A@Example.com ', consentMarketing: false }), m.store);
    const id = await hash('early-access-email:a@example.com'), token = m.token('verify');
    const html = await handleEarlyAccessPublic(request(`/api/early-access/verify?token=${token}`), m.store) as Response;
    expect(html.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(m.docs.get(`${EA.subscribers}/${id}`)!.data.verified).toBe(false);
    await handleEarlyAccessPublic(request(`/api/early-access/verify?token=${token}`, {}), m.store);
    const sub = m.docs.get(`${EA.subscribers}/${id}`)!;
    expect(sub.data.verified).toBe(true); expect(sub.data.consentMarketing).toBe(false); expect(sub.data.consentAt).toBe(null);
    expect(eligible(sub, null)).toBe('no_consent');
    const before = JSON.stringify(sub.data);
    await handleEarlyAccessPublic(register({ email: 'A@example.COM', consentMarketing: true }), m.store);
    expect(JSON.stringify(m.docs.get(`${EA.subscribers}/${id}`)!.data)).toBe(before); expect(m.sent.length).toBe(1);
    expect((await handleEarlyAccessPublic(request(`/api/early-access/verify?token=${token}`, {}), m.store) as any).success).toBe(true);
    expect(JSON.stringify([...m.docs.values()]).includes(token)).toBe(false);
  });
  test('resubscription needs fresh consent AND new proof; unsubscribe invalidates pending proof', async () => {
    const m = memoryStore(); enabled(m);
    await handleEarlyAccessPublic(register({ email: 'a@example.com', consentMarketing: true }), m.store);
    const id = await hash('early-access-email:a@example.com'), old = m.token('verify'), unsubscribe = m.token('unsubscribe');
    await handleEarlyAccessPublic(request(`/api/early-access/verify?token=${old}`, { consentMarketing: true }), m.store);
    await handleEarlyAccessPublic(request(`/api/early-access/unsubscribe?token=${unsubscribe}`, {}), m.store);
    const record = m.docs.get(`${EA.subscribers}/${id}`)!;
    m.put(EA.subscribers, id, { ...record.data, nextEmailAt: '2000-01-01' });
    await handleEarlyAccessPublic(register({ email: 'a@example.com', consentMarketing: false }), m.store);
    expect(m.sent.length).toBe(1);
    await handleEarlyAccessPublic(register({ email: 'a@example.com', consentMarketing: true }), m.store);
    expect(m.docs.get(`${EA.subscribers}/${id}`)!.data.status).toBe('unsubscribed');
    const fresh = m.token('verify');
    await handleEarlyAccessPublic(request(`/api/early-access/verify?token=${fresh}`, { consentMarketing: true }), m.store);
    expect(m.docs.get(`${EA.subscribers}/${id}`)!.data.consentMarketing).toBe(true);
    expect(m.docs.get(`${EA.suppression}/${id}`)!.data.suppressed).toBe(false);
    expect(m.audit.some(a => a.action === 'early_access_verified_consent')).toBe(true);
    await handleEarlyAccessPublic(request(`/api/early-access/unsubscribe?token=${unsubscribe}`, {}), m.store);
    expect(m.docs.get(`${EA.subscribers}/${id}`)!.data.consentMarketing).toBe(false);
  });
  test('concurrent config disable atomically aborts all registration and email', async () => {
    const m = memoryStore(); enabled(m);
    const save = m.store.save;
    m.store.save = async (changes, ...args) => {
      if (changes.some(c => c.collection === EA.subscribers)) m.put(EA.config, 'default', { enabled: false, revision: 2 });
      return save(changes, ...args);
    };
    expect(await errorCode(() => handleEarlyAccessPublic(register({ email: 'a@example.com', consentMarketing: true }), m.store))).toBe('CONCURRENT_UPDATE');
    expect([...m.docs.keys()].some(k => k.startsWith(EA.subscribers))).toBe(false); expect(m.sent.length).toBe(0);
  });
  test('CAS reserves normalized uniqueness even when requests race', async () => {
    const m = memoryStore(); enabled(m);
    const results = await Promise.allSettled([handleEarlyAccessPublic(register({ email: 'a@example.com', consentMarketing: true }), m.store), handleEarlyAccessPublic(register({ email: 'A@EXAMPLE.COM', consentMarketing: true }), m.store)]);
    expect(results.filter(r => r.status === 'fulfilled').length).toBe(1);
    expect([...m.docs.keys()].filter(k => k.startsWith(`${EA.subscribers}/`)).length).toBe(1); expect(m.sent.length).toBe(1);
  });
  test('IP cap and email cooldown; bounded payload; no claimed source fields', async () => {
    const m = memoryStore(); enabled(m);
    for (let i = 0; i < 10; i++) await handleEarlyAccessPublic(register({ email: 'a@example.com', consentMarketing: true }), m.store);
    expect(m.sent.length).toBe(1);
    expect(await errorCode(() => handleEarlyAccessPublic(register({ email: 'b@example.com', consentMarketing: true }), m.store))).toBe('RATE_LIMITED');
    expect(await errorCode(() => handleEarlyAccessPublic(register({ email: 'a@example.com', consentMarketing: true, source: 'trusted-admin' }), m.store))).toBe('INVALID_FIELDS');
    expect(await errorCode(() => handleEarlyAccessPublic(register({ email: 'a'.repeat(25000), consentMarketing: true }), m.store))).toBe('PAYLOAD_TOO_LARGE');
  });
  test('anonymization removes pending and current PII, keeps only hashed suppression', async () => {
    const m = memoryStore(); enabled(m);
    await handleEarlyAccessPublic(register({ email: 'secret@example.com', name: 'Private Person', consentMarketing: true }), m.store);
    const id = await hash('early-access-email:secret@example.com'), token = m.token('verify');
    await suppress(m.store, id, true, 'early_access_admin_anonymize');
    expect(JSON.stringify([...m.docs.values()]).includes('secret@example.com')).toBe(false);
    expect(JSON.stringify([...m.docs.values()]).includes('Private Person')).toBe(false);
    expect(m.docs.get(`${EA.suppression}/${id}`)!.data.suppressed).toBe(true);
    expect(await errorCode(() => handleEarlyAccessPublic(request(`/api/early-access/verify?token=${token}`, {}), m.store))).toBe('LINK_EXPIRED');
  });
  test('email holder must separately opt in, including form POST; no implicit consent from attacker', async () => {
    const m = memoryStore(); enabled(m);
    await handleEarlyAccessPublic(register({ email: 'a@example.com', consentMarketing: true }), m.store);
    const token = m.token('verify'), id = await hash('early-access-email:a@example.com');
    const html = await handleEarlyAccessPublic(request(`/api/early-access/verify?token=${token}`), m.store) as Response;
    expect(/<input[^>]*\schecked(?:\s|=|>)/.test(await html.text())).toBe(false);
    await handleEarlyAccessPublic(new Request(`https://worker.test/api/early-access/verify?token=${token}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '' }), m.store);
    expect(m.docs.get(`${EA.subscribers}/${id}`)!.data.consentMarketing).toBe(false);
    const before = JSON.stringify(m.docs.get(`${EA.subscribers}/${id}`));
    await handleEarlyAccessPublic(request(`/api/early-access/unsubscribe?token=${m.token('unsubscribe')}`), m.store);
    expect(JSON.stringify(m.docs.get(`${EA.subscribers}/${id}`))).toBe(before);
  });
  test('retention reads one page of twenty and rechecks fresh state', async () => {
    const m = memoryStore();
    m.put(EA.subscribers, 'old', { email: 'old@example.com', createdAt: '2020-01-01', retentionAt: '2021-01-01' });
    await retainEarlyAccess(m.store);
    expect(m.queries.length).toBe(1); expect(m.queries[0].limit).toBe(20);
    expect(m.docs.get(`${EA.subscribers}/old`)!.data.status).toBe('anonymized');
  });
  test('retention does zero daytime IO and only one daily leased query across racing isolates', async () => {
    const m = memoryStore();
    await dailyEarlyAccessRetention(m.store, Date.parse('2030-01-01T12:00:00Z'));
    expect(m.docs.size).toBe(0); expect(m.queries.length).toBe(0);
    await Promise.all([dailyEarlyAccessRetention(m.store, Date.parse('2030-01-01T00:05:00Z')), dailyEarlyAccessRetention(m.store, Date.parse('2030-01-01T00:05:00Z'))]);
    expect(m.queries.length).toBe(1);
    await dailyEarlyAccessRetention(m.store, Date.parse('2030-01-01T00:10:00Z'));
    expect(m.queries.length).toBe(1);
  });
});

describe('Early Access privileged campaign foundation', () => {
  test('least privilege matrix and backend toggle revision', async () => {
    for (const role of ['owner', 'super_admin']) expect(permissions(role).configure).toBe(true);
    expect(permissions('marketing').testSend).toBe(true); expect(permissions('marketing').approve).toBe(false);
    for (const role of ['admin', 'auditor']) { expect(permissions(role).read).toBe(true); expect(permissions(role).manage).toBe(false); }
    for (const role of ['support', 'provider', undefined]) expect(permissions(role).read).toBe(false);
    const m = memoryStore();
    const result: any = await handleEarlyAccessAdmin(request('/api/admin/early-access/config', { enabled: true, revision: 0 }, 'PATCH'), m.store, actor);
    expect(result.config.revision).toBe(1);
    expect(await errorCode(() => handleEarlyAccessAdmin(request('/api/admin/early-access/config', { enabled: false, revision: 0 }, 'PATCH'), m.store, actor))).toBe('CONFIG_CONFLICT');
    expect(await errorCode(() => handleEarlyAccessAdmin(request('/api/admin/early-access/config', { enabled: false, revision: 1 }, 'PATCH'), m.store, { uid: 'm', role: 'marketing' }))).toBe('FORBIDDEN');
  });
  test('preview explicit audience, exclusions, language/country, escaped templates and safe own-email test idempotency', async () => {
    const m = memoryStore();
    const base = { status: 'active', consentMarketing: true, verified: true, country: 'SA', language: 'ar' };
    m.put(EA.subscribers, 'yes', base); m.put(EA.subscribers, 'no', { ...base, consentMarketing: false });
    m.put(EA.subscribers, 'optout', { ...base, status: 'unsubscribed' }); m.put(EA.subscribers, 'en', { ...base, language: 'en' });
    const created: any = await handleEarlyAccessAdmin(request('/api/admin/early-access/campaigns', campaign), m.store, actor);
    const prefix = `/api/admin/early-access/campaigns/${created.campaign.id}`;
    const preview: any = await handleEarlyAccessAdmin(request(`${prefix}/preview`, { subscriberIds: ['yes', 'no', 'optout', 'en'], language: 'ar', country: 'SA' }), m.store, actor);
    expect(preview.recipientCount).toBe(1); expect(preview.excludedCount).toBe(3); expect(preview.byCountry.SA).toBe(1); expect(preview.exclusionReasons.no_consent).toBe(1);
    expect(m.queries.length).toBe(0);
    const testBody = { previewId: preview.previewId, idempotencyKey: 'unique-request', confirm: true, language: 'ar' };
    await handleEarlyAccessAdmin(request(`${prefix}/test`, testBody), m.store, actor);
    await handleEarlyAccessAdmin(request(`${prefix}/test`, testBody), m.store, actor);
    expect(m.sent.length).toBe(1); expect(m.sent[0].to).toBe('actor@example.com');
    expect(await errorCode(() => handleEarlyAccessAdmin(request(`${prefix}/test`, { ...testBody, to: 'victim@example.com' }), m.store, actor))).toBe('INVALID_FIELDS');
    await handleEarlyAccessAdmin(request(`${prefix}/approve`, { previewId: preview.previewId, confirm: true }), m.store, actor);
    expect(await errorCode(() => handleEarlyAccessAdmin(request(`${prefix}/send`, { confirm: true }), m.store, actor))).toBe('PRODUCTION_SEND_DEFERRED');
    expect(template('<script>', '<img src=x onerror=alert(1)>', 'ar').includes('<img')).toBe(false);
    expect(await errorCode(() => handleEarlyAccessAdmin(request(`${prefix}/preview`, { subscriberIds: Array(101).fill('yes') }), m.store, actor))).toBe('INVALID_SELECTION');
    await handleEarlyAccessAdmin(request(prefix, campaign, 'PATCH'), m.store, actor);
    expect(await errorCode(() => handleEarlyAccessAdmin(request(`${prefix}/approve`, { previewId: preview.previewId, confirm: true }), m.store, actor))).toBe('PREVIEW_EXPIRED');
  });
  test('indexed facets and prefix only query one lookahead page; private fields never exposed', async () => {
    const m = memoryStore();
    for (let i = 0; i < 21; i++) m.put(EA.subscribers, `s${i}`, { normalizedEmail: `a${i}@example.com`, email: `a${i}@example.com`, verified: true, status: 'active', pending: { email: 'hidden' }, generation: 'hidden', country: 'SA' });
    const result = await page(m.store, EA.subscribers, new URL('https://worker.test/?q=a&country=SA&verified=true'));
    expect(result.items.length).toBe(20); expect(Boolean(result.nextCursor)).toBe(true);
    expect(JSON.stringify(result.items).includes('hidden')).toBe(false);
    expect(m.queries[0].limit).toBe(21);
    expect(JSON.stringify(m.queries[0]).includes('ARRAY_CONTAINS')).toBe(true);
    expect(subscriberFacets({ status: 'active' }).length).toBe(31);
    expect(await errorCode(() => page(m.store, EA.subscribers, new URL(`https://worker.test/?q=b&cursor=${result.nextCursor}`)))).toBe('INVALID_CURSOR');
  });
  test('approval rejects no-test, failed-test, zero recipients, and nonmatching previews', async () => {
    const m = memoryStore();
    m.put(EA.campaigns, 'campaign', { ...campaign, revision: 1 });
    m.put(EA.previews, 'preview', { campaignId: 'campaign', campaignRevision: 1, actorUid: actor.uid, expiresAt: '2099-01-01', recipientCount: 1 });
    const approve = () => handleEarlyAccessAdmin(request('/api/admin/early-access/campaigns/campaign/approve', { previewId: 'preview', confirm: true }), m.store, actor);
    expect(await errorCode(approve)).toBe('SUCCESSFUL_TEST_REQUIRED');
    m.put(EA.previews, 'preview', { ...m.docs.get(`${EA.previews}/preview`)!.data, testDeliveryId: 'test' });
    m.put(EA.deliveries, 'test', { previewId: 'preview', campaignRevision: 1, actorUid: actor.uid, deliveryStatus: 'failed' });
    expect(await errorCode(approve)).toBe('SUCCESSFUL_TEST_REQUIRED');
    m.put(EA.deliveries, 'test', { previewId: 'preview', campaignRevision: 1, actorUid: actor.uid, deliveryStatus: 'accepted' });
    m.put(EA.previews, 'preview', { ...m.docs.get(`${EA.previews}/preview`)!.data, recipientCount: 0 });
    expect(await errorCode(approve)).toBe('SUCCESSFUL_TEST_REQUIRED');
  });
});