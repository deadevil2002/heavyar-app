import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createHash, generateKeyPairSync } from 'node:crypto';
import worker, { __test, processPrivateEvidenceCleanup, type Env } from './index';
import { createScheduledGlobalBudget, createScheduledProcessorBudget, SCHEDULED_PROCESSOR_LIMITS } from './scheduled-budget';

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
    if (url.includes(':runQuery')) {
      const query = JSON.parse(String(init?.body || '{}')).structuredQuery || {};
      const collection = String(query.from?.[0]?.collectionId || '');
      const field = String(query.where?.fieldFilter?.field?.fieldPath || '');
      const upper = String(query.where?.fieldFilter?.value?.timestampValue || '');
      const rows = [...documents.entries()]
        .filter(([path, stored]) => path.startsWith(`${collection}/`) && (!field || stored.fields[field] !== undefined && String(decodeValue(stored.fields[field]) || '') <= upper))
        .sort(([, left], [, right]) => String(decodeValue(left.fields[field]) || '').localeCompare(String(decodeValue(right.fields[field]) || '')))
        .slice(0, Number(query.limit || 20))
        .map(([path, stored]) => ({ document: document(path, stored) }));
      return Response.json(rows);
    }
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
const call = (path: string, method = 'GET', body?: unknown, targetEnv: Env = env) => worker.fetch(new Request(`https://worker.test${path}`, {
  method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), targetEnv);
const callForm = (path: string, form: FormData, targetEnv: Env) => worker.fetch(new Request(`https://worker.test${path}`, {
  method: 'POST', headers: { Authorization: 'Bearer test' }, body: form,
}), targetEnv);

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
    expect((await call(`/api/service-executions/execution_${'e'.repeat(43)}/evidence-media`, 'POST', {})).status).toBe(404);
  });

  test('persists a server-bound execution, restores it after requests, and isolates participants', async () => {
    const store = firestoreHarness(); globalThis.fetch = store.fetch;
    store.put(`users/${customerUid}`, account('customer')); store.put(`users/${providerUid}`, account('driver'));
    authenticate(customerUid, 'customer');
    const created = await call('/api/service-executions', 'POST', { sourceKind: 'service_contract', sourceId: 'service_contract_123', idempotencyKey: 'create:execution:123' });
    expect(created.status).toBe(201);
    const body: any = await created.json(), executionId = body.execution.executionId;
    expect(body.evidenceMedia).toEqual({
      enabled: false,
      reason: 'disabled_pending_authenticated_private_media_delivery',
      limits: { maxFilesPerEvent: 3, maxFileBytes: 5 * 1024 * 1024 },
    });
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
    expect((await call(`/api/service-executions/${executionId}/transitions`, 'POST', {
      action: 'record_progress', expectedRevision: 1, idempotencyKey: 'progress:provider:456', evidence: { mediaIntentId: `evidence_intent_${'i'.repeat(43)}` },
    })).status).toBe(400);
  });

  test('uploads authenticated stripped evidence, atomically binds it, and grants only short participant access', async () => {
    const store = firestoreHarness(), secret = 'test-cloudinary-secret';
    let observedUpload: Record<string, string> | null = null, destroyCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('api.cloudinary.com') && url.endsWith('/image/upload')) {
        const form = init?.body as FormData;
        const publicId = String(form.get('public_id') || '');
        observedUpload = {
          publicId,
          type: String(form.get('type') || ''),
          transformation: String(form.get('transformation') || ''),
          overwrite: String(form.get('overwrite') || ''),
        };
        const version = 17;
        const signature = createHash('sha1').update(`public_id=${publicId}&version=${version}${secret}`).digest('hex');
        return Response.json({
          asset_id: 'asset_private_123', public_id: publicId, resource_type: 'image', type: 'authenticated',
          version, signature, format: 'jpg', bytes: 4, width: 640, height: 480,
          secure_url: `https://res.cloudinary.com/should-not-persist/${publicId}.jpg`,
        });
      }
      if (url.includes('api.cloudinary.com') && url.endsWith('/image/destroy')) {
        destroyCalls += 1;
        return Response.json({ result: 'ok' });
      }
      return store.fetch(input, init);
    }) as typeof globalThis.fetch;
    const mediaEnv = {
      ...env,
      CLOUDINARY_CLOUD_NAME: 'heavyar-cloud', CLOUDINARY_API_KEY: 'test-cloudinary-key',
      CLOUDINARY_API_SECRET: secret, CLOUDINARY_FOLDER: 'heavyar',
    } as Env;
    store.put(`users/${customerUid}`, account('customer')); store.put(`users/${providerUid}`, account('driver'));
    authenticate(customerUid, 'customer');
    const creation: any = await (await call('/api/service-executions', 'POST', {
      sourceKind: 'service_contract', sourceId: 'service_contract_123', idempotencyKey: 'create:execution:media',
    }, mediaEnv)).json();
    const executionId = creation.execution.executionId;
    expect(creation.evidenceMedia.enabled).toBe(true);
    authenticate(providerUid, 'driver');
    const intentResponse = await call(`/api/service-executions/${executionId}/evidence-media/intents`, 'POST', {
      expectedRevision: 0,
      action: 'start',
      idempotencyKey: 'evidence:start:media',
      files: [{ clientFileId: 'client_file_123456', mimeType: 'image/jpeg', sizeBytes: 4, width: 640, height: 480 }],
    }, mediaEnv);
    expect(intentResponse.status).toBe(201);
    const intent: any = await intentResponse.json();
    expect(JSON.stringify(intent)).not.toMatch(/publicId|secure_url|api_key/i);
    const form = () => { const value = new FormData(); value.append('file', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }), 'evidence.jpg'); return value; };
    const uploads = await Promise.all([callForm(intent.files[0].uploadPath, form(), mediaEnv), callForm(intent.files[0].uploadPath, form(), mediaEnv)]);
    expect(uploads.filter(response => response.status === 200)).toHaveLength(1);
    expect(uploads.every(response => [200, 409, 502].includes(response.status))).toBe(true);
    expect(observedUpload).toEqual(expect.objectContaining({ type: 'authenticated', transformation: 'fl_force_strip', overwrite: 'false' }));
    const transitioned = await call(`/api/service-executions/${executionId}/transitions`, 'POST', {
      action: 'start', expectedRevision: 0, idempotencyKey: 'start:provider:media', evidence: { mediaIntentId: intent.intentId },
    }, mediaEnv);
    expect(transitioned.status).toBe(200);
    const detail: any = await transitioned.json(), event = detail.execution.events[1];
    expect(event.evidence.media).toEqual([{ mediaId: intent.files[0].mediaId }]);
    expect(JSON.stringify(detail)).not.toMatch(/mediaIntentId|publicId|secure_url|provider_uid/i);
    expect(store.data(`serviceEvidenceUploadIntents/${intent.intentId}`)?.state).toBe('attached');
    const access = await call(`/api/service-executions/${executionId}/events/${event.eventId}/evidence/${intent.files[0].mediaId}/access`, 'GET', undefined, mediaEnv);
    expect(access.status).toBe(200);
    const grant: any = await access.json(), grantUrl = new URL(grant.url);
    expect(grantUrl.hostname).toBe('api.cloudinary.com');
    expect(grantUrl.pathname).toContain('/image/download');
    expect(Number(grantUrl.searchParams.get('expires_at')) - Number(grantUrl.searchParams.get('timestamp'))).toBeLessThanOrEqual(60);
    authenticate(outsiderUid, 'customer'); store.put(`users/${outsiderUid}`, account('customer'));
    expect((await call(`/api/service-executions/${executionId}/events/${event.eventId}/evidence/${intent.files[0].mediaId}/access`, 'GET', undefined, mediaEnv)).status).toBe(404);
    await processPrivateEvidenceCleanup(mediaEnv, '2030-01-01T00:00:00.000Z');
    expect(destroyCalls).toBe(0);
    expect(store.data(`serviceEvidenceUploadIntents/${intent.intentId}`)?.state).toBe('attached');
  });

  test('claims expired evidence before deletion so a concurrent event binding cannot win', async () => {
    const store = firestoreHarness(), secret = 'test-cloudinary-secret';
    let destroyCalls = 0, releaseDestroy!: () => void, signalDestroy!: () => void;
    const destroyGate = new Promise<void>(resolve => { releaseDestroy = resolve; });
    const destroyStarted = new Promise<void>(resolve => { signalDestroy = resolve; });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('api.cloudinary.com') && url.endsWith('/image/upload')) {
        const publicId = String((init?.body as FormData).get('public_id') || ''), version = 21;
        return Response.json({
          asset_id: 'asset_cleanup_claim', public_id: publicId, resource_type: 'image', type: 'authenticated',
          version, signature: createHash('sha1').update(`public_id=${publicId}&version=${version}${secret}`).digest('hex'),
          format: 'jpg', bytes: 4, width: 640, height: 480,
        });
      }
      if (url.includes('api.cloudinary.com') && url.endsWith('/image/destroy')) {
        destroyCalls += 1; signalDestroy(); await destroyGate;
        return Response.json({ result: 'ok' });
      }
      return store.fetch(input, init);
    }) as typeof globalThis.fetch;
    const mediaEnv = { ...env, CLOUDINARY_CLOUD_NAME: 'heavyar-cloud', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: secret, CLOUDINARY_FOLDER: 'heavyar' } as Env;
    store.put(`users/${customerUid}`, account('customer')); store.put(`users/${providerUid}`, account('driver'));
    authenticate(customerUid, 'customer');
    const created: any = await (await call('/api/service-executions', 'POST', {
      sourceKind: 'service_contract', sourceId: 'service_contract_123', idempotencyKey: 'create:execution:cleanup-claim',
    }, mediaEnv)).json();
    authenticate(providerUid, 'driver');
    const intent: any = await (await call(`/api/service-executions/${created.execution.executionId}/evidence-media/intents`, 'POST', {
      expectedRevision: 0, action: 'start', idempotencyKey: 'evidence:start:cleanup-claim',
      files: [{ clientFileId: 'client_file_cleanup1', mimeType: 'image/jpeg', sizeBytes: 4, width: 640, height: 480 }],
    }, mediaEnv)).json();
    const form = new FormData(); form.append('file', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }), 'evidence.jpg');
    expect((await callForm(intent.files[0].uploadPath, form, mediaEnv)).status).toBe(200);

    const budget = createScheduledProcessorBudget(createScheduledGlobalBudget(), 'processPrivateEvidenceCleanup');
    const cleanup = processPrivateEvidenceCleanup({ ...mediaEnv, __scheduledBudget: budget }, '2030-01-01T00:00:00.000Z');
    await destroyStarted;
    expect(store.data(`serviceEvidenceUploadIntents/${intent.intentId}`)?.state).toBe('cleanup_claimed');
    const transition = await call(`/api/service-executions/${created.execution.executionId}/transitions`, 'POST', {
      action: 'start', expectedRevision: 0, idempotencyKey: 'start:provider:cleanup-claim', evidence: { mediaIntentId: intent.intentId },
    }, mediaEnv);
    expect(transition.status).toBe(409);
    releaseDestroy(); await cleanup;
    expect(store.data(`serviceEvidenceUploadIntents/${intent.intentId}`)?.state).toBe('cleanup_complete');
    expect(budget.state.workUsed).toBeLessThanOrEqual(SCHEDULED_PROCESSOR_LIMITS.processPrivateEvidenceCleanup.work);
    await processPrivateEvidenceCleanup(mediaEnv, '2030-01-01T00:10:00.000Z');
    expect(destroyCalls).toBe(1);
  });

  test('backs failed cleanup off without blocking a later intent and retries idempotently', async () => {
    const store = firestoreHarness(), secret = 'test-cloudinary-secret', uploadedPublicIds: string[] = [], destroyAttempts = new Map<string, number>();
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('api.cloudinary.com') && url.endsWith('/image/upload')) {
        const publicId = String((init?.body as FormData).get('public_id') || ''), version = 22 + uploadedPublicIds.length;
        uploadedPublicIds.push(publicId);
        return Response.json({
          asset_id: `asset_cleanup_${uploadedPublicIds.length}`, public_id: publicId, resource_type: 'image', type: 'authenticated',
          version, signature: createHash('sha1').update(`public_id=${publicId}&version=${version}${secret}`).digest('hex'),
          format: 'jpg', bytes: 4, width: 640, height: 480,
        });
      }
      if (url.includes('api.cloudinary.com') && url.endsWith('/image/destroy')) {
        const publicId = String((init?.body as FormData).get('public_id') || '');
        const attempt = (destroyAttempts.get(publicId) || 0) + 1; destroyAttempts.set(publicId, attempt);
        if (publicId === uploadedPublicIds[0] && attempt === 1) return Response.json({ result: 'error' }, { status: 503 });
        return Response.json({ result: attempt > 1 ? 'not found' : 'ok' });
      }
      return store.fetch(input, init);
    }) as typeof globalThis.fetch;
    const mediaEnv = { ...env, CLOUDINARY_CLOUD_NAME: 'heavyar-cloud', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: secret, CLOUDINARY_FOLDER: 'heavyar' } as Env;
    store.put(`users/${customerUid}`, account('customer')); store.put(`users/${providerUid}`, account('driver'));
    authenticate(customerUid, 'customer');
    const created: any = await (await call('/api/service-executions', 'POST', {
      sourceKind: 'service_contract', sourceId: 'service_contract_123', idempotencyKey: 'create:execution:cleanup-retry',
    }, mediaEnv)).json();
    authenticate(providerUid, 'driver');
    const intents: any[] = [];
    for (const suffix of ['first', 'second']) {
      const response = await call(`/api/service-executions/${created.execution.executionId}/evidence-media/intents`, 'POST', {
        expectedRevision: 0, action: 'start', idempotencyKey: `evidence:start:${suffix}:cleanup`,
        files: [{ clientFileId: `client_file_${suffix}1`, mimeType: 'image/jpeg', sizeBytes: 4, width: 640, height: 480 }],
      }, mediaEnv);
      const intent: any = await response.json(); intents.push(intent);
      const form = new FormData(); form.append('file', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }), 'evidence.jpg');
      expect((await callForm(intent.files[0].uploadPath, form, mediaEnv)).status).toBe(200);
    }

    const due = '2030-01-01T00:00:00.000Z';
    await processPrivateEvidenceCleanup(mediaEnv, due);
    expect(store.data(`serviceEvidenceUploadIntents/${intents[0].intentId}`)?.state).toBe('abandoned');
    await processPrivateEvidenceCleanup(mediaEnv, due);
    expect(store.data(`serviceEvidenceUploadIntents/${intents[1].intentId}`)?.state).toBe('cleanup_complete');
    const attemptsAfterSecond = [...destroyAttempts.values()].reduce((sum, value) => sum + value, 0);
    await processPrivateEvidenceCleanup(mediaEnv, due);
    expect([...destroyAttempts.values()].reduce((sum, value) => sum + value, 0)).toBe(attemptsAfterSecond);
    await processPrivateEvidenceCleanup(mediaEnv, '2030-01-01T00:05:00.000Z');
    expect(store.data(`serviceEvidenceUploadIntents/${intents[0].intentId}`)?.state).toBe('cleanup_complete');
    expect(destroyAttempts.get(uploadedPublicIds[0])).toBe(2);
  });

  test('rejects a forged Cloudinary upload receipt without attaching evidence', async () => {
    const store = firestoreHarness(), secret = 'test-cloudinary-secret';
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('api.cloudinary.com') && url.endsWith('/image/upload')) {
        const publicId = String((init?.body as FormData).get('public_id') || '');
        return Response.json({
          asset_id: 'asset_forged_123', public_id: publicId, resource_type: 'image', type: 'authenticated',
          version: 1, signature: '0'.repeat(40), format: 'jpg', bytes: 4, width: 640, height: 480,
        });
      }
      return store.fetch(input, init);
    }) as typeof globalThis.fetch;
    const mediaEnv = { ...env, CLOUDINARY_CLOUD_NAME: 'heavyar-cloud', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: secret, CLOUDINARY_FOLDER: 'heavyar' } as Env;
    store.put(`users/${customerUid}`, account('customer')); store.put(`users/${providerUid}`, account('driver'));
    authenticate(customerUid, 'customer');
    const created: any = await (await call('/api/service-executions', 'POST', {
      sourceKind: 'service_contract', sourceId: 'service_contract_123', idempotencyKey: 'create:execution:forged',
    }, mediaEnv)).json();
    authenticate(providerUid, 'driver');
    const intent: any = await (await call(`/api/service-executions/${created.execution.executionId}/evidence-media/intents`, 'POST', {
      expectedRevision: 0, action: 'start', idempotencyKey: 'evidence:start:forged',
      files: [{ clientFileId: 'client_file_forged1', mimeType: 'image/jpeg', sizeBytes: 4, width: 640, height: 480 }],
    }, mediaEnv)).json();
    const form = new FormData(); form.append('file', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }), 'evidence.jpg');
    const response = await callForm(intent.files[0].uploadPath, form, mediaEnv);
    expect(response.status).toBe(502);
    expect(store.data(`serviceEvidenceUploadIntents/${intent.intentId}`)?.state).toBe('pending');
    expect(JSON.parse(store.data(`serviceEvidenceUploadIntents/${intent.intentId}`)?.intentJson).files[0].upload).toBeUndefined();
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
