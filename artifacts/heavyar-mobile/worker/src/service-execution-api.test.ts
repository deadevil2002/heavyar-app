import { afterEach, beforeEach, describe, expect, test } from 'vitest';
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
  let transactionSequence = 0, version = 0;
  const put = (path: string, value: Record<string, unknown>) => documents.set(path, {
    fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])),
    updateTime: `2026-10-15T00:00:${String(++version).padStart(2, '0')}.000000Z`, version,
  });
  const data = (path: string) => documents.has(path) ? decodeFields(documents.get(path)!.fields) : null;
  const document = (path: string, stored: Stored) => ({ name: `projects/test-project/databases/(default)/documents/${path}`, fields: stored.fields, updateTime: stored.updateTime });
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'execution-test-token', expires_in: 3600 });
    if (url.includes(':beginTransaction')) { const id = `tx-${++transactionSequence}`; transactions.set(id, new Map()); return Response.json({ transaction: id }); }
    if (url.includes(':rollback')) { transactions.delete(String(JSON.parse(String(init?.body || '{}')).transaction || '')); return Response.json({}); }
    if (url.includes(':commit')) {
      const body = JSON.parse(String(init?.body || '{}')), snapshot = transactions.get(String(body.transaction || ''));
      const writes = Array.isArray(body.writes) ? body.writes : [];
      for (const write of writes) {
        const path = String(write.update?.name || write.verify || '').split('/documents/')[1] || '', current = documents.get(path), observed = snapshot?.get(path);
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
  return { documents, put, data, fetch: fetch as typeof globalThis.fetch };
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  FIREBASE_PROJECT_ID: 'test-project', FIREBASE_CLIENT_EMAIL: 'service@test-project.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
} as Env;
const originalFetch = globalThis.fetch;
const customerUid = 'customer_uid_123', providerUid = 'provider_uid_456', outsiderUid = 'outsider_uid_789';
const account = (role: 'customer' | 'driver' | 'provider') => ({ role, accountPurpose: 'standard', accountStatus: 'active', isActive: true, emailVerified: true });
const binding = (serviceKind: 'operator' | 'transporter' | 'equipment_rental' = 'operator') => ({
  sourceKind: serviceKind === 'equipment_rental' ? 'rental_request' as const : 'service_contract' as const,
  sourceId: serviceKind === 'equipment_rental' ? 'rental_request_123' : 'service_contract_123',
  serviceKind, customerUid, providerUid, sourceRevision: 2, contractState: 'confirmed' as const,
  eligibilityState: 'verified' as const, bookingState: 'confirmed' as const, paymentState: 'not_required' as const,
});
function authenticate(uid: string, role: 'customer' | 'driver' | 'provider', overrides: Record<string, unknown> = {}) {
  __test.setAuth({ uid, admin: false, emailVerified: true, accountProfile: { ...account(role), ...overrides } });
}
const call = (path: string, method = 'GET', body?: unknown) => worker.fetch(new Request(`https://worker.test${path}`, {
  method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), env);

describe('M2-E2 durable private execution Worker workflow', () => {
  beforeEach(() => {
    __test.setFirestore(undefined); __test.captureCommits(undefined); __test.resetMutationLimits();
    __test.setServiceExecutionActivation(true); __test.setServiceExecutionBinding(() => binding());
  });
  afterEach(() => {
    globalThis.fetch = originalFetch; __test.setAuth(undefined); __test.setServiceExecutionActivation(undefined);
    __test.setServiceExecutionBinding(undefined); __test.resetMutationLimits();
  });

  test('keeps every Production path closed before auth and Firestore', async () => {
    __test.setServiceExecutionActivation(undefined); __test.setAuth(undefined);
    globalThis.fetch = async () => { throw new Error('Firestore must remain unreachable'); };
    const response = await call('/api/service-executions', 'POST', { sourceKind: 'service_contract', sourceId: 'service_contract_123', idempotencyKey: 'create:execution:123' });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ errorCode: 'SERVICE_EXECUTION_NOT_ACTIVATED', activation: { enabled: false } });
  });

  test('persists a server-bound execution, restores it after requests, and isolates participants', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`users/${customerUid}`, account('customer')); store.put(`users/${providerUid}`, account('driver'));
    authenticate(customerUid, 'customer');
    const created = await call('/api/service-executions', 'POST', { sourceKind: 'service_contract', sourceId: 'service_contract_123', idempotencyKey: 'create:execution:123' });
    expect(created.status).toBe(201);
    const body: any = await created.json(), executionId = body.execution.executionId;
    expect(JSON.stringify(body)).not.toContain(customerUid);
    expect(JSON.stringify(body)).not.toContain(providerUid);
    expect(store.data(`serviceExecutions/${executionId}`)?.status).toBe('confirmed');
    expect([...store.documents.keys()].filter(key => key.startsWith('serviceExecutionEvents/'))).toHaveLength(1);
    authenticate(providerUid, 'driver');
    expect((await call(`/api/service-executions/${executionId}`)).status).toBe(200);
    authenticate(outsiderUid, 'customer'); store.put(`users/${outsiderUid}`, account('customer'));
    expect((await call(`/api/service-executions/${executionId}`)).status).toBe(404);
    store.put(`users/${providerUid}`, { ...account('driver'), accountStatus: 'restricted' });
    authenticate(providerUid, 'driver');
    expect((await call(`/api/service-executions/${executionId}`)).status).toBe(403);
    authenticate(customerUid, 'customer');
    expect((await call('/api/service-executions', 'POST', {
      sourceKind: 'service_contract', sourceId: 'service_contract_123', idempotencyKey: 'create:execution:123',
    })).status).toBe(403);
  });

  test('serializes transitions, binds idempotency, rejects photos, and preserves immutable event documents', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`users/${customerUid}`, account('customer')); store.put(`users/${providerUid}`, account('driver'));
    authenticate(customerUid, 'customer');
    const creation: any = await (await call('/api/service-executions', 'POST', { sourceKind: 'service_contract', sourceId: 'service_contract_123', idempotencyKey: 'create:execution:456' })).json();
    const executionId = creation.execution.executionId;
    authenticate(providerUid, 'driver');
    const input = { action: 'start', expectedRevision: 0, idempotencyKey: 'start:provider:123', evidence: { note: 'Started.' } };
    const responses = await Promise.all([
      call(`/api/service-executions/${executionId}/transitions`, 'POST', input),
      call(`/api/service-executions/${executionId}/transitions`, 'POST', input),
    ]);
    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(store.data(`serviceExecutions/${executionId}`)?.revision).toBe(1);
    expect([...store.documents.keys()].filter(key => key.startsWith('serviceExecutionEvents/'))).toHaveLength(2);
    expect((await call(`/api/service-executions/${executionId}/transitions`, 'POST', {
      action: 'record_progress', expectedRevision: 1, idempotencyKey: 'progress:provider:123', evidence: { photoReferences: ['https://public.example/evidence.jpg'] },
    })).status).toBe(400);
  });

  test('fails closed when the authoritative source is cancelled, expired, or otherwise no longer confirmed', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`users/${customerUid}`, account('customer')); store.put(`users/${providerUid}`, account('driver'));
    authenticate(customerUid, 'customer');
    const creation: any = await (await call('/api/service-executions', 'POST', {
      sourceKind: 'service_contract', sourceId: 'service_contract_123', idempotencyKey: 'create:execution:expired',
    })).json();
    __test.setServiceExecutionBinding(() => null);
    authenticate(providerUid, 'driver');
    const response = await call(`/api/service-executions/${creation.execution.executionId}/transitions`, 'POST', {
      action: 'start', expectedRevision: 0, idempotencyKey: 'start:expired:123',
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ errorCode: 'EXECUTION_SOURCE_CHANGED' });
    expect(store.data(`serviceExecutions/${creation.execution.executionId}`)?.revision).toBe(0);
  });

  test('uses Rental V2 as lifecycle authority and records evidence without mutating the rental', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    const rentalBinding = binding('equipment_rental');
    __test.setServiceExecutionBinding(() => rentalBinding);
    store.put(`users/${customerUid}`, account('customer')); store.put(`users/${providerUid}`, account('provider'));
    store.put('equipmentRequests/rental_request_123', { pricingModelVersion: 2, customerUid, providerUid, status: 'accepted', financialSnapshot: { immutable: true } });
    authenticate(customerUid, 'customer');
    const creation: any = await (await call('/api/service-executions', 'POST', { sourceKind: 'rental_request', sourceId: 'rental_request_123', idempotencyKey: 'create:rental:123' })).json();
    const before = store.data('equipmentRequests/rental_request_123');
    authenticate(providerUid, 'provider');
    const response = await call(`/api/service-executions/${creation.execution.executionId}/transitions`, 'POST', {
      action: 'record_handover', expectedRevision: 0, idempotencyKey: 'handover:provider:123', evidence: { note: 'Condition recorded.' },
    });
    expect(response.status).toBe(200);
    expect(store.data('equipmentRequests/rental_request_123')).toEqual(before);
    expect((await response.json() as any).execution).toMatchObject({ lifecycleAuthority: 'rental_v2', status: 'rental_managed', rentalStatus: 'accepted' });
  });
});
