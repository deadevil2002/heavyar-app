import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import worker, { __test, processRentalExpiryReminders, type Env } from './index';
import { createScheduledGlobalBudget, createScheduledProcessorBudget, SCHEDULED_PROCESSOR_LIMITS } from './scheduled-budget';

const DB = '/databases/(default)/documents';
const START = '2099-09-20T08:00:00.000Z';
const END = '2099-09-20T10:00:00.000Z';
const EXTENDED_END = '2099-09-20T12:00:00.000Z';
let privateKey = '';
let projectSequence = 0;

type Json = Record<string, any>;
type QueryHandler = (body: Json, call: number) => Json[];
type CommitHandler = (body: Json, call: number) => Response | Promise<Response>;

function value(input: any): any {
  if (input === null) return { nullValue: null };
  if (typeof input === 'boolean') return { booleanValue: input };
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Non-finite Firestore fixture number');
    return Number.isSafeInteger(input) ? { integerValue: String(input) } : { doubleValue: input };
  }
  if (typeof input === 'string') return { stringValue: input };
  if (Array.isArray(input)) return { arrayValue: { values: input.map(value) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(input).map(([key, item]) => [key, value(item)])) } };
}

function document(project: string, path: string, data: Json, updateTime = '2099-01-01T00:00:00.000001Z') {
  return {
    name: `projects/${project}${DB}/${path}`,
    fields: Object.fromEntries(Object.entries(data).map(([key, item]) => [key, value(item)])),
    updateTime,
  };
}

function v2Request(overrides: Json = {}) {
  return {
    pricingModelVersion: 2,
    equipmentId: 'eq_1',
    providerUid: 'provider',
    customerUid: 'customer',
    categoryId: 'excavators',
    countryCode: 'SA',
    status: 'pending',
    rentalMode: 'hourly',
    rateUnit: 'hourly',
    requestedStartAt: START,
    requestedEndAt: END,
    createdAt: '2099-01-01T00:00:00.000Z',
    updatedAt: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function lockedCommercial(baseAmountMinor = 24_000) {
  return {
    ruleVersion: 'legacy-commission-v1', ruleStatus: 'active', mode: 'percentage', percentageBps: 1000,
    fixedAmountMinor: 0, minimumFeeMinor: 0, maximumFeeMinor: null, payer: 'provider', customerShareBps: 0,
    scope: { countryCode: 'SA', categoryId: 'excavators', providerUid: null }, baseAmountMinor,
    platformFeeMinor: Math.round(baseAmountMinor / 10), customerFeeMinor: 0,
    providerFeeMinor: Math.round(baseAmountMinor / 10), providerReceivableMinor: Math.round(baseAmountMinor * 0.9),
    customerPayableMinor: baseAmountMinor, taxAmountMinor: 0, taxRateBps: 0, gatewayFeeMinor: null,
    currency: 'SAR', countryCode: 'SA', categoryId: 'excavators', providerUid: 'provider', calculatedAt: START,
  };
}

function extensionReadyRequest(overrides: Json = {}) {
  return v2Request({
    status: 'accepted',
    pricingSnapshot: {
      pricingModelVersion: 2, calculationVersion: 2, rateUnit: 'hourly', rateAmountMinor: 12_000,
      currency: 'SAR', currencyDecimals: 2, marketTimezone: 'Asia/Riyadh',
    },
    commercialSnapshot: lockedCommercial(),
    ...overrides,
  });
}

function queryFilter(body: Json) {
  const query = body.structuredQuery;
  if (query?.from?.[0]?.collectionId === 'rentalExpiryReminderJobs') {
    expect(query.limit).toBe(3);
    expect(query.where?.fieldFilter).toMatchObject({ field: { fieldPath: 'dueAt' }, op: 'LESS_THAN_OR_EQUAL' });
    return { family: 'rental-expiry', limit: query.limit as number };
  }
  const expected = [
    ...__test.availabilityQueriesForEquipment('eq_1', { startAt: START, endAt: END }),
    ...__test.availabilityQueriesForEquipment('eq_1', { startAt: END, endAt: EXTENDED_END }),
    ...__test.availabilityQueriesForEquipment('eq_1', { startAt: '1970-01-01T00:00:00.000Z', endAt: null }),
    ...__test.availabilityQueriesForEquipment('eq_1', { startAt: '2099-09-20T00:00:00.000Z', endAt: '2099-09-21T00:00:00.000Z' }),
  ];
  const match = expected.find(candidate => JSON.stringify(candidate.structuredQuery) === JSON.stringify(query));
  expect(match).not.toBeUndefined();
  return { family: match!.family, limit: query.limit as number };
}

class FirestoreRest {
  readonly project = `rental-v2-rest-${++projectSequence}`;
  readonly env: Env;
  readonly base: string;
  readonly documents = new Map<string, Json>();
  readonly operations: string[] = [];
  readonly queryBodies: Json[] = [];
  readonly commitBodies: Json[] = [];
  query: QueryHandler = () => [];
  commit: CommitHandler = () => Response.json({ writeResults: [] });
  private transactionSequence = 0;
  private queryCalls = 0;
  private commitCalls = 0;

  constructor() {
    this.env = {
      FIREBASE_PROJECT_ID: this.project,
      FIREBASE_CLIENT_EMAIL: `${this.project}@example.test`,
      FIREBASE_PRIVATE_KEY: privateKey,
    };
    this.base = `https://firestore.googleapis.com/v1/projects/${this.project}${DB}`;
  }

  put(path: string, data: Json, updateTime?: string) {
    this.documents.set(path, document(this.project, path, data, updateTime));
  }

  install() {
    globalThis.fetch = this.fetch as typeof fetch;
  }

  private fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const method = String(init.method || 'GET').toUpperCase();
    if (url === 'https://oauth2.googleapis.com/token') {
      expect(method).toBe('POST');
      expect(new Headers(init.headers).get('Content-Type')).toBe('application/x-www-form-urlencoded');
      expect(String(init.body)).toMatch(/^grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=[^.]+\.[^.]+\.[^.]+$/);
      return Response.json({ access_token: 'local-token', expires_in: 3600 });
    }
    if (!url.startsWith(this.base)) throw new Error(`Unexpected network URL: ${url}`);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer local-token');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');

    const suffix = url.slice(this.base.length);
    if (suffix === ':beginTransaction') {
      expect(method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ options: { readWrite: {} } });
      const transaction = `tx-${++this.transactionSequence}`;
      this.operations.push(`begin:${transaction}`);
      return Response.json({ transaction });
    }
    if (suffix === ':runQuery') {
      expect(method).toBe('POST');
      const body = JSON.parse(String(init.body));
      expect(Object.keys(body).sort()).toEqual(body.transaction ? ['structuredQuery', 'transaction'] : ['structuredQuery']);
      queryFilter(body);
      this.queryBodies.push(body);
      this.operations.push(`query:${body.transaction || 'none'}`);
      return Response.json(this.query(body, ++this.queryCalls));
    }
    if (suffix === ':batchGet') {
      expect(method).toBe('POST');
      const body = JSON.parse(String(init.body));
      expect(Array.isArray(body.documents)).toBe(true);
      this.operations.push(`batchGet:${body.transaction || 'none'}`);
      return Response.json(body.documents.map((name: string) => {
        const path = name.split('/documents/')[1] || '';
        const stored = this.documents.get(path);
        return stored ? { found: stored } : { missing: name };
      }));
    }
    if (suffix === ':commit') {
      expect(method).toBe('POST');
      const body = JSON.parse(String(init.body));
      expect(Object.keys(body).sort()).toEqual(body.transaction ? ['transaction', 'writes'] : ['writes']);
      expect(Array.isArray(body.writes)).toBe(true);
      this.commitBodies.push(body);
      this.operations.push(`commit:${body.transaction || 'none'}`);
      return this.commit(body, ++this.commitCalls);
    }
    if (method !== 'GET' || !suffix.startsWith('/')) throw new Error(`Unexpected Firestore operation: ${method} ${url}`);
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname.slice(parsed.pathname.indexOf(`${DB}/`) + DB.length + 1));
    const transaction = parsed.searchParams.get('transaction');
    if (parsed.search && (!transaction || [...parsed.searchParams.keys()].some(key => key !== 'transaction'))) {
      throw new Error(`Unexpected document query: ${url}`);
    }
    this.operations.push(`document:${path}:${transaction || 'none'}`);
    const stored = this.documents.get(path);
    return stored ? Response.json(stored) : Response.json({ error: { status: 'NOT_FOUND' } }, { status: 404 });
  };
}

function transition(requestId: string, action: string) {
  return new Request(`https://api.test/api/requests/${requestId}/transition`, {
    method: 'POST',
    headers: { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

beforeAll(async () => {
  const keys = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 1024, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  privateKey = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey))));
});

afterEach(() => {
  __test.setAuth();
  __test.setFirestore();
  __test.captureCommits();
  __test.captureWrites();
  globalThis.fetch = originalFetch;
});

const originalFetch = globalThis.fetch;

describe('Rental V2 real Firestore REST contracts', () => {
  it('decodes standard Firestore integers in V2 listings and the commercial catalog', async () => {
    const rest = new FirestoreRest();
    rest.put('equipment/eq_1', {
      ownerUid: 'provider', category: 'other', countryCode: 'SA', nativeCurrency: 'SAR',
      pricingModelVersion: 2,
      pricing: {
        currency: 'SAR',
        hourly: { enabled: true, amountMinor: 12000 },
        daily: { enabled: false, amountMinor: 0 },
      },
      isActive: true, visibility: 'visible', moderationStatus: 'approved',
      availability: { from: '2099-01-01' },
    });
    rest.put('commercialSettings/catalog', {
      revision: 7,
      rules: [{
        version: '00000000-0000-4000-8000-000000000001', status: 'active',
        effectiveFrom: '1970-01-01T00:00:00.000Z', effectiveTo: null,
        createdAt: '2029-01-01T00:00:00.000Z', createdBy: 'admin',
        updatedAt: '2029-01-01T00:00:00.000Z', updatedBy: 'admin', notes: '',
        mode: 'percentage', percentageBps: 1000, fixedAmountMinor: 0,
        minimumFeeMinor: 0, maximumFeeMinor: null, payer: 'provider',
        customerShareBps: 0,
        scope: { countryCode: 'SA', categoryId: 'other', providerUid: null },
        currency: 'SAR',
      }],
    });
    rest.install();
    __test.setAuth({ uid: 'customer', admin: false, emailVerified: true });

    const response = await worker.fetch(new Request('https://api.test/api/requests/estimate', {
      method: 'POST',
      headers: { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pricingModelVersion: 2, equipmentId: 'eq_1',
        rentalMode: 'hourly', rateUnit: 'hourly',
        requestedStartAt: START, requestedEndAt: END,
        expectedRateAmountMinor: 12000,
      }),
    }), rest.env);
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body).toMatchObject({
      estimate: {
        pricingModelVersion: 2,
        rateAmountMinor: 12000,
        commercial: {
          ruleVersion: '00000000-0000-4000-8000-000000000001',
          percentageBps: 1000,
          baseAmountMinor: 24000,
          platformFeeMinor: 2400,
          providerReceivableMinor: 21600,
        },
      },
    });
    expect(typeof body.estimate.pricingModelVersion).toBe('number');
    for (const field of ['percentageBps', 'baseAmountMinor', 'platformFeeMinor', 'providerReceivableMinor']) {
      expect(Number.isSafeInteger(body.estimate.commercial[field])).toBe(true);
    }
    expect(rest.documents.get('equipment/eq_1')?.fields.pricingModelVersion).toEqual({ integerValue: '2' });
    expect(rest.documents.get('commercialSettings/catalog')?.fields.revision).toEqual({ integerValue: '7' });
    expect(rest.queryBodies).toHaveLength(3);
    expect(rest.queryBodies.map(body => queryFilter(body).family).sort()).toEqual(['legacy-fixed', 'legacy-open', 'v2']);
  });

  it('propagates the acceptance transaction to the native OR query, fence read, and commit', async () => {
    const rest = new FirestoreRest();
    rest.put('equipmentRequests/r_v2', v2Request(), 'request-v1');
    rest.put('equipment/eq_1', { countryCode: 'SA', availability: { from: '2099-01-01' } }, 'equipment-v1');
    rest.install();
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });

    const response = await worker.fetch(transition('r_v2', 'accept'), rest.env);
    expect(response.status).toBe(200);
    expect(rest.queryBodies).toHaveLength(3);
    expect(rest.queryBodies.every(body => body.transaction === 'tx-1')).toBe(true);
    expect(rest.queryBodies.map(body => queryFilter(body).family).sort()).toEqual(['legacy-fixed', 'legacy-open', 'v2']);
    expect(rest.operations).toContain('document:equipmentBookingFences/eq_1:tx-1');
    expect(rest.commitBodies).toHaveLength(1);
    expect(rest.commitBodies[0].transaction).toBe('tx-1');
    expect(rest.commitBodies[0].writes[1]).toMatchObject({
      update: { name: `projects/${rest.project}${DB}/equipmentBookingFences/eq_1` },
      currentDocument: { exists: false },
    });
  });

  it('uses the fence CAS so two concurrent overlapping V2 accepts cannot both commit', async () => {
    const rest = new FirestoreRest();
    rest.put('equipmentRequests/r_a', v2Request(), 'request-a-v1');
    rest.put('equipmentRequests/r_b', v2Request(), 'request-b-v1');
    rest.put('equipment/eq_1', { countryCode: 'SA', availability: { from: '2099-01-01' } }, 'equipment-v1');
    let winner = '';
    let firstRoundCommits = 0;
    let releaseFirstRound!: () => void;
    const firstRound = new Promise<void>(resolve => { releaseFirstRound = resolve; });
    rest.query = body => {
      const { family } = queryFilter(body);
      if (family !== 'v2') return [];
      if (winner) {
        return [{ document: document(rest.project, `equipmentRequests/${winner}`, v2Request({ status: 'accepted' })) }];
      }
      return [];
    };
    rest.commit = async body => {
      if (!winner) {
        firstRoundCommits += 1;
        if (firstRoundCommits === 2) releaseFirstRound();
        await firstRound;
        const requestName = body.writes[0].update.name as string;
        const requestId = requestName.split('/').pop()!;
        if (!winner) {
          winner = requestId;
          return Response.json({ writeResults: [] });
        }
        return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 409 });
      }
      throw new Error('A retry that observes the accepted overlap must not commit');
    };
    rest.install();
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });

    const responses = await Promise.all([
      worker.fetch(transition('r_a', 'accept'), rest.env),
      worker.fetch(transition('r_b', 'accept'), rest.env),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const failures = await Promise.all(responses.filter(response => response.status === 409).map(response => response.json() as Promise<any>));
    expect(failures[0].errorCode).toBe('ACTIVE_RENTAL_OVERLAP');
    expect(firstRoundCommits).toBe(2);
    for (const body of rest.commitBodies.slice(0, 2)) {
      expect(body.writes[1].currentDocument).toEqual({ exists: false });
      expect(body.transaction).toMatch(/^tx-[12]$/);
    }
  });

  it('fails closed when the native OR query fills its 101-document cap', async () => {
    const rest = new FirestoreRest();
    rest.put('equipmentRequests/r_budget', v2Request(), 'request-budget-v1');
    rest.query = body => {
      const { family } = queryFilter(body);
      if (family !== 'v2') return [];
      return Array.from({ length: 101 }, (_, index) => ({
        document: document(rest.project, `equipmentRequests/cap-${index}`, v2Request({ status: 'accepted' })),
      }));
    };
    rest.install();
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });

    const response = await worker.fetch(transition('r_budget', 'accept'), rest.env);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ errorCode: 'AVAILABILITY_CAP_EXHAUSTED' });
    expect(rest.queryBodies).toHaveLength(3);
    expect(rest.commitBodies).toHaveLength(0);
  });

  it('creates one immutable extension request and rejects a concurrent duplicate', async () => {
    const rest = new FirestoreRest();
    rest.put('equipmentRequests/r_extension', extensionReadyRequest(), 'request-extension-v1');
    rest.put('equipment/eq_1', { ownerUid: 'provider', countryCode: 'SA', availability: { from: '2099-01-01', blocked: [] } }, 'equipment-v1');
    let winner = '';
    let firstRoundCommits = 0;
    let release!: () => void;
    const firstRound = new Promise<void>(resolve => { release = resolve; });
    rest.commit = async body => {
      firstRoundCommits += 1;
      if (firstRoundCommits === 2) release();
      await firstRound;
      const extensionWrite = body.writes.find((write: Json) => String(write.update?.name || '').includes('/rentalExtensions/'));
      const extensionId = String(extensionWrite?.update?.name || '').split('/').pop() || '';
      if (!winner) {
        winner = extensionId;
        rest.put('equipmentRequests/r_extension', extensionReadyRequest({ pendingExtensionId: extensionId, extensionStatus: 'pending_provider' }), 'request-extension-v2');
        return Response.json({ writeResults: [] });
      }
      return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 409 });
    };
    rest.install();
    __test.setAuth({ uid: 'customer', admin: false, emailVerified: true });
    const create = () => worker.fetch(new Request('https://api.test/api/requests/r_extension/extensions', {
      method: 'POST', headers: { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposedEndAt: EXTENDED_END, expectedAdditionalBaseAmountMinor: 24_000 }),
    }), rest.env);

    const responses = await Promise.all([create(), create()]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    const success: any = await responses.find(response => response.status === 201)!.json();
    const conflict: any = await responses.find(response => response.status === 409)!.json();
    expect(success.extension).toMatchObject({ id: winner, status: 'pending_provider', originalEndAt: END, proposedEndAt: EXTENDED_END, additionalBaseAmountMinor: 24_000, paymentActivation: 'blocked_unverified' });
    expect(conflict.errorCode).toBe('EXTENSION_ALREADY_PENDING');
    const winningCommit = rest.commitBodies.find(body => body.writes.some((write: Json) => String(write.update?.name || '').endsWith(`/rentalExtensions/${winner}`)));
    expect(Boolean(winningCommit)).toBe(true);
    const requestWrite = winningCommit!.writes.find((write: Json) => String(write.update?.name || '').endsWith('/equipmentRequests/r_extension'));
    expect(Object.keys(requestWrite.update.fields).sort()).toEqual(['extensionStatus', 'pendingExtensionId', 'updatedAt']);
    expect(requestWrite.update.fields.requestedEndAt).toBeUndefined();
  });

  it('keeps provider approval at awaiting payment and leaves the original rental end unchanged', async () => {
    const rest = new FirestoreRest();
    const extensionId = 'ext_0123456789abcdef';
    rest.put('equipmentRequests/r_review', extensionReadyRequest({ pendingExtensionId: extensionId, extensionStatus: 'pending_provider' }), 'request-review-v1');
    rest.put(`rentalExtensions/${extensionId}`, {
      requestId: 'r_review', equipmentId: 'eq_1', customerUid: 'customer', providerUid: 'provider', status: 'pending_provider',
      originalEndAt: END, proposedEndAt: EXTENDED_END, additionalDurationMinutes: 120, additionalBillableUnits: 120,
      additionalBaseAmountMinor: 24_000, currency: 'SAR', currencyDecimals: 2, rateUnit: 'hourly',
      expiresAt: END, paymentActivation: 'blocked_unverified', createdAt: START, updatedAt: START,
    }, 'extension-v1');
    rest.put('equipment/eq_1', { ownerUid: 'provider', countryCode: 'SA', availability: { from: '2099-01-01', blocked: [] } }, 'equipment-v1');
    rest.install();
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });

    const response = await worker.fetch(new Request(`https://api.test/api/requests/r_review/extensions/${extensionId}/approve`, {
      method: 'POST', headers: { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' }, body: '{}',
    }), rest.env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ extensionConfirmed: false, paymentActivation: 'blocked_unverified', extension: { status: 'awaiting_payment_integration' } });
    const requestWrite = rest.commitBodies[0].writes.find((write: Json) => String(write.update?.name || '').endsWith('/equipmentRequests/r_review'));
    expect(Object.keys(requestWrite.update.fields).sort()).toEqual(['extensionStatus', 'updatedAt']);
    expect(requestWrite.update.fields.requestedEndAt).toBeUndefined();
  });

  it('allows only the provider to decline and clears the pending pointer without changing the rental end', async () => {
    const rest = new FirestoreRest();
    const extensionId = 'ext_0123456789abcdef';
    rest.put('equipmentRequests/r_decline', extensionReadyRequest({ pendingExtensionId: extensionId, extensionStatus: 'pending_provider' }), 'request-decline-v1');
    rest.put(`rentalExtensions/${extensionId}`, {
      requestId: 'r_decline', equipmentId: 'eq_1', customerUid: 'customer', providerUid: 'provider', status: 'pending_provider',
      originalEndAt: END, proposedEndAt: EXTENDED_END, additionalDurationMinutes: 1_440, additionalBillableUnits: 1,
      additionalBaseAmountMinor: 24_000, currency: 'SAR', currencyDecimals: 2, rateUnit: 'daily',
      expiresAt: END, createdAt: '2099-09-01T00:00:00.000Z', updatedAt: '2099-09-01T00:00:00.000Z',
    }, 'extension-decline-v1');
    rest.install();
    const decline = () => worker.fetch(new Request(`https://api.test/api/requests/r_decline/extensions/${extensionId}/decline`, {
      method: 'POST', headers: { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' }, body: '{}',
    }), rest.env);

    __test.setAuth({ uid: 'customer', admin: false, emailVerified: true });
    expect((await decline()).status).toBe(404);
    expect(rest.commitBodies).toHaveLength(0);

    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });
    const response = await decline();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ extensionConfirmed: false, paymentActivation: 'blocked_unverified', extension: { status: 'declined' } });
    const requestWrite = rest.commitBodies[0].writes.find((write: Json) => String(write.update?.name || '').endsWith('/equipmentRequests/r_decline'));
    expect(Object.keys(requestWrite.update.fields).sort()).toEqual(['extensionStatus', 'pendingExtensionId', 'updatedAt']);
    expect(requestWrite.update.fields.pendingExtensionId).toEqual({ stringValue: '' });
    expect(requestWrite.update.fields.requestedEndAt).toBeUndefined();
  });

  it('atomically expires a stale provider-review request before accepting a replacement', async () => {
    const rest = new FirestoreRest();
    const previousId = 'ext_aaaaaaaaaaaaaaaa';
    rest.put('equipmentRequests/r_expired_extension', extensionReadyRequest({ pendingExtensionId: previousId, extensionStatus: 'pending_provider' }), 'request-expired-v1');
    rest.put(`rentalExtensions/${previousId}`, {
      requestId: 'r_expired_extension', customerUid: 'customer', providerUid: 'provider', status: 'pending_provider',
      expiresAt: '2020-01-01T00:00:00.000Z', paymentActivation: 'blocked_unverified',
    }, 'extension-expired-v1');
    rest.put('equipment/eq_1', { ownerUid: 'provider', countryCode: 'SA', availability: { from: '2099-01-01', blocked: [] } }, 'equipment-v1');
    rest.install();
    __test.setAuth({ uid: 'customer', admin: false, emailVerified: true });

    const response = await worker.fetch(new Request('https://api.test/api/requests/r_expired_extension/extensions', {
      method: 'POST', headers: { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposedEndAt: EXTENDED_END, expectedAdditionalBaseAmountMinor: 24_000 }),
    }), rest.env);
    expect(response.status).toBe(201);
    const writes = rest.commitBodies[0].writes;
    const expiration = writes.find((write: Json) => String(write.update?.name || '').endsWith(`/rentalExtensions/${previousId}`));
    expect(expiration).toMatchObject({ update: { fields: { status: { stringValue: 'expired' } } }, currentDocument: { updateTime: 'extension-expired-v1' } });
    expect(writes.filter((write: Json) => String(write.update?.name || '').includes('/rentalExtensions/'))).toHaveLength(2);
  });

  it('keeps extension and owner availability operations participant- and owner-scoped', async () => {
    const rest = new FirestoreRest();
    const extensionId = 'ext_0123456789abcdef';
    rest.put('equipmentRequests/r_private', extensionReadyRequest({ pendingExtensionId: extensionId }), 'request-private-v1');
    rest.put(`rentalExtensions/${extensionId}`, { requestId: 'r_private', customerUid: 'customer', providerUid: 'provider', status: 'pending_provider' }, 'extension-private-v1');
    rest.put('equipment/eq_1', { ownerUid: 'provider', availability: { from: '2099-01-01', blocked: [] } }, 'equipment-private-v1');
    rest.install();
    __test.setAuth({ uid: 'outsider', admin: false, emailVerified: true });

    const extensionResponse = await worker.fetch(new Request('https://api.test/api/requests/r_private/extensions', { headers: { Authorization: 'Bearer local-test' } }), rest.env);
    const availabilityResponse = await worker.fetch(new Request('https://api.test/api/listings/eq_1/availability', {
      method: 'PATCH', headers: { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 'equipment-private-v1', availability: { from: '2099-01-01', blocked: [] } }),
    }), rest.env);
    expect(extensionResponse.status).toBe(404);
    expect(availabilityResponse.status).toBe(404);
    expect(rest.commitBodies).toHaveLength(0);
  });

  it('rejects past, oversized, overlapping, and excessive maintenance windows', async () => {
    const rest = new FirestoreRest();
    rest.put('equipment/eq_1', { ownerUid: 'provider', countryCode: 'SA', availability: { from: '2099-01-01', blocked: [] } }, 'equipment-v1');
    rest.install();
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });
    const invalidPolicies = [
      { from: '2099-01-01', blocked: [{ from: '2000-01-01', until: '2000-01-01' }] },
      { from: '2099-01-01', blocked: [{ from: '2099-01-01', until: '2099-04-01' }] },
      { from: '2099-01-01', blocked: [{ from: '2099-02-01', until: '2099-02-03' }, { from: '2099-02-03', until: '2099-02-04' }] },
      { from: '2099-01-01', blocked: Array.from({ length: 61 }, (_, index) => {
        const day = new Date(Date.UTC(2099, 0, index + 1)).toISOString().slice(0, 10);
        return { from: day, until: day };
      }) },
    ];

    for (const availability of invalidPolicies) {
      const response = await worker.fetch(new Request('https://api.test/api/listings/eq_1/availability', {
        method: 'PATCH', headers: { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: 'equipment-v1', availability }),
      }), rest.env);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ errorCode: 'INVALID_AVAILABILITY_POLICY' });
    }
    expect(rest.commitBodies).toHaveLength(0);
  });

  it('preserves an already-started maintenance window during an unrelated pause update', async () => {
    const rest = new FirestoreRest();
    const marketToday = new Date(Date.now() + 3 * 60 * 60_000).toISOString().slice(0, 10);
    const marketDay = (offset: number) => new Date(Date.parse(`${marketToday}T00:00:00.000Z`) + offset * 86_400_000).toISOString().slice(0, 10);
    const blocked = [{ from: marketDay(-1), until: marketDay(1) }];
    rest.put('equipment/eq_1', { ownerUid: 'provider', countryCode: 'SA', availability: { from: '2020-01-01', blocked, temporarilyUnavailable: false } }, 'equipment-v1');
    rest.install();
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });

    const response = await worker.fetch(new Request('https://api.test/api/listings/eq_1/availability', {
      method: 'PATCH', headers: { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 'equipment-v1', availability: { from: '2020-01-01', blocked, temporarilyUnavailable: true } }),
    }), rest.env);
    expect(response.status).toBe(200);
    const equipmentWrite = rest.commitBodies[0].writes.find((write: Json) => String(write.update?.name || '').endsWith('/equipment/eq_1'));
    expect(Boolean(equipmentWrite.update.fields.availability)).toBe(true);
  });

  it('uses equipment and booking-fence CAS so concurrent owner availability updates cannot both win', async () => {
    const rest = new FirestoreRest();
    rest.put('equipment/eq_1', { ownerUid: 'provider', countryCode: 'SA', availability: { from: '2099-01-01', blocked: [], temporarilyUnavailable: false } }, 'equipment-v1');
    let commits = 0;
    let winner = false;
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    rest.commit = async body => {
      commits += 1;
      if (commits === 2) release();
      await ready;
      if (!winner) {
        winner = true;
        rest.put('equipment/eq_1', { ownerUid: 'provider', countryCode: 'SA', availability: { from: '2099-01-01', blocked: [], temporarilyUnavailable: true } }, 'equipment-v2');
        rest.put('equipmentBookingFences/eq_1', { equipmentId: 'eq_1', revision: 1 }, 'fence-v1');
        return Response.json({ writeResults: [] });
      }
      return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 409 });
    };
    rest.install();
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });
    const update = (temporarilyUnavailable: boolean) => worker.fetch(new Request('https://api.test/api/listings/eq_1/availability', {
      method: 'PATCH', headers: { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 'equipment-v1', availability: { from: '2099-01-01', blocked: [], temporarilyUnavailable } }),
    }), rest.env);

    const responses = await Promise.all([update(true), update(false)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(await responses.find(response => response.status === 409)!.json()).toMatchObject({ errorCode: 'AVAILABILITY_UPDATE_CONFLICT' });
    for (const body of rest.commitBodies.slice(0, 2)) {
      expect(body.writes.some((write: Json) => String(write.update?.name || '').endsWith('/equipmentBookingFences/eq_1'))).toBe(true);
    }
  });

  it('lets a concurrent accepted booking fence out a conflicting maintenance update', async () => {
    const rest = new FirestoreRest();
    rest.put('equipmentRequests/r_race', v2Request(), 'request-race-v1');
    rest.put('equipment/eq_1', { ownerUid: 'provider', countryCode: 'SA', availability: { from: '2099-01-01', blocked: [] } }, 'equipment-v1');
    let accepted = false;
    let commitArrivals = 0;
    let release!: () => void;
    const bothReady = new Promise<void>(resolve => { release = resolve; });
    rest.query = body => {
      const { family } = queryFilter(body);
      if (accepted && family === 'v2') return [{ document: document(rest.project, 'equipmentRequests/r_race', v2Request({ status: 'accepted' })) }];
      return [];
    };
    rest.commit = async body => {
      commitArrivals += 1;
      if (commitArrivals === 2) release();
      await bothReady;
      const accepts = body.writes.some((write: Json) => String(write.update?.name || '').endsWith('/equipmentRequests/r_race'));
      if (accepts) {
        accepted = true;
        rest.put('equipmentRequests/r_race', v2Request({ status: 'accepted' }), 'request-race-v2');
        rest.put('equipmentBookingFences/eq_1', { equipmentId: 'eq_1', revision: 1 }, 'fence-v1');
        return Response.json({ writeResults: [] });
      }
      while (!accepted) await Promise.resolve();
      return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 409 });
    };
    rest.install();
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });
    const maintenance = worker.fetch(new Request('https://api.test/api/listings/eq_1/availability', {
      method: 'PATCH', headers: { Authorization: 'Bearer local-test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 'equipment-v1', availability: { from: '2099-01-01', blocked: [{ from: '2099-09-20', until: '2099-09-20' }], temporarilyUnavailable: false } }),
    }), rest.env);
    const acceptance = worker.fetch(transition('r_race', 'accept'), rest.env);

    const [maintenanceResponse, acceptanceResponse] = await Promise.all([maintenance, acceptance]);
    expect(acceptanceResponse.status).toBe(200);
    expect(maintenanceResponse.status).toBe(409);
    expect(await maintenanceResponse.json()).toMatchObject({ errorCode: 'AVAILABILITY_CONFLICT' });
  });

  it('processes one due expiry reminder idempotently and only for the two participants', async () => {
    const rest = new FirestoreRest();
    const requestId = 'r_due';
    const endAt = new Date(Date.now() + 30 * 60_000).toISOString();
    rest.put(`equipmentRequests/${requestId}`, extensionReadyRequest({ status: 'in_progress', requestedEndAt: endAt }), 'request-due-v1');
    let due = true;
    rest.query = body => {
      if (queryFilter(body).family !== 'rental-expiry' || !due) return [];
      return [{ document: document(rest.project, `rentalExpiryReminderJobs/${requestId}`, {
        requestId, customerUid: 'customer', providerUid: 'provider', confirmedEndAt: endAt,
        dueAt: new Date(Date.now() - 1_000).toISOString(), reminderKind: 'short_provisional', leadMinutes: 30,
      }, 'job-due-v1') }];
    };
    rest.commit = body => {
      due = false;
      return Response.json({ writeResults: body.writes.map(() => ({})) });
    };
    rest.install();

    await processRentalExpiryReminders(rest.env);
    await processRentalExpiryReminders(rest.env);
    expect(rest.commitBodies).toHaveLength(1);
    expect(rest.queryBodies).toHaveLength(2);
    const writes = rest.commitBodies[0].writes;
    expect(writes.filter((write: Json) => String(write.update?.name || '').includes('/notificationOutbox/'))).toHaveLength(2);
    expect(writes.filter((write: Json) => write.delete === `projects/${rest.project}${DB}/rentalExpiryReminderJobs/${requestId}`)).toHaveLength(1);
    const serialized = JSON.stringify(writes);
    expect(serialized).toContain('customer');
    expect(serialized).toContain('provider');
    expect(serialized).not.toContain('email');
    expect(serialized).not.toContain('phone');
  });

  it('drains a due expiry-reminder backlog in bounded batches within the scheduled budget', async () => {
    const rest = new FirestoreRest();
    const endAt = new Date(Date.now() + 30 * 60_000).toISOString();
    const pending = Array.from({ length: 7 }, (_, index) => `r_backlog_${index + 1}`);
    for (const requestId of pending) {
      rest.put(`equipmentRequests/${requestId}`, extensionReadyRequest({ status: 'in_progress', requestedEndAt: endAt }), `request-${requestId}-v1`);
    }
    rest.query = body => {
      const { family, limit } = queryFilter(body);
      if (family !== 'rental-expiry') return [];
      return pending.slice(0, limit).map(requestId => ({ document: document(rest.project, `rentalExpiryReminderJobs/${requestId}`, {
        requestId, customerUid: 'customer', providerUid: 'provider', confirmedEndAt: endAt,
        dueAt: new Date(Date.now() - 1_000).toISOString(), reminderKind: 'short_provisional', leadMinutes: 30,
      }, `job-${requestId}-v1`) }));
    };
    rest.commit = body => {
      const deletedJob = body.writes.find((write: Json) => String(write.delete || '').includes('/rentalExpiryReminderJobs/'));
      const deletedJobId = deletedJob ? String(deletedJob.delete).split('/').pop() || '' : '';
      if (deletedJobId) pending.splice(pending.indexOf(deletedJobId), 1);
      return Response.json({ writeResults: body.writes.map(() => ({})) });
    };
    rest.install();

    const workUsed: number[] = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const budget = createScheduledProcessorBudget(createScheduledGlobalBudget(), 'processRentalExpiryReminders');
      rest.env.__scheduledBudget = budget;
      await processRentalExpiryReminders(rest.env);
      workUsed.push(budget.state.workUsed);
    }

    expect(pending).toEqual([]);
    expect(workUsed).toEqual([6, 5, 3]);
    expect(workUsed.every(used => used <= SCHEDULED_PROCESSOR_LIMITS.processRentalExpiryReminders.work)).toBe(true);
    expect(rest.queryBodies).toHaveLength(3);
    expect(rest.commitBodies).toHaveLength(7);
    expect(rest.operations.filter(operation => operation.startsWith('batchGet:'))).toHaveLength(3);
    expect(rest.operations.filter(operation => operation.startsWith('document:equipmentRequests/'))).toHaveLength(0);
    expect(rest.commitBodies.map(body => body.writes.filter((write: Json) => String(write.update?.name || '').includes('/notificationOutbox/')).length)).toEqual([2, 2, 2, 2, 2, 2, 2]);
  });

  it('suppresses a stale expiry job when the rental is no longer active', async () => {
    const rest = new FirestoreRest();
    const requestId = 'r_cancelled';
    const endAt = new Date(Date.now() + 30 * 60_000).toISOString();
    rest.put(`equipmentRequests/${requestId}`, extensionReadyRequest({ status: 'cancelled', requestedEndAt: endAt }), 'request-cancelled-v1');
    rest.query = () => [{ document: document(rest.project, `rentalExpiryReminderJobs/${requestId}`, {
      requestId, customerUid: 'customer', providerUid: 'provider', confirmedEndAt: endAt,
      dueAt: new Date(Date.now() - 1_000).toISOString(), reminderKind: 'short_provisional', leadMinutes: 30,
    }, 'job-cancelled-v1') }];
    rest.install();

    await processRentalExpiryReminders(rest.env);
    expect(rest.commitBodies).toHaveLength(1);
    expect(rest.commitBodies[0].writes).toHaveLength(1);
    expect(rest.commitBodies[0].writes[0].delete).toBe(`projects/${rest.project}${DB}/rentalExpiryReminderJobs/${requestId}`);
    expect(rest.commitBodies[0].writes[0].currentDocument?.updateTime).toBe('job-cancelled-v1');
  });

  it('reads the shared fence before V1 overlap queries and rejects a stale fence CAS', async () => {
    const rest = new FirestoreRest();
    const commercialSnapshot = {
      ruleVersion: 'legacy-commission-v1', ruleStatus: 'active', mode: 'percentage', percentageBps: 0,
      fixedAmountMinor: 0, minimumFeeMinor: 0, maximumFeeMinor: null, payer: 'provider', customerShareBps: 0,
      scope: { countryCode: null, categoryId: null, providerUid: null }, baseAmountMinor: 10000,
      platformFeeMinor: 0, customerFeeMinor: 0, providerFeeMinor: 0, providerReceivableMinor: 10000,
      customerPayableMinor: 10000, taxAmountMinor: 0, taxRateBps: 0, gatewayFeeMinor: null,
      currency: 'SAR', countryCode: 'SA', categoryId: 'other', providerUid: 'provider', calculatedAt: START,
    };
    rest.put('equipmentRequests/r_v1', {
      equipmentId: 'eq_1', providerUid: 'provider', customerUid: 'customer', status: 'pending',
      requestMode: 'fixed_days', startDate: '2099-09-20', endDate: '2099-09-20', numberOfDays: 1,
      amount: 100, commercialSnapshot, createdAt: START, updatedAt: START,
    }, 'request-v1');
    rest.put('equipment/eq_1', {});
    rest.put('users/provider', {});
    rest.put('users/customer', {});
    rest.put('verificationProfiles/customer', { identity: { status: 'verified' }, manualReview: { status: 'approved' } });
    rest.put('equipmentBookingFences/eq_1', { equipmentId: 'eq_1', revision: 4 }, 'fence-v4');
    rest.commit = body => {
      const fenceWrite = body.writes.find((write: Json) => String(write.update?.name).endsWith('/equipmentBookingFences/eq_1'));
      expect(fenceWrite.currentDocument).toEqual({ updateTime: 'fence-v4' });
      return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 409 });
    };
    rest.install();
    // This is an ordinary provider transition. Do not rely on an incomplete
    // synthetic Admin claim to bypass the production authorization boundary.
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });

    const response = await worker.fetch(transition('r_v1', 'accept'), rest.env);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'BOOKING_CONFLICT' });
    const fenceIndex = rest.operations.indexOf('document:equipmentBookingFences/eq_1:none');
    const firstQueryIndex = rest.operations.findIndex(operation => operation === 'query:none');
    expect(fenceIndex).toBeGreaterThan(-1);
    expect(firstQueryIndex).toBeGreaterThan(fenceIndex);
  });

  it('persists the V2 final base amount as a Firestore integerValue', async () => {
    const rest = new FirestoreRest();
    const commercialSnapshot = {
      ruleVersion: 'legacy-commission-v1', ruleStatus: 'active', mode: 'percentage', percentageBps: 1000,
      fixedAmountMinor: 0, minimumFeeMinor: 0, maximumFeeMinor: null, payer: 'provider', customerShareBps: 0,
      scope: { countryCode: 'SA', categoryId: 'other', providerUid: null }, baseAmountMinor: 12000,
      platformFeeMinor: 1200, customerFeeMinor: 0, providerFeeMinor: 1200, providerReceivableMinor: 10800,
      customerPayableMinor: 12000, taxAmountMinor: 0, taxRateBps: 0, gatewayFeeMinor: null,
      currency: 'SAR', countryCode: 'SA', categoryId: 'other', providerUid: 'provider', calculatedAt: START,
    };
    rest.put('equipmentRequests/r_complete', v2Request({
      status: 'completion_requested',
      completionRequestedBy: 'provider',
      actualStartAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      requestedStartAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      requestedEndAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      pricingSnapshot: { rateAmountMinor: 12000 },
      commercialSnapshot,
      countryCode: 'SA',
    }), 'request-complete-v1');
    rest.install();
    __test.setAuth({ uid: 'customer', admin: false, emailVerified: true });

    const response = await worker.fetch(transition('r_complete', 'complete'), rest.env);
    expect(response.status).toBe(200);
    const fields = rest.commitBodies[0].writes[0].update.fields;
    expect(fields.finalBaseAmountMinor).toEqual({ integerValue: expect.stringMatching(/^\d+$/) });
    expect(fields.finalBaseAmountMinor.doubleValue).toBeUndefined();
    expect(fields.actualEndAt.timestampValue).toMatch(/Z$/);
  });
});
