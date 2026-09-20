import { afterEach, beforeAll, describe, expect, it } from 'bun:test';
import worker, { __test, type Env } from './index';

const DB = '/databases/(default)/documents';
const START = '2099-09-20T08:00:00.000Z';
const END = '2099-09-20T10:00:00.000Z';
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

function queryFilter(body: Json) {
  const query = body.structuredQuery;
  expect(query.from).toEqual([{ collectionId: 'equipmentRequests' }]);
  expect(query.orderBy).toEqual([{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]);
  const filters = query.where?.compositeFilter?.filters;
  expect(filters?.[0]).toEqual({
    fieldFilter: {
      field: { fieldPath: 'equipmentId' },
      op: 'EQUAL',
      value: { stringValue: 'eq_1' },
    },
  });
  expect(filters?.[1]).toEqual({
    compositeFilter: {
      op: 'OR',
      filters: [
        {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'IN',
            value: {
              arrayValue: {
                values: ['pending', 'accepted', 'in_progress', 'completion_requested', 'payment_pending', 'paid']
                  .map(stringValue => ({ stringValue })),
              },
            },
          },
        },
        {
          fieldFilter: {
            field: { fieldPath: 'paymentState' },
            op: 'EQUAL',
            value: { stringValue: 'paid' },
          },
        },
      ],
    },
  });
  expect(filters).toHaveLength(2);
  expect(query.limit).toBe(101);
  return { limit: query.limit as number };
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
    expect(rest.queryBodies).toHaveLength(1);
    queryFilter(rest.queryBodies[0]);
  });

  it('propagates the acceptance transaction to the native OR query, fence read, and commit', async () => {
    const rest = new FirestoreRest();
    rest.put('equipmentRequests/r_v2', v2Request(), 'request-v1');
    rest.install();
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });

    const response = await worker.fetch(transition('r_v2', 'accept'), rest.env);
    expect(response.status).toBe(200);
    expect(rest.queryBodies).toHaveLength(1);
    expect(rest.queryBodies[0].transaction).toBe('tx-1');
    queryFilter(rest.queryBodies[0]);
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
    let winner = '';
    let firstRoundCommits = 0;
    let releaseFirstRound!: () => void;
    const firstRound = new Promise<void>(resolve => { releaseFirstRound = resolve; });
    rest.query = body => {
      queryFilter(body);
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
      queryFilter(body);
      return Array.from({ length: 101 }, (_, index) => ({
        document: document(rest.project, `equipmentRequests/cap-${index}`, v2Request()),
      }));
    };
    rest.install();
    __test.setAuth({ uid: 'provider', admin: false, emailVerified: true });

    const response = await worker.fetch(transition('r_budget', 'accept'), rest.env);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ errorCode: 'AVAILABILITY_CAP_EXHAUSTED' });
    expect(rest.queryBodies).toHaveLength(1);
    expect(rest.commitBodies).toHaveLength(0);
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
    __test.setAuth({ uid: 'provider', admin: true, emailVerified: true });

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