import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import worker, { __test, type Env } from './index';
import { projectFinancialState, projectProvisionalFinancialState } from './customer-project';

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
  const documents = new Map<string, Stored>(), transactions = new Map<string, Map<string, number | null>>(), queries: any[] = [];
  let sequence = 0, version = 0;
  const put = (path: string, value: Record<string, unknown>) => documents.set(path, { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])), updateTime: `2026-10-15T00:00:${String(++version).padStart(2, '0')}.000000Z`, version });
  const data = (path: string) => documents.has(path) ? decodeFields(documents.get(path)!.fields) : null;
  const document = (path: string, stored: Stored) => ({ name: `projects/test-project/databases/(default)/documents/${path}`, fields: stored.fields, updateTime: stored.updateTime });
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'project-test-token', expires_in: 3600 });
    if (url.includes(':beginTransaction')) { const id = `tx-${++sequence}`; transactions.set(id, new Map()); return Response.json({ transaction: id }); }
    if (url.includes(':rollback')) { transactions.delete(String(JSON.parse(String(init?.body || '{}')).transaction || '')); return Response.json({}); }
    if (url.includes(':batchGet')) {
      const names = JSON.parse(String(init?.body || '{}')).documents || [];
      return Response.json(names.map((name: string) => { const path = name.split('/documents/')[1] || '', stored = documents.get(path); return stored ? { found: document(path, stored) } : { missing: name }; }));
    }
    if (url.includes(':runQuery')) {
      const query = JSON.parse(String(init?.body || '{}')).structuredQuery || {}; queries.push(query);
      const collection = String(query.from?.[0]?.collectionId || ''), filter = query.where?.fieldFilter;
      const field = String(filter?.field?.fieldPath || ''), expected = decodeValue(filter?.value), cursor = String(query.startAt?.values?.[0]?.referenceValue || '');
      const rows = [...documents.entries()].filter(([path, stored]) => path.startsWith(`${collection}/`) && (!filter || decodeFields(stored.fields)[field] === expected))
        .map(([path, stored]) => document(path, stored)).filter(item => !cursor || item.name > cursor).sort((a, b) => a.name.localeCompare(b.name)).slice(0, Number(query.limit || 100));
      const selected = Array.isArray(query.select?.fields) ? query.select.fields.map((item: any) => String(item.fieldPath || '')) : null;
      return Response.json(rows.map(item => ({ document: selected ? { ...item, fields: Object.fromEntries(Object.entries(item.fields).filter(([key]) => selected.includes(key))) } : item })));
    }
    if (url.includes(':commit')) {
      const body = JSON.parse(String(init?.body || '{}')), snapshot = transactions.get(String(body.transaction || '')), writes = body.writes || [];
      for (const write of writes) {
        const path = String(write.update?.name || write.verify || write.delete || '').split('/documents/')[1] || '', current = documents.get(path), observed = snapshot?.get(path);
        if (observed !== undefined && observed !== (current?.version ?? null) || write.currentDocument?.exists === false && current || write.currentDocument?.updateTime && write.currentDocument.updateTime !== current?.updateTime) {
          return Response.json({ error: { status: 'ABORTED' } }, { status: 409 });
        }
      }
      for (const write of writes) {
        const path = String(write.update?.name || write.verify || write.delete || '').split('/documents/')[1] || '';
        if (write.verify) continue;
        if (write.delete) { documents.delete(path); continue; }
        const current = documents.get(path), fields = write.updateMask ? { ...(current?.fields || {}), ...write.update.fields } : write.update.fields;
        documents.set(path, { fields, updateTime: `2026-10-15T00:01:${String(++version).padStart(2, '0')}.000000Z`, version });
      }
      transactions.delete(String(body.transaction || '')); return Response.json({});
    }
    if (url.includes('/documents/')) {
      const parsed = new URL(url), path = decodeURIComponent(parsed.pathname.split('/documents/')[1]), stored = documents.get(path), tx = parsed.searchParams.get('transaction');
      if (tx) transactions.get(tx)?.set(path, stored?.version ?? null);
      return stored ? Response.json(document(path, stored)) : new Response('', { status: 404 });
    }
    return new Response('', { status: 404 });
  };
  return { documents, queries, put, data, fetch: fetch as typeof globalThis.fetch };
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { FIREBASE_PROJECT_ID: 'test-project', FIREBASE_CLIENT_EMAIL: 'service@test-project.iam.gserviceaccount.com', FIREBASE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() } as Env;
const originalFetch = globalThis.fetch;
const customerUid = 'customer-project-qa', otherUid = 'customer-project-other';
const activeCustomer = { role: 'customer', accountPurpose: 'standard', accountStatus: 'active', isActive: true, emailVerified: true, nameEn: 'Project Customer' };
const authenticate = (uid: string, account = activeCustomer) => __test.setAuth({ uid, admin: false, emailVerified: true, accountProfile: account });
const call = (path: string, method = 'GET', body?: unknown) => worker.fetch(new Request(`https://worker.test${path}`, { method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
const rental = { pricingModelVersion: 2, customerUid, providerUid: 'provider-project-qa', status: 'accepted', requestedStartAt: '2026-11-01T08:00:00.000Z', requestedEndAt: '2026-11-02T08:00:00.000Z', equipmentSnapshot: { titleAr: 'حفار', titleEn: 'Excavator' }, currency: 'SAR', pricingSnapshot: { baseAmountMinor: 10000 }, workSiteLocation: { lat: 24.7, lng: 46.6 }, createdAt: '2026-10-15T00:00:00.000Z' };
const commercialSnapshot = (currency = 'SAR', baseAmountMinor = 10_000, customerPayableMinor = 11_500) => ({
  currency, baseAmountMinor, platformFeeMinor: 1_000, customerFeeMinor: 0, providerFeeMinor: 1_000,
  providerReceivableMinor: baseAmountMinor - 1_000, customerPayableMinor, taxAmountMinor: 1_500,
  taxRateBps: 1_500, gatewayFeeMinor: null,
});
const rfqId = `rfq_${'a'.repeat(43)}`;
const rfqAggregate = { rfq: { contractVersion: 1, version: 1, rfqId, customerUid, serviceKind: 'operator', status: 'collecting_test_proposals', revision: 1, invitedProviders: [{ profileId: 'operator_profile_1', principal: { kind: 'individual', providerUid: 'provider-project-qa' } }], requirementsSnapshot: { requestedStartAt: '2026-11-01T09:00:00.000Z', requestedEndAt: '2026-11-01T17:00:00.000Z', workSite: { lat: 24.7, lng: 46.6 } }, createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z' }, quotes: [], operationHistory: [], provisionalSelection: null };
const rfq = { schemaVersion: 1, rfqId, customerUid, serviceKind: 'operator', status: 'collecting_test_proposals', revision: 1, quoteCount: 0, createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z', creationFingerprint: 'b'.repeat(43), aggregateJson: JSON.stringify(rfqAggregate) };

describe('M2-E5 authoritative financial projection', () => {
  test('uses validated paid customer payable instead of base amount', () => {
    expect(projectFinancialState({
      status: 'completed', currency: 'SAR', paymentStatus: 'paid', paymentState: 'paid', paymentId: 'charge-1',
      invoiceId: 'INV-1', paidAt: '2026-10-15T02:00:00.000Z', paidCommercialSnapshot: commercialSnapshot(),
    })).toEqual({ state: 'paid', currency: 'SAR', currencyDecimals: 2, amountMinor: 11_500 });
  });

  test('preserves AED estimates and three-decimal GCC amounts', () => {
    expect(projectFinancialState({ currency: 'AED', pricingSnapshot: { currency: 'AED', currencyDecimals: 2, baseAmountMinor: 25_000 } }))
      .toEqual({ state: 'estimate', currency: 'AED', currencyDecimals: 2, amountMinor: 25_000 });
    expect(projectFinancialState({ currency: 'KWD', pricingSnapshot: { currency: 'KWD', currencyDecimals: 3, baseAmountMinor: 1_234 } }))
      .toEqual({ state: 'estimate', currency: 'KWD', currencyDecimals: 3, amountMinor: 1_234 });
    expect(projectProvisionalFinancialState({ currency: 'AED', quotedServicePriceMinor: 37_500 }))
      .toEqual({ state: 'provisional_non_binding', currency: 'AED', currencyDecimals: 2, amountMinor: 37_500 });
  });

  test('fails closed for malformed, inconsistent, and unsupported money', () => {
    const paid = { status: 'completed', currency: 'SAR', paymentStatus: 'paid', paymentState: 'paid', paymentId: 'charge-1', invoiceId: 'INV-1', paidAt: '2026-10-15T02:00:00.000Z' };
    expect(projectFinancialState({ ...paid, paidCommercialSnapshot: commercialSnapshot('SAR', 10_000, 11_499) }))
      .toEqual({ state: 'unavailable', currency: null, currencyDecimals: null, amountMinor: null });
    expect(projectFinancialState({ ...paid, currency: 'AED', paidCommercialSnapshot: commercialSnapshot() }).state).toBe('unavailable');
    expect(projectFinancialState({ currency: 'USD', pricingSnapshot: { currency: 'USD', baseAmountMinor: 10_000 } }).state).toBe('unavailable');
    expect(projectFinancialState({ currency: 'SAR', pricingSnapshot: { currency: 'SAR', baseAmountMinor: Number.MAX_SAFE_INTEGER + 1 } }).state).toBe('unavailable');
  });

  test('does not label incomplete, unpaid, refunded, or provisional evidence as paid', () => {
    const snapshot = commercialSnapshot();
    expect(projectFinancialState({ currency: 'SAR', paymentStatus: 'unpaid', paymentState: null, pricingSnapshot: { currency: 'SAR', baseAmountMinor: 10_000 } }).state).toBe('estimate');
    expect(projectFinancialState({ currency: 'SAR', status: 'accepted', paymentStatus: 'paid', paymentState: 'paid', paymentId: 'charge-1', invoiceId: 'INV-1', paidAt: '2026-10-15T02:00:00.000Z', paidCommercialSnapshot: snapshot }).state).toBe('unavailable');
    expect(projectFinancialState({ currency: 'SAR', paymentStatus: 'paid', paymentState: 'pending', paidCommercialSnapshot: snapshot }).state).toBe('unavailable');
    expect(projectFinancialState({ currency: 'SAR', paymentStatus: 'refunded', paymentState: 'refunded', paidCommercialSnapshot: snapshot }).state).toBe('unavailable');
    expect(projectProvisionalFinancialState({ currency: 'SAR', quotedServicePriceMinor: 10_000 }).state).toBe('provisional_non_binding');
  });
});

describe('M2-E5 private customer project API', () => {
  beforeEach(() => { __test.setFirestore(undefined); __test.captureCommits(undefined); __test.resetMutationLimits(); __test.setCustomerProjectActivation(true); });
  afterEach(() => { globalThis.fetch = originalFetch; __test.setAuth(undefined); __test.setCustomerProjectActivation(undefined); __test.resetMutationLimits(); });

  test('fails closed in Production before authentication or Firestore access', async () => {
    __test.setCustomerProjectActivation(undefined); globalThis.fetch = async () => { throw new Error('must not reach Firestore'); }; __test.setAuth(undefined);
    const response = await call('/api/customer-projects'); expect(response.status).toBe(404);
    expect((await response.json() as any).errorCode).toBe('CUSTOMER_PROJECT_HUB_NOT_ACTIVATED');
  });

  test('creates idempotently, lists privately, and rejects inactive/non-customer accounts', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch; store.put(`users/${customerUid}`, activeCustomer); store.put(`users/${otherUid}`, activeCustomer); authenticate(customerUid);
    const body = { title: 'Riyadh site', description: 'Independent work requests', idempotencyKey: 'project-create-0001' };
    const created: any = await (await call('/api/customer-projects', 'POST', body)).json(); expect(created.project.revision).toBe(0);
    const replay: any = await (await call('/api/customer-projects', 'POST', body)).json(); expect(replay.replayed).toBe(true);
    expect((await (await call('/api/customer-projects')).json() as any).projects).toHaveLength(1);
    authenticate(otherUid); expect((await (await call('/api/customer-projects')).json() as any).projects).toEqual([]);
    store.put(`users/${customerUid}`, { ...activeCustomer, accountStatus: 'restricted' }); authenticate(customerUid, { ...activeCustomer, accountStatus: 'restricted' }); const before = store.queries.length;
    expect((await call('/api/customer-projects')).status).toBe(403); expect(store.queries).toHaveLength(before);
    store.put(`users/${customerUid}`, { ...activeCustomer, role: 'provider' }); authenticate(customerUid, { ...activeCustomer, role: 'provider' }); expect((await call('/api/customer-projects')).status).toBe(403);
  });

  test('atomically attaches each owned request once and preserves private source data and money', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch; store.put(`users/${customerUid}`, activeCustomer);
    store.put('users/provider-project-qa', { role: 'provider', nameAr: 'مؤسسة المعدات', nameEn: 'Equipment Co', phone: '+966500000000' });
    store.put('equipmentRequests/r_rental_project_1', rental); store.put(`serviceRfqs/${rfqId}`, rfq); authenticate(customerUid);
    const created: any = await (await call('/api/customer-projects', 'POST', { title: 'Project', description: '', idempotencyKey: 'project-create-0002' })).json();
    const projectId = created.project.projectId;
    const attachedRental: any = await (await call(`/api/customer-projects/${projectId}/links`, 'POST', { sourceKind: 'rental', sourceId: 'r_rental_project_1', expectedRevision: 0, idempotencyKey: 'attach-rental-0001' })).json();
    expect(attachedRental.project.requestCount).toBe(1);
    const replay: any = await (await call(`/api/customer-projects/${projectId}/links`, 'POST', { sourceKind: 'rental', sourceId: 'r_rental_project_1', expectedRevision: 0, idempotencyKey: 'attach-rental-replay' })).json();
    expect(replay.replayed).toBe(true);
    const stale = await call(`/api/customer-projects/${projectId}/links`, 'POST', { sourceKind: 'service_rfq', sourceId: rfqId, expectedRevision: 0, idempotencyKey: 'attach-rfq-stale' }); expect(stale.status).toBe(409);
    const attachedRfq = await call(`/api/customer-projects/${projectId}/links`, 'POST', { sourceKind: 'service_rfq', sourceId: rfqId, expectedRevision: 1, idempotencyKey: 'attach-rfq-0001' }); expect(attachedRfq.status).toBe(201);
    const links: any = await (await call(`/api/customer-projects/${projectId}/links`)).json(); expect(links.links).toHaveLength(2);
    expect(JSON.stringify(links)).not.toContain('workSiteLocation'); expect(JSON.stringify(links)).not.toContain('24.7');
    const rentalItem = links.links.find((item: any) => item.sourceKind === 'rental').item;
    expect(rentalItem.financial).toEqual({ state: 'estimate', currency: 'SAR', currencyDecimals: 2, amountMinor: 10000 });
    expect(rentalItem.providerLabelEn).toBe('Equipment Co'); expect(JSON.stringify(links)).not.toContain('+966500000000');
    expect(JSON.stringify(links)).not.toContain('provider-project-qa');
    expect(store.data('equipmentRequests/r_rental_project_1')).toEqual(rental); expect(store.data(`serviceRfqs/${rfqId}`)?.aggregateJson).toBe(rfq.aggregateJson);
  });

  test('prevents cross-project/cross-account links and detaches without mutating the request', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch; store.put(`users/${customerUid}`, activeCustomer); store.put(`users/${otherUid}`, activeCustomer); store.put('equipmentRequests/r_rental_project_2', rental); authenticate(customerUid);
    const first: any = await (await call('/api/customer-projects', 'POST', { title: 'One', description: '', idempotencyKey: 'project-create-0003' })).json();
    const second: any = await (await call('/api/customer-projects', 'POST', { title: 'Two', description: '', idempotencyKey: 'project-create-0004' })).json();
    await call(`/api/customer-projects/${first.project.projectId}/links`, 'POST', { sourceKind: 'rental', sourceId: 'r_rental_project_2', expectedRevision: 0, idempotencyKey: 'attach-rental-0002' });
    expect((await call(`/api/customer-projects/${second.project.projectId}/links`, 'POST', { sourceKind: 'rental', sourceId: 'r_rental_project_2', expectedRevision: 0, idempotencyKey: 'attach-rental-conflict' })).status).toBe(409);
    authenticate(otherUid); expect((await call(`/api/customer-projects/${first.project.projectId}`)).status).toBe(403);
    authenticate(customerUid); const links: any = await (await call(`/api/customer-projects/${first.project.projectId}/links`)).json(), linkId = links.links[0].linkId;
    expect((await call(`/api/customer-projects/${first.project.projectId}/links/${linkId}`, 'DELETE', { expectedRevision: 1, idempotencyKey: 'detach-rental-0001' })).status).toBe(200);
    expect(store.data('equipmentRequests/r_rental_project_2')).toEqual(rental); expect([...store.documents.keys()].some(key => key.startsWith('customerProjectLinks/'))).toBe(false);
    const delayedRetry: any = await (await call(`/api/customer-projects/${first.project.projectId}/links`, 'POST', { sourceKind: 'rental', sourceId: 'r_rental_project_2', expectedRevision: 0, idempotencyKey: 'attach-rental-0002' })).json();
    expect(delayedRetry.replayed).toBe(true); expect(delayedRetry.project.requestCount).toBe(0);
    expect([...store.documents.keys()].some(key => key.startsWith('customerProjectLinks/'))).toBe(false);
  });

  test('keeps multiple same-category and cross-provider requests independent in one project', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch; store.put(`users/${customerUid}`, activeCustomer);
    store.put('users/provider-project-qa', { role: 'provider', nameAr: 'المورد أ', nameEn: 'Provider A', phone: '+966500000001' });
    store.put('users/provider-project-b', { role: 'provider', nameAr: 'المورد ب', nameEn: 'Provider B', phone: '+966500000002' });
    store.put('equipmentRequests/r_rental_multi_1', { ...rental, providerUid: 'provider-project-qa' });
    store.put('equipmentRequests/r_rental_multi_2', { ...rental, providerUid: 'provider-project-qa', pricingSnapshot: { baseAmountMinor: 12000 } });
    store.put('equipmentRequests/r_rental_multi_3', { ...rental, providerUid: 'provider-project-b', pricingSnapshot: { baseAmountMinor: 15000 } });
    const selectedRfqId = `rfq_${'c'.repeat(43)}`, quoteId = `quote_${'d'.repeat(43)}`;
    const selectedAggregate = { ...rfqAggregate, rfq: { ...rfqAggregate.rfq, rfqId: selectedRfqId, status: 'provisionally_selected' },
      quotes: [{ quoteId, rfqId: selectedRfqId, rfqVersion: 1, serviceKind: 'operator', principal: { kind: 'individual', providerUid: 'provider-project-b' }, revision: 0, currentVersion: 1, status: 'active',
        snapshots: [{ contractVersion: 1, quoteVersion: 1, serviceScope: 'Operator shift', schedule: { startAt: '2026-11-03T08:00:00.000Z', endAt: '2026-11-03T16:00:00.000Z' }, inclusions: [], exclusions: [], serviceCategory: 'operator', availability: 'available', currency: 'SAR', baseServicePriceMinor: 25000, optionalComponents: [], quotedServicePriceMinor: 25000, expiresAt: '2026-12-01T00:00:00.000Z', createdAt: '2026-10-15T00:00:00.000Z' }], updatedAt: '2026-10-15T00:00:00.000Z' }],
      provisionalSelection: { quoteId, quoteVersion: 1, selectedAt: '2026-10-15T01:00:00.000Z' } };
    store.put(`serviceRfqs/${selectedRfqId}`, { ...rfq, rfqId: selectedRfqId, status: 'provisionally_selected', quoteCount: 1, aggregateJson: JSON.stringify(selectedAggregate) });
    authenticate(customerUid);
    const created: any = await (await call('/api/customer-projects', 'POST', { title: 'Multi-provider project', description: '', idempotencyKey: 'project-create-multi' })).json();
    const sources = [
      { sourceKind: 'rental', sourceId: 'r_rental_multi_1' }, { sourceKind: 'rental', sourceId: 'r_rental_multi_2' },
      { sourceKind: 'rental', sourceId: 'r_rental_multi_3' }, { sourceKind: 'service_rfq', sourceId: selectedRfqId },
    ];
    for (let revision = 0; revision < sources.length; revision += 1) {
      expect((await call(`/api/customer-projects/${created.project.projectId}/links`, 'POST', { ...sources[revision], expectedRevision: revision, idempotencyKey: `attach-multi-${revision}` })).status).toBe(201);
    }
    const response: any = await (await call(`/api/customer-projects/${created.project.projectId}/links`)).json();
    expect(response.links).toHaveLength(4);
    expect(response.links.filter((item: any) => item.item.providerLabelEn === 'Provider A')).toHaveLength(2);
    expect(response.links.filter((item: any) => item.item.providerLabelEn === 'Provider B')).toHaveLength(2);
    const service = response.links.find((item: any) => item.sourceKind === 'service_rfq').item;
    expect(service.financial).toEqual({ state: 'provisional_non_binding', currency: 'SAR', currencyDecimals: 2, amountMinor: 25000 });
    const projected = Object.fromEntries(response.links.filter((item: any) => item.sourceKind === 'rental').map((item: any) => [item.sourceId, item.item.financial]));
    expect(projected.r_rental_multi_1.amountMinor).toBe(10_000);
    expect(projected.r_rental_multi_2.amountMinor).toBe(12_000);
    expect(projected.r_rental_multi_3.amountMinor).toBe(15_000);
    expect(service.startAt).toBe('2026-11-03T08:00:00.000Z');
    expect(JSON.stringify(response)).not.toContain('+96650000000'); expect(JSON.stringify(response)).not.toContain('provider-project-');
  });

  test('paginates customer projects at a stable bounded page size', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch; store.put(`users/${customerUid}`, activeCustomer); authenticate(customerUid);
    for (let index = 0; index < 21; index += 1) {
      const projectId = `project_${String(index).padStart(43, '0')}`;
      store.put(`customerProjects/${projectId}`, { schemaVersion: 1, projectId, customerUid, title: `Project ${index}`, description: '', status: 'active', revision: 0, requestCount: 0,
        createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z', creationFingerprint: 'f'.repeat(43) });
    }
    const first: any = await (await call('/api/customer-projects')).json(); expect(first.projects).toHaveLength(20); expect(typeof first.nextCursor).toBe('string');
    const second: any = await (await call(`/api/customer-projects?cursor=${encodeURIComponent(first.nextCursor)}`)).json();
    expect(second.projects).toHaveLength(1); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.projects, ...second.projects].map((item: any) => item.projectId)).size).toBe(21);
  });
});
