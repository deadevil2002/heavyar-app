import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import worker, { __test, type Env } from './index';

type Stored = { fields: Record<string, any>; updateTime: string; version: number };

const decodeValue = (value: any): any => value?.nullValue === null ? null
  : value?.integerValue !== undefined ? Number(value.integerValue)
    : value?.doubleValue ?? value?.booleanValue ?? value?.stringValue ?? value?.timestampValue
      ?? (value?.arrayValue ? (value.arrayValue.values || []).map(decodeValue) : value?.mapValue ? decodeFields(value.mapValue.fields || {}) : undefined);
const decodeFields = (fields: Record<string, any>) => Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
const encode = (value: any): any => value === null ? { nullValue: null }
  : typeof value === 'boolean' ? { booleanValue: value }
    : typeof value === 'number' ? Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
      : typeof value === 'string' ? (/^\d{4}-\d{2}-\d{2}T/.test(value) ? { timestampValue: value } : { stringValue: value })
        : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
          : { mapValue: { fields: Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key, encode(item)])) } };

function firestoreHarness() {
  const documents = new Map<string, Stored>();
  const transactions = new Map<string, Map<string, number | null>>();
  const queries: any[] = [];
  let transactionSequence = 0, version = 0, beforeCommit: (() => void) | undefined;
  const put = (path: string, value: Record<string, unknown>) => documents.set(path, {
    fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])),
    updateTime: `2026-10-15T00:00:${String(++version).padStart(2, '0')}.000000Z`, version,
  });
  const data = (path: string) => documents.has(path) ? decodeFields(documents.get(path)!.fields) : null;
  const requiredData = (path: string) => {
    const value = data(path);
    if (!value) throw new Error(`Missing fixture document: ${path}`);
    return value;
  };
  const document = (path: string, stored: Stored) => ({ name: `projects/test-project/databases/(default)/documents/${path}`, fields: stored.fields, updateTime: stored.updateTime });
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'rfq-test-token', expires_in: 3600 });
    if (url.includes(':beginTransaction')) { const id = `tx-${++transactionSequence}`; transactions.set(id, new Map()); return Response.json({ transaction: id }); }
    if (url.includes(':rollback')) { transactions.delete(String(JSON.parse(String(init?.body || '{}')).transaction || '')); return Response.json({}); }
    if (url.includes(':batchGet')) {
      const names = JSON.parse(String(init?.body || '{}')).documents || [];
      return Response.json(names.map((name: string) => {
        const path = String(name).split('/documents/')[1] || '', stored = documents.get(path);
        return stored ? { found: document(path, stored) } : { missing: name };
      }));
    }
    if (url.includes(':runQuery')) {
      const query = JSON.parse(String(init?.body || '{}')).structuredQuery || {};
      queries.push(query);
      const collection = String(query.from?.[0]?.collectionId || ''), filter = query.where?.fieldFilter;
      const field = String(filter?.field?.fieldPath || ''), expected = decodeValue(filter?.value), op = String(filter?.op || '');
      const cursor = String(query.startAt?.values?.[0]?.referenceValue || '');
      const matchesFilter = (candidate: any, value: any): boolean => {
        if (!candidate) return true;
        if (candidate.fieldFilter) {
          const fieldPath = String(candidate.fieldFilter.field?.fieldPath || '');
          const actual = value[fieldPath], wanted = decodeValue(candidate.fieldFilter.value);
          return candidate.fieldFilter.op === 'ARRAY_CONTAINS' ? Array.isArray(actual) && actual.includes(wanted) : actual === wanted;
        }
        if (candidate.compositeFilter?.op === 'AND') return (candidate.compositeFilter.filters || []).every((item: any) => matchesFilter(item, value));
        return false;
      };
      const rows = [...documents.entries()].filter(([path, stored]) => {
        if (!path.startsWith(`${collection}/`)) return false;
        const value = decodeFields(stored.fields), actual = value[field];
        return query.where?.compositeFilter ? matchesFilter(query.where, value)
          : !filter ? true : op === 'ARRAY_CONTAINS' ? Array.isArray(actual) && actual.includes(expected) : actual === expected;
      }).map(([path, stored]) => document(path, stored)).filter(item => !cursor || item.name > cursor)
        .sort((left, right) => left.name.localeCompare(right.name)).slice(0, Number(query.limit || 100));
      const selected = Array.isArray(query.select?.fields) ? query.select.fields.map((item: any) => String(item.fieldPath || '')) : null;
      return Response.json(rows.map(item => ({ document: selected ? {
        ...item, fields: Object.fromEntries(Object.entries(item.fields).filter(([key]) => selected.includes(key))),
      } : item })));
    }
    if (url.includes(':commit')) {
      const body = JSON.parse(String(init?.body || '{}')), snapshot = transactions.get(String(body.transaction || ''));
      const writes = Array.isArray(body.writes) ? body.writes : [], hook = beforeCommit; beforeCommit = undefined; hook?.();
      for (const write of writes) {
        const path = String(write.update?.name || write.verify || '').split('/documents/')[1] || '', current = documents.get(path);
        const observed = snapshot?.get(path);
        if (observed !== undefined && observed !== (current?.version ?? null)) return Response.json({ error: { status: 'ABORTED' } }, { status: 409 });
        if (write.currentDocument?.exists === false && current) return Response.json({ error: { status: 'ALREADY_EXISTS' } }, { status: 409 });
        if (write.currentDocument?.updateTime && write.currentDocument.updateTime !== current?.updateTime) return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 409 });
      }
      for (const write of writes) {
        const path = String(write.update?.name || write.verify || '').split('/documents/')[1] || '';
        if (write.verify) continue;
        const current = documents.get(path), fields = write.updateMask ? { ...(current?.fields || {}), ...write.update.fields } : write.update.fields;
        documents.set(path, { fields, updateTime: `2026-10-15T00:01:${String(++version).padStart(2, '0')}.000000Z`, version });
      }
      transactions.delete(String(body.transaction || ''));
      return Response.json({});
    }
    const marker = '/documents/';
    if (url.includes(marker)) {
      const parsed = new URL(url), path = decodeURIComponent(parsed.pathname.split(marker)[1]), stored = documents.get(path);
      const transaction = parsed.searchParams.get('transaction');
      if (transaction) transactions.get(transaction)?.set(path, stored?.version ?? null);
      return stored ? Response.json(document(path, stored)) : new Response('', { status: 404 });
    }
    return new Response('', { status: 404 });
  };
  return { documents, queries, put, data, requiredData, beforeNextCommit(value: () => void) { beforeCommit = value; }, fetch: fetch as typeof globalThis.fetch };
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  FIREBASE_PROJECT_ID: 'test-project', FIREBASE_CLIENT_EMAIL: 'service@test-project.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
} as Env;
const originalFetch = globalThis.fetch;
const customerUid = 'customer-qa-0001', providerA = 'provider-qa-0001', providerB = 'provider-qa-0002';
const profileA = 'operator_profile_0001', profileB = 'operator_profile_0002';
const plusDays = (days: number, hour = 8) => { const date = new Date(Date.now() + days * 86_400_000); date.setUTCHours(hour, 0, 0, 0); return date.toISOString(); };
const requestDraft = {
  contractVersion: 1, serviceKind: 'operator', expiresAt: plusDays(10),
  preparedRequest: {
    clientDraftId: 'draft_qa_0000001', contractVersion: 1, expectedRevision: null, equipmentSkill: 'excavators',
    requestedStartAt: plusDays(4, 5), requestedEndAt: plusDays(4, 14), matchingRegion: { countryCode: 'SA', region: 'riyadh' },
    workSite: { lat: 24.7136, lng: 46.6753, instructions: 'Private gate' }, notes: 'Private controlled QA request',
  },
};
const quote = {
  contractVersion: 1, expectedQuoteRevision: null, serviceScope: 'Qualified excavator operator for the requested period',
  schedule: { startAt: plusDays(4, 5), endAt: plusDays(4, 13) }, inclusions: ['Operator time'], exclusions: ['Equipment rental'],
  serviceCategory: 'excavators', availability: 'declared_available', currency: 'SAR', baseServicePriceMinor: 120_000,
  optionalComponents: [{ code: 'travel', label: 'Travel allowance', amountMinor: 10_000 }], expiresAt: plusDays(3),
};
const call = (path: string, method = 'GET', body?: unknown) => worker.fetch(new Request(`https://worker.test${path}`, {
  method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), env);
const customerAccount = { role: 'customer', accountPurpose: 'standard', accountStatus: 'active', isActive: true, emailVerified: true, nameEn: 'QA Customer' };
const providerAccount = { role: 'driver', accountPurpose: 'standard', accountStatus: 'active', isActive: true, emailVerified: true, nameEn: 'QA Provider' };
const eligibleProfile = (ownerUid: string, name: string) => ({
  schemaVersion: 1, kind: 'operator', eligibilityState: 'verified_eligible', profileState: 'active', moderationState: 'approved',
  verificationState: 'verified', discoverable: true, canReceiveRequests: true, accountPurpose: 'standard', principalType: 'individual',
  authorizationState: 'active', revocationState: 'clear', displayName: name, countryCode: 'SA', region: 'riyadh',
  equipmentSkills: ['excavators'], yearsExperience: 8, availability: 'available', sortKey: name, discoveryFacets: [], ownerUid,
});
function authenticate(uid: string, account: any) { __test.setAuth({ uid, admin: false, emailVerified: true, accountProfile: account }); }

describe('M2-E1 durable private RFQ Worker workflow', () => {
  beforeEach(() => { __test.setFirestore(undefined); __test.captureCommits(undefined); __test.resetMutationLimits(); __test.setServiceRfqActivation(true); });
  afterEach(() => { globalThis.fetch = originalFetch; __test.setAuth(undefined); __test.setServiceRfqActivation(undefined); __test.resetMutationLimits(); });

  test('keeps every Production route closed before authentication or Firestore access', async () => {
    __test.setServiceRfqActivation(undefined);
    globalThis.fetch = async () => { throw new Error('Firestore must remain unreachable'); };
    __test.setAuth(undefined);
    const response = await call('/api/service-rfqs', 'POST', { draft: requestDraft, targetProfileIds: [profileA], idempotencyKey: 'create-rfq-0001' });
    expect(response.status).toBe(404);
    const body = await response.json() as any;
    expect(body.errorCode).toBe('SERVICE_RFQ_NOT_ACTIVATED');
    expect(body.activation).toEqual({ enabled: false, reason: 'disabled_pending_commercial_and_regulatory_approval' });
  });

  test('persists creation across a fresh request, scopes retrieval, and never exposes another customer', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`operatorDiscoveryProfiles/${profileA}`, eligibleProfile(providerA, 'Provider A'));
    store.put(`users/${providerA}`, providerAccount);
    store.put(`users/${customerUid}`, customerAccount);
    authenticate(customerUid, customerAccount);
    const created = await call('/api/service-rfqs', 'POST', { draft: requestDraft, targetProfileIds: [profileA], idempotencyKey: 'create-rfq-0001' });
    expect(created.status).toBe(201);
    const body: any = await created.json(), rfqId = body.rfq.rfqId;
    expect(body.rfq.requirementsSnapshot.workSite).toEqual(requestDraft.preparedRequest.workSite);
    expect(store.requiredData(`serviceRfqs/${rfqId}`).status).toBe('collecting_test_proposals');
    const restored: any = await (await call(`/api/service-rfqs/${rfqId}`)).json();
    expect(restored.rfq.rfqId).toBe(rfqId);
    expect((await call('/api/service-rfqs')).status).toBe(200);
    expect(store.queries.at(-1)?.select?.fields.map((item: any) => item.fieldPath)).not.toContain('aggregateJson');
    authenticate('customer-qa-other', customerAccount);
    expect((await call(`/api/service-rfqs/${rfqId}`)).status).toBe(403);
    authenticate(providerA, providerAccount);
    expect((await call(`/api/service-rfqs/${rfqId}`)).status).toBe(200);
    expect((await call('/api/service-rfqs')).status).toBe(200);
    store.put(`operatorDiscoveryProfiles/${profileA}`, { ...eligibleProfile(providerA, 'Provider A'), discoverable: false, canReceiveRequests: false, verificationState: 'unverified' });
    expect((await call(`/api/service-rfqs/${rfqId}`)).status).toBe(403);
    expect((await (await call('/api/service-rfqs')).json() as any).rfqs).toEqual([]);

    const raw = store.requiredData(`serviceRfqs/${rfqId}`), aggregate = JSON.parse(raw.aggregateJson);
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    aggregate.rfq.expiresAt = expiredAt;
    store.put(`serviceRfqs/${rfqId}`, { ...raw, expiresAt: expiredAt, aggregateJson: JSON.stringify(aggregate) });
    const auditCount = [...store.documents.keys()].filter(key => key.startsWith('serviceRfqAudit/')).length;
    authenticate('customer-qa-other', customerAccount);
    expect((await call(`/api/service-rfqs/${rfqId}`)).status).toBe(403);
    expect(store.requiredData(`serviceRfqs/${rfqId}`).status).toBe('collecting_test_proposals');
    expect([...store.documents.keys()].filter(key => key.startsWith('serviceRfqAudit/'))).toHaveLength(auditCount);
  });

  test('fails closed before listing private RFQs for inactive or unauthorized provider accounts', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`operatorDiscoveryProfiles/${profileA}`, eligibleProfile(providerA, 'Provider A'));
    store.put(`users/${providerA}`, providerAccount);
    store.put(`users/${customerUid}`, customerAccount);
    authenticate(customerUid, customerAccount);
    expect((await call('/api/service-rfqs', 'POST', {
      draft: requestDraft, targetProfileIds: [profileA], idempotencyKey: 'create-rfq-list-auth-0001',
    })).status).toBe(201);

    authenticate(providerA, providerAccount);
    expect((await call('/api/service-rfqs')).status).toBe(200);

    for (const account of [
      { ...providerAccount, isActive: false },
      { ...providerAccount, accountStatus: 'pending_review' },
      { ...providerAccount, accountStatus: 'restricted' },
      { ...providerAccount, suspensionStatus: 'suspended' },
      { ...providerAccount, role: 'provider' },
    ]) {
      authenticate(providerA, account);
      const before = store.queries.length;
      expect((await call('/api/service-rfqs')).status).toBe(403);
      expect(store.queries).toHaveLength(before);
    }
  });

  test('submits and immutably revises quotes, compares them, and permits one non-binding selection', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`operatorDiscoveryProfiles/${profileA}`, eligibleProfile(providerA, 'Provider A'));
    store.put(`operatorDiscoveryProfiles/${profileB}`, eligibleProfile(providerB, 'Provider B'));
    store.put(`users/${providerA}`, providerAccount); store.put(`users/${providerB}`, providerAccount);
    store.put(`users/${customerUid}`, customerAccount);
    authenticate(customerUid, customerAccount);
    const creation: any = await (await call('/api/service-rfqs', 'POST', { draft: requestDraft, targetProfileIds: [profileA, profileB], idempotencyKey: 'create-rfq-0002' })).json();
    const rfqId = creation.rfq.rfqId;

    authenticate(providerA, providerAccount);
    const first: any = await (await call(`/api/service-rfqs/${rfqId}/quotes`, 'POST', { quote, expectedRfqRevision: 1, idempotencyKey: 'quote-submit-0001' })).json();
    const quoteId = first.comparison.quotes[0].quoteId;
    const revisedQuote = { ...quote, expectedQuoteRevision: 0, baseServicePriceMinor: 110_000 };
    expect((await call(`/api/service-rfqs/${rfqId}/quotes/${quoteId}`, 'PUT', { quote: revisedQuote, expectedRfqRevision: 2, idempotencyKey: 'quote-revise-0001' })).status).toBe(200);
    expect((await call(`/api/service-rfqs/${rfqId}/quotes/${quoteId}`, 'PUT', { quote: revisedQuote, expectedRfqRevision: 2, idempotencyKey: 'quote-stale-0001' })).status).toBe(409);

    authenticate(providerB, providerAccount);
    expect((await call(`/api/service-rfqs/${rfqId}/quotes`, 'POST', { quote: { ...quote, baseServicePriceMinor: 100_000, optionalComponents: [] }, expectedRfqRevision: 3, idempotencyKey: 'quote-submit-0002' })).status).toBe(201);
    authenticate(customerUid, customerAccount);
    const comparison: any = await (await call(`/api/service-rfqs/${rfqId}`)).json();
    expect(comparison.comparison.quotes).toHaveLength(2);
    expect(comparison.comparison.quotes.map((item: any) => item.quotedServicePriceMinor)).toEqual([100_000, 120_000]);
    const selected = await call(`/api/service-rfqs/${rfqId}/selection`, 'POST', { quoteId, expectedRfqRevision: 4, idempotencyKey: 'select-quote-0001' });
    expect(selected.status).toBe(200);
    expect((await selected.json() as any).binding).toBe('non_binding_preliminary_selection');
    expect((await call(`/api/service-rfqs/${rfqId}/selection`, 'POST', { quoteId: comparison.comparison.quotes[0].quoteId, expectedRfqRevision: 4, idempotencyKey: 'select-conflict-0002' })).status).toBe(409);
    const aggregate = JSON.parse(store.requiredData(`serviceRfqs/${rfqId}`).aggregateJson);
    expect(aggregate.quotes.find((item: any) => item.quoteId === quoteId).snapshots).toHaveLength(2);
    expect(aggregate.quotes.find((item: any) => item.quoteId === quoteId).snapshots[0].quotedServicePriceMinor).toBe(130_000);
    expect(JSON.stringify(comparison.comparison)).not.toContain('workSite');
    expect(JSON.stringify(comparison.comparison)).not.toContain(providerA);
    const notificationEvents = [...store.documents.entries()].filter(([path]) => path.startsWith('notificationOutbox/')).map(([, stored]) => decodeFields(stored.fields).event);
    expect([
      'service_rfq_invited', 'service_quote_submitted', 'service_quote_revised', 'service_quote_provisionally_selected',
    ].every(event => notificationEvents.includes(event))).toBe(true);
  });

  test('serializes concurrent provider submissions and fails closed after cancellation', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`operatorDiscoveryProfiles/${profileA}`, eligibleProfile(providerA, 'Provider A')); store.put(`users/${providerA}`, providerAccount);
    store.put(`users/${customerUid}`, customerAccount);
    authenticate(customerUid, customerAccount);
    const creation: any = await (await call('/api/service-rfqs', 'POST', { draft: requestDraft, targetProfileIds: [profileA], idempotencyKey: 'create-rfq-0003' })).json();
    const rfqId = creation.rfq.rfqId;
    authenticate(providerA, providerAccount);
    const responses = await Promise.all([
      call(`/api/service-rfqs/${rfqId}/quotes`, 'POST', { quote, expectedRfqRevision: 1, idempotencyKey: 'concurrent-quote-01' }),
      call(`/api/service-rfqs/${rfqId}/quotes`, 'POST', { quote, expectedRfqRevision: 1, idempotencyKey: 'concurrent-quote-01' }),
    ]);
    expect(responses.every(item => item.status === 201)).toBe(true);
    const aggregate = JSON.parse(store.requiredData(`serviceRfqs/${rfqId}`).aggregateJson);
    expect(aggregate.quotes).toHaveLength(1);
    authenticate(customerUid, customerAccount);
    expect((await call(`/api/service-rfqs/${rfqId}/cancel`, 'POST', { expectedRevision: 2, idempotencyKey: 'cancel-rfq-0001' })).status).toBe(200);
    expect([...store.documents.values()].map(stored => decodeFields(stored.fields).event)).toContain('service_rfq_cancelled');
    authenticate(providerA, providerAccount);
    expect((await call(`/api/service-rfqs/${rfqId}/quotes/${aggregate.quotes[0].quoteId}`, 'PUT', {
      quote: { ...quote, expectedQuoteRevision: 0 }, expectedRfqRevision: 3, idempotencyKey: 'revise-cancelled-1',
    })).status).toBe(403);
  });

  test('withdraws an existing quote through the authoritative transition and notifies only the customer', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`operatorDiscoveryProfiles/${profileA}`, eligibleProfile(providerA, 'Provider A'));
    store.put(`users/${providerA}`, providerAccount); store.put(`users/${customerUid}`, customerAccount);
    authenticate(customerUid, customerAccount);
    const created: any = await (await call('/api/service-rfqs', 'POST', {
      draft: requestDraft, targetProfileIds: [profileA], idempotencyKey: 'create-rfq-withdraw-0001',
    })).json();
    authenticate(providerA, providerAccount);
    const submitted: any = await (await call(`/api/service-rfqs/${created.rfq.rfqId}/quotes`, 'POST', {
      quote, expectedRfqRevision: 1, idempotencyKey: 'quote-withdraw-submit-0001',
    })).json();
    const quoteId = submitted.comparison.quotes[0].quoteId;
    const withdrawn = await call(`/api/service-rfqs/${created.rfq.rfqId}/quotes/${quoteId}/withdraw`, 'POST', {
      expectedRfqRevision: 2, expectedQuoteRevision: 0, idempotencyKey: 'quote-withdraw-0001',
    });
    expect(withdrawn.status).toBe(200);
    authenticate(customerUid, customerAccount);
    const customerView: any = await (await call(`/api/service-rfqs/${created.rfq.rfqId}`)).json();
    expect(customerView.comparison.quotes).toEqual([]);
    const outbox = [...store.documents.values()].map(stored => decodeFields(stored.fields));
    expect(outbox.some(item => item.event === 'service_quote_withdrawn' && item.uid === customerUid)).toBe(true);
    expect(outbox.some(item => item.event === 'service_quote_withdrawn' && item.uid === providerA)).toBe(false);
  });

  test('keeps request-scoped text messages private, idempotent, participant-bound, and read-only after cancellation', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`operatorDiscoveryProfiles/${profileA}`, eligibleProfile(providerA, 'Provider A'));
    store.put(`operatorDiscoveryProfiles/${profileB}`, eligibleProfile(providerB, 'Provider B'));
    store.put(`users/${providerA}`, providerAccount); store.put(`users/${providerB}`, providerAccount);
    store.put(`users/${customerUid}`, customerAccount);
    authenticate(customerUid, customerAccount);
    const creation: any = await (await call('/api/service-rfqs', 'POST', {
      draft: requestDraft, targetProfileIds: [profileA, profileB], idempotencyKey: 'create-rfq-message-0001',
    })).json();
    const rfqId = creation.rfq.rfqId;

    const first = await call(`/api/service-rfqs/${rfqId}/messages`, 'POST', {
      providerProfileId: profileA, text: '  Please confirm the work-site arrival window.  ', idempotencyKey: 'message-customer-0001',
    });
    expect(first.status).toBe(201);
    const firstMessage = (await first.json() as any).message;
    expect(firstMessage.senderRole).toBe('customer');
    expect(firstMessage.text).toBe('Please confirm the work-site arrival window.');
    const replay = await call(`/api/service-rfqs/${rfqId}/messages`, 'POST', {
      providerProfileId: profileA, text: 'Please confirm the work-site arrival window.', idempotencyKey: 'message-customer-0001',
    });
    expect(replay.status).toBe(200);
    expect((await replay.json() as any).replayed).toBe(true);
    expect([...store.documents.keys()].filter(key => key.startsWith('serviceMessages/'))).toHaveLength(1);
    expect([...store.documents.values()].map(stored => decodeFields(stored.fields))
      .filter(item => item.event === 'service_message_received')).toHaveLength(1);

    authenticate('outside-customer-0001', customerAccount);
    expect((await call(`/api/service-rfqs/${rfqId}/messages?providerProfileId=${profileA}`)).status).toBe(403);
    expect((await call(`/api/service-rfqs/${rfqId}/messages`, 'POST', {
      providerProfileId: profileA, text: 'forged', idempotencyKey: 'message-outsider-0001',
    })).status).toBe(403);

    authenticate(providerA, providerAccount);
    expect((await call(`/api/service-rfqs/${rfqId}/messages`, 'POST', {
      text: 'Arrival window confirmed.', idempotencyKey: 'message-provider-0001',
    })).status).toBe(201);
    const providerView: any = await (await call(`/api/service-rfqs/${rfqId}/messages`)).json();
    expect(providerView.messages).toHaveLength(2);
    expect(JSON.stringify(providerView)).not.toContain(customerUid);
    expect(JSON.stringify(providerView)).not.toContain(providerA);
    store.put(`users/${providerA}`, { ...providerAccount, accountStatus: 'restricted' });
    expect((await call(`/api/service-rfqs/${rfqId}/messages`)).status).toBe(403);
    expect((await call(`/api/service-rfqs/${rfqId}/messages`, 'POST', {
      text: 'must not send while restricted', idempotencyKey: 'message-restricted-0001',
    })).status).toBe(403);
    store.put(`users/${providerA}`, providerAccount);

    authenticate(customerUid, customerAccount);
    const customerView: any = await (await call(`/api/service-rfqs/${rfqId}/messages?providerProfileId=${profileA}`)).json();
    expect(new Set(customerView.messages.map((item: any) => item.text))).toEqual(new Set([
      'Please confirm the work-site arrival window.', 'Arrival window confirmed.',
    ]));
    const otherThread: any = await (await call(`/api/service-rfqs/${rfqId}/messages?providerProfileId=${profileB}`)).json();
    expect(otherThread.messages).toEqual([]);

    expect((await call(`/api/service-rfqs/${rfqId}/cancel`, 'POST', { expectedRevision: 1, idempotencyKey: 'cancel-message-rfq-0001' })).status).toBe(200);
    expect((await call(`/api/service-rfqs/${rfqId}/messages`, 'POST', {
      providerProfileId: profileA, text: 'must not send', idempotencyKey: 'message-closed-0001',
    })).status).toBe(409);
    expect((await call(`/api/service-rfqs/${rfqId}/messages?providerProfileId=${profileA}`)).status).toBe(200);

    const outbox = [...store.documents.entries()].filter(([path]) => path.startsWith('notificationOutbox/')).map(([, stored]) => decodeFields(stored.fields));
    expect(outbox.some(item => item.event === 'service_message_received')).toBe(true);
    expect(JSON.stringify(outbox)).not.toContain('Arrival window confirmed.');
    expect(JSON.stringify(outbox)).not.toContain('work-site arrival');
  });
});
