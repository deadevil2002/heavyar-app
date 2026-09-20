import { describe, expect, test } from 'bun:test';
import { EA, EarlyAccessError, eligible, hash, permissions, registration, renderCampaign, subscriberFacets, template, type Change, type EarlyAccessStore, type RecordVersion } from './early-access-model';
import { handleEarlyAccessPublic, suppress } from './early-access-public';
import { handleEarlyAccessAdmin, page } from './early-access-admin';
import { dailyEarlyAccessRetention, retainEarlyAccess } from './early-access-retention';
import { campaignDeliveryStatuses, campaignProgress, campaignRecipients, parseCampaignCsv, processEarlyAccessCampaigns, queueCampaign, retryCampaignRecipients, snapshotCampaignRecipients } from './early-access-campaign-delivery';

function memoryStore() {
  const docs = new Map<string, NonNullable<RecordVersion>>(), sent: any[] = [], audit: any[] = [], queries: any[] = [];
  let version = 0, ownEmail = 'actor@example.com';
  const put = (collection: string, id: string, data: any) => docs.set(`${collection}/${id}`, { data: structuredClone(data), updateTime: String(++version), name: `projects/demo-early/databases/(default)/documents/${collection}/${id}` });
    const store: EarlyAccessStore = {
    read: async (c, id) => structuredClone(docs.get(`${c}/${id}`) || null),
    save: async (changes, action, target) => {
      for (const c of changes) if (docs.get(`${c.collection}/${c.id}`)?.updateTime !== c.prior?.updateTime) throw new EarlyAccessError('CONCURRENT_UPDATE', 409);
      for (const c of changes) put(c.collection, c.id, c.data);
      if (action) audit.push({ action, target });
    },
    send: async (to, subject, html, key, text) => { sent.push({ to, subject, html, key, text }); return { delivered: true, messageId: 'provider-id' }; },
    ownEmail: async () => ownEmail,
    query: async (collection, query) => {
      queries.push(query);
      let rows = [...docs.values()].filter(d => d.name!.includes(`/${collection}/`));
      const filter = query.where?.fieldFilter;
      if (filter) rows = rows.filter(row => {
        const actual = row.data[filter.field.fieldPath], expected = filter.value.stringValue || filter.value.timestampValue;
        return filter.op === 'EQUAL' ? String(actual) === String(expected) : filter.op === 'LESS_THAN_OR_EQUAL' ? String(actual) <= String(expected) : filter.op === 'LESS_THAN' ? String(actual) < String(expected) : String(actual) >= String(expected);
      });
      if (query.startAt?.values) {
        const values = query.startAt.values;
        if (values.length === 1) rows = rows.filter(row => row.name! > values[0].referenceValue);
        else {
          const [createdAt, reference] = values;
          rows = rows.filter(row => row.data.createdAt > createdAt.timestampValue || row.data.createdAt === createdAt.timestampValue && row.name! > reference.referenceValue);
        }
      }
      return rows.sort((a, b) => query.orderBy?.[0]?.field?.fieldPath === '__name__' ? a.name!.localeCompare(b.name!) : (a.data.createdAt || '').localeCompare(b.data.createdAt || '') || a.name!.localeCompare(b.name!)).slice(0, query.limit);
    },
  };
  const token = (kind: string) => sent.at(-1)?.html.match(new RegExp(`/${kind}\\?token=([a-f0-9]{64})`))?.[1];
  return { store, docs, sent, audit, put, token, queries, setOwnEmail: (email: string) => { ownEmail = email; } };
}
const request = (path: string, value?: unknown, method = value === undefined ? 'GET' : 'POST') => new Request(`https://worker.test${path}`, { method, headers: { 'CF-Connecting-IP': '192.0.2.1', 'Content-Type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
const register = (value: any) => request('/api/early-access/register', value);
const actor = { uid: 'owner', role: 'owner' };
const campaign = { name: 'Launch', subjectAr: 'الوصول المبكر', subjectEn: 'Early access', bodyAr: 'نستعد للإطلاق', bodyEn: 'Preparing for launch' };
async function errorCode(fn: () => Promise<unknown>) { try { await fn(); return ''; } catch (error) { return (error as EarlyAccessError).code; } }
function enabled(m: ReturnType<typeof memoryStore>) { m.put(EA.config, 'default', { enabled: true, revision: 1 }); }

describe('Early Access privacy and races', () => {
  test('campaign renderer personalizes safely with neutral fallbacks and equivalent plain text', () => {
    const rendered = renderCampaign('Hello {{name}} at {{business_name}}', 'Welcome {{name}} <script>alert(1)</script>', 'en', { name: '<Ana>', business_name: '' }, 'https://heavyar.com/unsubscribe?x=1');
    expect(rendered.subject).toBe('Hello <Ana> at your business');
    expect(rendered.html).toContain('dir="ltr"');
    expect(rendered.html).toContain('Hello &lt;Ana&gt; at your business');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('display:none');
    expect(rendered.html).toContain('https://heavyar.com');
    expect(rendered.html).toContain('Unsubscribe');
    expect(rendered.text).toContain('Welcome <Ana> <script>alert(1)</script>');
    expect(rendered.text).toContain('https://heavyar.com/unsubscribe?x=1');
    const arabic = renderCampaign('{{name}}', '{{business_name}}', 'ar');
    expect(arabic.html).toContain('dir="rtl"');
    expect(arabic.html).not.toContain('{{');
    expect(arabic.text).toContain('عميلنا العزيز');
  });

  test('CSV preview bounds rows, normalizes email, rejects duplicates, and neutralizes formulas', () => {
    const result = parseCampaignCsv('email,business_name\nA@Example.com,=SUM(1+1)\na@example.com,Duplicate\nbad,No email\n,Missing');
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].email).toBe('a@example.com');
    expect(result.contacts[0].businessName).toBe("'=SUM(1+1)");
    expect(result.rejected.map(row => row.reason)).toEqual(['duplicate_file', 'invalid_email', 'missing_email']);
    expect(result.counts).toEqual({ validEmail: 1, missingEmail: 1, invalidEmail: 1, duplicateFile: 1 });
  });

  test('campaign snapshot is idempotent and applies canonical suppression to CSV contacts', async () => {
    const m = memoryStore();
    const campaignId = 'campaign-1', suppressionId = await hash('early-access-email:csv@example.com');
    m.put(EA.campaigns, campaignId, { status: 'draft' });
    m.put(EA.suppression, suppressionId, { suppressed: true });
    const result = await snapshotCampaignRecipients(m.store, campaignId, 'owner', [{ email: 'CSV@Example.com', businessName: 'CSV lead', language: 'en' }], 'csv_import');
    expect(result.added).toBe(1);
    const recipient = [...m.docs.values()].find(row => row.data.campaignId === campaignId)!;
    expect(recipient.data.deliveryStatus).toBe('suppressed');
    expect((await snapshotCampaignRecipients(m.store, campaignId, 'owner', [{ email: 'csv@example.com' }], 'csv_import')).duplicate).toBe(1);
  });

  test('Admin CSV flow previews before import and records csv_import source', async () => {
    const m = memoryStore();
    m.put(EA.campaigns, 'campaign-1', { status: 'draft', revision: 1 });
    const path = '/api/admin/early-access/campaigns/campaign-1/import';
    const preview: any = await handleEarlyAccessAdmin(request(path, { csv: 'email,business_name\nlead@example.com,Lead', filename: 'leads.csv' }), m.store, actor);
    expect(preview.preview.contacts).toHaveLength(1);
    expect(m.docs.has(`${EA.imports}/${preview.importId}`)).toBe(false);
    const imported: any = await handleEarlyAccessAdmin(request(path, { csv: 'email,business_name\nlead@example.com,Lead', filename: 'leads.csv', confirm: true, lawfulBasisConfirmed: true }), m.store, actor);
    expect(imported.snapshot.added).toBe(1);
    expect(m.docs.get(`${EA.imports}/${imported.importId}`)!.data.source).toBe('csv_import');
    expect(m.docs.get(`${EA.deliveries}/${imported.snapshot.recipientIds[0]}`)!.data.deliveryStatus).toBe('not_sent');
    expect(await errorCode(() => handleEarlyAccessAdmin(request(path, { csv: 'email\nother@example.com', confirm: true }), m.store, actor))).toBe('LAWFUL_BASIS_REQUIRED');
  });

  test('final queue is exact-selection only and subscriber eligibility is rechecked at queue time', async () => {
    const m = memoryStore(), campaignId = 'selected-campaign';
    m.put(EA.campaigns, campaignId, { status: 'approved', previewId: 'preview-1', subjectAr: 'عرض', subjectEn: 'Offer', bodyAr: 'نص', bodyEn: 'Body' });
    m.put(EA.deliveries, 'selected', { campaignId, source: 'csv_import', lawfulBasisConfirmed: true, email: 'selected@example.com', deliveryStatus: 'not_sent' });
    m.put(EA.deliveries, 'unselected', { campaignId, source: 'csv_import', lawfulBasisConfirmed: true, email: 'unselected@example.com', deliveryStatus: 'not_sent' });
    const queued = await queueCampaign(m.store, campaignId, 'owner', 'preview-1', ['selected']);
    expect(queued.queued).toBe(1);
    expect(m.docs.get(`${EA.deliveries}/selected`)!.data.deliveryStatus).toBe('queued');
    expect(m.docs.get(`${EA.deliveries}/unselected`)!.data.deliveryStatus).toBe('not_sent');
    m.put(EA.campaigns, campaignId, { status: 'approved', previewId: 'preview-1', subjectAr: 'عرض', subjectEn: 'Offer', bodyAr: 'نص', bodyEn: 'Body' });
    m.put(EA.deliveries, 'lawful-missing', { campaignId, source: 'csv_import', email: 'missing-lawful@example.com', deliveryStatus: 'not_sent', lawfulBasisConfirmed: false });
    expect(await errorCode(() => queueCampaign(m.store, campaignId, 'owner', 'preview-1', ['lawful-missing']))).toBe('LAWFUL_BASIS_REQUIRED');
    m.put(EA.campaigns, campaignId, { status: 'approved', previewId: 'preview-1', subjectAr: 'عرض', subjectEn: 'Offer', bodyAr: 'نص', bodyEn: 'Body' });
    m.put(EA.subscribers, 'subscriber', { email: 'subscriber@example.com', status: 'active', verified: true, consentMarketing: true, language: 'en', country: 'SA', deliveryStatus: 'not_sent' });
    const snap = await snapshotCampaignRecipients(m.store, campaignId, 'owner', [{ id: 'subscriber', email: 'subscriber@example.com', status: 'active', verified: true, consentMarketing: true, language: 'en', country: 'SA' }], 'subscriber');
    expect(snap.added).toBe(1);
    const subscriberRecipient = m.docs.get(`${EA.deliveries}/${snap.recipientIds[0]}`)!;
    m.put(EA.subscribers, 'subscriber', { email: 'subscriber@example.com', status: 'unsubscribed', verified: true, consentMarketing: false, language: 'en', country: 'SA', deliveryStatus: 'not_sent' });
    const blocked = await queueCampaign(m.store, campaignId, 'owner', 'preview-1', [snap.recipientIds[0]]).catch(error => error);
    expect((blocked as EarlyAccessError).code).toBe('EMPTY_AUDIENCE');
    expect(subscriberRecipient.data.deliveryStatus).toBe('not_sent');
  });

  test('scheduler marks accepted, adds signed unsubscribe, and does not resend delivered rows', async () => {
    const m = memoryStore();
    m.put(EA.campaigns, 'campaign-1', { status: 'queued', subjectAr: 'عرض', subjectEn: 'Offer', bodyAr: 'نص', bodyEn: 'Body' });
    m.put(EA.deliveries, 'recipient-1', { campaignId: 'campaign-1', email: 'lead@example.com', language: 'en', deliveryStatus: 'queued', attempts: 0 });
    expect((await processEarlyAccessCampaigns(m.store, m.store.send)).processed).toBe(1);
    const recipient = m.docs.get(`${EA.deliveries}/recipient-1`)!;
    expect(recipient.data.deliveryStatus).toBe('accepted');
    expect(recipient.data.acceptedAt).toBeString();
    expect(m.docs.get(`${EA.campaigns}/campaign-1`)!.data.status).toBe('sent');
    expect(m.sent[0].html).toContain('unsubscribe?token=');
    recipient.data.deliveryStatus = 'delivered'; m.put(EA.deliveries, 'recipient-1', recipient.data);
    expect((await processEarlyAccessCampaigns(m.store, m.store.send)).processed).toBe(0);
  });

  test('opaque campaign unsubscribe is canonical, idempotent, tamper-safe, and blocks future campaign selection', async () => {
    const m = memoryStore(), email = 'lead@example.com';
    m.put(EA.campaigns, 'sent-campaign', { status: 'queued', subjectAr: 'عرض', subjectEn: 'Offer', bodyAr: 'نص', bodyEn: 'Body' });
    m.put(EA.deliveries, 'sent-recipient', { campaignId: 'sent-campaign', email, normalizedEmail: email, language: 'en', source: 'csv_import', deliveryStatus: 'queued', attempts: 0 });
    await processEarlyAccessCampaigns(m.store, m.store.send);
    const token = m.token('unsubscribe');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify([...m.docs.values()])).not.toContain(token!);
    expect(m.docs.get(`${EA.tokens}/${await hash(token!)}`)!.data.kind).toBe('campaign_unsubscribe');

    await handleEarlyAccessPublic(request(`/api/early-access/unsubscribe?token=${token}`, {}), m.store);
    const suppressionId = await hash(`early-access-email:${email}`);
    expect(m.docs.get(`${EA.suppression}/${suppressionId}`)!.data.suppressed).toBe(true);
    expect(m.docs.get(`${EA.deliveries}/sent-recipient`)!.data).toMatchObject({
      deliveryStatus: 'suppressed',
      suppressionReason: 'unsubscribe',
      retryEligible: false,
    });

    m.put(EA.campaigns, 'future-campaign', { status: 'draft' });
    const future = await snapshotCampaignRecipients(m.store, 'future-campaign', actor.uid, [{ email, lawfulBasisConfirmed: true }], 'csv_import');
    expect(m.docs.get(`${EA.deliveries}/${future.recipientIds[0]}`)!.data).toMatchObject({
      deliveryStatus: 'suppressed',
      suppressionReason: 'global_suppression',
    });
    m.put(EA.campaigns, 'future-campaign', { status: 'approved', previewId: 'future-preview' });
    expect(await errorCode(() => queueCampaign(m.store, 'future-campaign', actor.uid, 'future-preview', future.recipientIds))).toBe('EMPTY_AUDIENCE');

    const deliveryAfterFirstPost = structuredClone(m.docs.get(`${EA.deliveries}/sent-recipient`));
    const suppressionAfterFirstPost = structuredClone(m.docs.get(`${EA.suppression}/${suppressionId}`));
    const progressAfterFirstPost = await campaignProgress(m.store, 'sent-campaign');
    const auditCountAfterFirstPost = m.audit.length;
    await handleEarlyAccessPublic(request(`/api/early-access/unsubscribe?token=${token}`, {}), m.store);
    expect(m.docs.get(`${EA.deliveries}/sent-recipient`)).toEqual(deliveryAfterFirstPost);
    expect(m.docs.get(`${EA.suppression}/${suppressionId}`)).toEqual(suppressionAfterFirstPost);
    expect(await campaignProgress(m.store, 'sent-campaign')).toEqual(progressAfterFirstPost);
    expect(m.audit).toHaveLength(auditCountAfterFirstPost);

    const modifiedToken = `${token!.slice(0, -1)}${token!.endsWith('0') ? '1' : '0'}`;
    expect(await errorCode(() => handleEarlyAccessPublic(request(`/api/early-access/unsubscribe?token=${modifiedToken}`, {}), m.store))).toBe('LINK_EXPIRED');
    expect(m.docs.get(`${EA.deliveries}/sent-recipient`)).toEqual(deliveryAfterFirstPost);
    expect(m.docs.get(`${EA.suppression}/${suppressionId}`)).toEqual(suppressionAfterFirstPost);
    expect(await campaignProgress(m.store, 'sent-campaign')).toEqual(progressAfterFirstPost);
    expect(m.audit).toHaveLength(auditCountAfterFirstPost);
  });

  test('scheduler sends at most 50 per tick and resumes without premature completion', async () => {
    const m = memoryStore();
    m.put(EA.campaigns, 'batch-campaign', { status: 'queued', subjectAr: 'عرض', subjectEn: 'Offer', bodyAr: 'نص', bodyEn: 'Body' });
    for (let i = 0; i < 60; i++) m.put(EA.deliveries, `batch-${i}`, { campaignId: 'batch-campaign', email: `batch-${i}@example.com`, language: 'en', deliveryStatus: 'queued', attempts: 0, createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z` });
    expect((await processEarlyAccessCampaigns(m.store, m.store.send)).processed).toBe(50);
    expect(m.sent).toHaveLength(50);
    expect(m.docs.get(`${EA.campaigns}/batch-campaign`)!.data.status).toBe('queued');
    expect((await processEarlyAccessCampaigns(m.store, m.store.send)).processed).toBe(10);
    expect(m.docs.get(`${EA.campaigns}/batch-campaign`)!.data.status).toBe('sent');
  });

  test('progress remaining counts only immutable final selection, not unselected audience', async () => {
    const m = memoryStore();
    m.put(EA.campaigns, 'progress-campaign', { status: 'sent', finalRecipientIds: ['selected'], finalRecipientCount: 1, sendStartedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:01:00.000Z' });
    m.put(EA.deliveries, 'selected', { campaignId: 'progress-campaign', deliveryStatus: 'delivered' });
    m.put(EA.deliveries, 'unselected', { campaignId: 'progress-campaign', deliveryStatus: 'not_sent' });
    const progress = await campaignProgress(m.store, 'progress-campaign');
    expect(progress.audience).toBe(2);
    expect(progress.notSent).toBe(1);
    expect(progress.selected).toBe(1);
    expect(progress.remaining).toBe(0);
  });

  test('select-all filtered preview and recipient status filters stay campaign-scoped and paginated', async () => {
    const m = memoryStore(), campaignId = 'filter-campaign';
    m.put(EA.campaigns, campaignId, { status: 'draft', revision: 1, subjectAr: 'عرض', subjectEn: 'Offer', bodyAr: 'نص', bodyEn: 'Body' });
    m.put(EA.deliveries, 'ar-one', { campaignId, source: 'csv_import', country: 'SA', language: 'ar', deliveryStatus: 'not_sent', email: 'ar@example.com' });
    m.put(EA.deliveries, 'en-two', { campaignId, source: 'csv_import', country: 'SA', language: 'en', deliveryStatus: 'not_sent', email: 'en@example.com' });
    m.put(EA.deliveries, 'other', { campaignId: 'other', source: 'csv_import', country: 'SA', language: 'ar', deliveryStatus: 'not_sent' });
    const preview: any = await handleEarlyAccessAdmin(request(`/api/admin/early-access/campaigns/${campaignId}/preview`, { selectAllRecipients: true, recipientFilters: { source: 'csv_import', language: 'ar' } }), m.store, actor);
    expect(preview.recipientCount).toBe(1);
    expect(m.docs.get(`${EA.previews}/${preview.previewId}`)!.data.recipientIds).toEqual(['ar-one']);
    const page = await campaignRecipients(m.store, campaignId, 1, undefined, { source: 'csv_import', language: 'ar' });
    expect(page.items.map(item => item.id)).toEqual(['ar-one']);
  });

  test('admin recipient GET ignores empty filters and maps every status plus source, country and language', async () => {
    const m = memoryStore(), campaignId = 'recipient-api';
    m.put(EA.campaigns, campaignId, { status: 'draft', revision: 1 });
    for (const [index, status] of campaignDeliveryStatuses.entries()) {
      m.put(EA.deliveries, `status-${status}`, {
        campaignId, deliveryStatus: status, source: index % 2 ? 'csv_import' : 'subscriber',
        country: index % 2 ? 'AE' : 'SA', language: index % 2 ? 'en' : 'ar',
        email: `${status}@example.com`, createdAt: `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
        ...(status === 'delivered' ? { deliveryEventAt: '2026-09-20T14:20:17.626Z' } : {}),
      });
    }
    m.put(EA.deliveries, 'owner-source', { campaignId, deliveryStatus: 'not_sent', source: 'owner_qa', country: null, language: 'ar', email: 'heavyar.official@gmail.com', createdAt: '2026-01-01T00:01:00.000Z' });
    const endpoint = `/api/admin/early-access/campaigns/${campaignId}/recipients`;
    const all: any = await handleEarlyAccessAdmin(request(endpoint), m.store, actor);
    expect(all.items.length).toBe(campaignDeliveryStatuses.length + 1);
    expect(all.items.find((item: any) => item.id === 'status-delivered').deliveredAt).toBe('2026-09-20T14:20:17.626Z');
    expect(m.docs.get(`${EA.deliveries}/status-delivered`)!.data.deliveredAt).toBe(undefined);
    expect(all.items.find((item: any) => item.id === 'status-accepted').deliveredAt).toBe(null);
    for (const status of campaignDeliveryStatuses) {
      const result: any = await handleEarlyAccessAdmin(request(`${endpoint}?status=${status}`), m.store, actor);
      expect(result.items.some((item: any) => item.deliveryStatus === status)).toBe(true);
      expect(result.items.every((item: any) => item.deliveryStatus === status)).toBe(true);
    }
    for (const source of ['subscriber', 'csv_import', 'owner_qa']) {
      const result: any = await handleEarlyAccessAdmin(request(`${endpoint}?source=${source}`), m.store, actor);
      expect(result.items.length > 0).toBe(true);
      expect(result.items.every((item: any) => item.source === source)).toBe(true);
    }
    for (const [field, expected] of [['country', 'SA'], ['language', 'en']] as const) {
      const result: any = await handleEarlyAccessAdmin(request(`${endpoint}?${field}=${expected}`), m.store, actor);
      expect(result.items.length > 0).toBe(true);
      expect(result.items.every((item: any) => item[field] === expected)).toBe(true);
    }
  });

  test('campaign recipient reads and completion are campaign-scoped, bounded, and cursor-paginated', async () => {
    const m = memoryStore(), base = '2026-01-01T00:00:00.000Z';
    for (let i = 0; i < 501; i++) m.put(EA.deliveries, `other-${i}`, { campaignId: 'other', deliveryStatus: 'queued', createdAt: base });
    for (let i = 0; i < 3; i++) m.put(EA.deliveries, `target-${i}`, { campaignId: 'target', email: `target-${i}@example.com`, deliveryStatus: 'delivered', createdAt: `2026-01-01T00:00:0${i}.000Z` });
    const first = await campaignRecipients(m.store, 'target', 2);
    expect(first.items.map(item => item.id)).toEqual(['target-0', 'target-1']);
    expect(first.nextCursor).toBeString();
    const second = await campaignRecipients(m.store, 'target', 2, first.nextCursor!);
    expect(second.items.map(item => item.id)).toEqual(['target-2']);
    const campaignQuery = m.queries.find(query => query.where?.fieldFilter?.field?.fieldPath === 'campaignId');
    expect(campaignQuery.limit).toBe(501);
    m.put(EA.campaigns, 'target', { status: 'queued', subjectAr: 'عرض', subjectEn: 'Offer', bodyAr: 'نص', bodyEn: 'Body' });
    m.put(EA.deliveries, 'target-0', { campaignId: 'target', email: 'target-0@example.com', language: 'en', deliveryStatus: 'queued', attempts: 0, createdAt: base });
    expect((await processEarlyAccessCampaigns(m.store, m.store.send)).processed).toBe(1);
    expect(m.docs.get(`${EA.deliveries}/target-0`)!.data.deliveryStatus).toBe('accepted');
  });

  test('per-recipient lease prevents overlapping sends and recovers after expiry', async () => {
    const m = memoryStore();
    m.put(EA.campaigns, 'lease-campaign', { status: 'queued', subjectAr: 'عرض', subjectEn: 'Offer', bodyAr: 'نص', bodyEn: 'Body' });
    m.put(EA.deliveries, 'lease-recipient', { campaignId: 'lease-campaign', email: 'lease@example.com', language: 'en', deliveryStatus: 'queued', attempts: 0, createdAt: '2026-01-01T00:00:00.000Z' });
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), sends = [];
    const send = async (...args: any[]) => { sends.push(args); await gate; return { delivered: true, messageId: 'lease-message' }; };
    const first = processEarlyAccessCampaigns(m.store, send, Date.parse('2026-01-01T00:00:00.000Z'));
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = processEarlyAccessCampaigns(m.store, send, Date.parse('2026-01-01T00:00:01.000Z'));
    release();
    await Promise.all([first, second]);
    expect(sends).toHaveLength(1);
    const saved = m.docs.get(`${EA.deliveries}/lease-recipient`)!;
    expect(saved.data.leaseToken).toBe(null);
    expect(saved.data.lastAttemptAt).toBeString();
    m.put(EA.deliveries, 'lease-recipient', { ...saved.data, deliveryStatus: 'failed', retryEligible: true, leaseToken: 'expired', leaseUntil: '2025-12-31T00:00:00.000Z' });
    m.put(EA.campaigns, 'lease-campaign', { ...m.docs.get(`${EA.campaigns}/lease-campaign`)!.data, status: 'queued' });
    await processEarlyAccessCampaigns(m.store, async () => ({ delivered: true, messageId: 'recovered' }), Date.parse('2026-01-01T00:01:00.000Z'));
    expect(m.docs.get(`${EA.deliveries}/lease-recipient`)!.data.providerMessageId).toBe('recovered');
  });

  test('manual retry is owner-only, failed-only, idempotent, and bounded', async () => {
    const m = memoryStore(), campaignId = 'retry-campaign';
    m.put(EA.campaigns, campaignId, { status: 'sent' });
    m.put(EA.deliveries, 'failed', { campaignId, deliveryStatus: 'failed', retryEligible: true });
    m.put(EA.deliveries, 'delivered', { campaignId, deliveryStatus: 'delivered', retryEligible: false });
    m.put(EA.deliveries, 'bounced', { campaignId, deliveryStatus: 'bounced', retryEligible: false });
    m.put(EA.deliveries, 'not-eligible', { campaignId, deliveryStatus: 'failed', retryEligible: false });
    const first = await retryCampaignRecipients(m.store, campaignId, 'owner', ['failed', 'delivered', 'bounced', 'not-eligible']);
    expect(first).toEqual({ selected: 4, queued: 1, skipped: 3 });
    expect(m.docs.get(`${EA.deliveries}/delivered`)!.data.deliveryStatus).toBe('delivered');
    const duplicate = await retryCampaignRecipients(m.store, campaignId, 'owner', ['failed']);
    expect(duplicate).toEqual({ selected: 1, queued: 0, skipped: 1 });
    expect(m.audit.filter(item => item.action === 'early_access_campaign_manual_retry')).toHaveLength(2);
    m.put(EA.deliveries, 'route-failed', { campaignId, deliveryStatus: 'failed', retryEligible: true });
    expect(await handleEarlyAccessAdmin(request(`/api/admin/early-access/campaigns/${campaignId}/retry`, { recipientIds: ['route-failed'] }), m.store, actor)).toEqual({ selected: 1, queued: 1, skipped: 0 });
    const denied = await errorCode(() => handleEarlyAccessAdmin(request(`/api/admin/early-access/campaigns/${campaignId}/retry`, { allEligible: true }), m.store, { uid: 'marketing', role: 'marketing' }));
    expect(denied).toBe('FORBIDDEN');
    for (let i = 0; i < 501; i++) m.put(EA.deliveries, `too-many-${i}`, { campaignId, deliveryStatus: 'failed', retryEligible: true });
    expect(await errorCode(() => retryCampaignRecipients(m.store, campaignId, 'owner', undefined, true))).toBe('AUDIENCE_TOO_LARGE');
  });

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
    expect(await errorCode(() => handleEarlyAccessAdmin(request(`${prefix}/send`, { confirm: true }), m.store, actor))).toBe('CONFIRMATION_REQUIRED');
    expect(template('<script>', '<img src=x onerror=alert(1)>', 'ar').includes('<img')).toBe(false);
    expect(await errorCode(() => handleEarlyAccessAdmin(request(`${prefix}/preview`, { subscriberIds: Array(501).fill('yes') }), m.store, actor))).toBe('INVALID_SELECTION');
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
    expect(await errorCode(() => handleEarlyAccessAdmin(request('/api/admin/early-access/campaigns/campaign/approve', { previewId: 'preview', confirm: true, confirmOwnerQa: true }), m.store, actor))).toBe('OWNER_QA_AUDIENCE_MISMATCH');
  });
  test('normal campaign cannot use confirmOwnerQa to bypass its mandatory successful test', async () => {
    const m = memoryStore();
    m.setOwnEmail('heavyar.official@gmail.com');
    m.put(EA.campaigns, 'normal-campaign', { ...campaign, status: 'draft', revision: 1 });
    m.put(EA.deliveries, 'normal-recipient', {
      campaignId: 'normal-campaign',
      email: 'recipient@example.com',
      normalizedEmail: 'recipient@example.com',
      source: 'csv_import',
      deliveryStatus: 'not_sent',
    });
    m.put(EA.previews, 'normal-preview', {
      campaignId: 'normal-campaign',
      campaignRevision: 1,
      actorUid: actor.uid,
      expiresAt: '2099-01-01',
      recipientCount: 1,
      recipientIds: ['normal-recipient'],
    });
    const campaignBefore = structuredClone(m.docs.get(`${EA.campaigns}/normal-campaign`));
    const auditCountBefore = m.audit.length;
    expect(await errorCode(() => handleEarlyAccessAdmin(request('/api/admin/early-access/campaigns/normal-campaign/approve', {
      previewId: 'normal-preview',
      confirm: true,
      confirmOwnerQa: true,
    }), m.store, actor))).toBe('OWNER_QA_AUDIENCE_MISMATCH');
    expect(m.docs.get(`${EA.campaigns}/normal-campaign`)).toEqual(campaignBefore);
    expect(m.audit).toHaveLength(auditCountBefore);
    expect(await errorCode(() => handleEarlyAccessAdmin(request('/api/admin/early-access/campaigns/normal-campaign/approve', {
      previewId: 'normal-preview',
      confirm: true,
    }), m.store, actor))).toBe('SUCCESSFUL_TEST_REQUIRED');
    expect(m.docs.get(`${EA.campaigns}/normal-campaign`)).toEqual(campaignBefore);
    expect(m.audit).toHaveLength(auditCountBefore);
  });
  test('owner QA snapshot requires authoritative exact owner and rejects mixed or suppressed audiences', async () => {
    const path = '/api/admin/early-access/campaigns/owner-qa/owner-qa-snapshot';
    const unauthorized = memoryStore();
    unauthorized.put(EA.campaigns, 'owner-qa', { ...campaign, status: 'draft', revision: 1 });
    unauthorized.setOwnEmail('heavyar.official@gmail.com');
    expect(await errorCode(() => handleEarlyAccessAdmin(request(path, { confirm: true, language: 'ar' }), unauthorized.store, { uid: 'marketing', role: 'marketing' }))).toBe('FORBIDDEN');
    unauthorized.setOwnEmail('other@example.com');
    expect(await errorCode(() => handleEarlyAccessAdmin(request(path, { confirm: true, language: 'ar' }), unauthorized.store, actor))).toBe('FORBIDDEN');

    const mixed = memoryStore();
    mixed.setOwnEmail('heavyar.official@gmail.com');
    mixed.put(EA.campaigns, 'owner-qa', { ...campaign, status: 'draft', revision: 1 });
    mixed.put(EA.deliveries, 'foreign', { campaignId: 'owner-qa', source: 'subscriber', deliveryStatus: 'not_sent' });
    expect(await errorCode(() => handleEarlyAccessAdmin(request(path, { confirm: true, language: 'ar' }), mixed.store, actor))).toBe('OWNER_QA_AUDIENCE_MISMATCH');

    const suppressed = memoryStore();
    suppressed.setOwnEmail('heavyar.official@gmail.com');
    suppressed.put(EA.campaigns, 'owner-qa', { ...campaign, status: 'draft', revision: 1 });
    suppressed.put(EA.suppression, await hash('early-access-email:heavyar.official@gmail.com'), { suppressed: true });
    expect(await errorCode(() => handleEarlyAccessAdmin(request(path, { confirm: true, language: 'ar' }), suppressed.store, actor))).toBe('OWNER_QA_SUPPRESSED');
  });
  test('owner QA bypass queues exactly one immutable owner email and globally prevents repeat attempts', async () => {
    const m = memoryStore();
    m.setOwnEmail('heavyar.official@gmail.com');
    const prepare = async (id: string) => {
      m.put(EA.campaigns, id, { ...campaign, status: 'draft', revision: 1 });
      const prefix = `/api/admin/early-access/campaigns/${id}`;
      const snapshot: any = await handleEarlyAccessAdmin(request(`${prefix}/owner-qa-snapshot`, { confirm: true, language: 'ar' }), m.store, actor);
      const recipientId = m.docs.get(`${EA.campaigns}/${id}`)!.data.ownerQaRecipientId;
      expect(m.docs.get(`${EA.deliveries}/${recipientId}`)!.data).toMatchObject({ email: 'heavyar.official@gmail.com', source: 'owner_qa', deliveryStatus: 'not_sent' });
      await handleEarlyAccessAdmin(request(`${prefix}/approve`, { previewId: snapshot.previewId, confirm: true, confirmOwnerQa: true }), m.store, actor);
      await handleEarlyAccessAdmin(request(`${prefix}/send`, { previewId: snapshot.previewId, confirm: true }), m.store, actor);
      return recipientId;
    };
    const firstRecipient = await prepare('owner-qa-one');
    expect((await processEarlyAccessCampaigns(m.store, m.store.send)).processed).toBe(1);
    expect(m.sent).toHaveLength(1);
    expect(m.sent[0].to).toBe('heavyar.official@gmail.com');
    expect(m.docs.get(`${EA.deliveries}/${firstRecipient}`)!.data.retryEligible).toBe(false);
    expect((await processEarlyAccessCampaigns(m.store, m.store.send)).processed).toBe(0);
    expect(await errorCode(() => handleEarlyAccessAdmin(request('/api/admin/early-access/campaigns/owner-qa-one/owner-qa-snapshot', { confirm: true, language: 'ar' }), m.store, actor))).toBe('OWNER_QA_AUDIENCE_MISMATCH');
    expect(m.audit.some(item => item.action === 'early_access_owner_qa_duplicate_refused' && item.target === 'owner-qa-one')).toBe(true);
    await prepare('owner-qa-two');
    expect((await processEarlyAccessCampaigns(m.store, m.store.send)).processed).toBe(0);
    expect(m.sent).toHaveLength(1);
  });
});