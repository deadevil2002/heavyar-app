import { afterEach, describe, expect, test } from 'bun:test';
import worker, { __test, type Env } from './index';
import {
  operatorCursor,
  operatorDiscoveryFacet,
  operatorDiscoveryQuery,
  parseOperatorRequestInput,
  parseOperatorSearch,
  prepareOperatorRequest,
  publicOperatorProjection,
} from './operator-marketplace';

const env = { FIREBASE_PROJECT_ID: 'test-project' } as Env;
const eligible = (id: string, sortKey = id) => ({
  id,
  schemaVersion: 1,
  kind: 'operator',
  eligibilityState: 'verified_eligible',
  profileState: 'active',
  moderationState: 'approved',
  verificationState: 'verified',
  discoverable: true,
  canReceiveRequests: true,
  accountPurpose: 'standard',
  principalType: 'individual',
  authorizationState: 'active',
  revocationState: 'clear',
  displayName: 'Qualified Operator',
  countryCode: 'SA',
  region: 'riyadh',
  equipmentSkills: ['excavators'],
  yearsExperience: 8,
  availability: 'available',
  description: 'Heavy equipment operator',
  sortKey,
  discoveryFacets: [operatorDiscoveryFacet({ countryCode: 'SA', region: 'riyadh', equipmentSkill: 'excavators', availability: 'available' })],
  ownerUid: 'private-owner',
  organizationId: 'private-organization',
  exactLocation: { lat: 24.1, lng: 46.1 },
});
const validRequest = {
  clientDraftId: 'draft_12345678', contractVersion: 1, expectedRevision: null,
  equipmentSkill: 'excavators',
  requestedStartAt: '2026-11-01T05:00:00.000Z', requestedEndAt: '2026-11-01T14:00:00.000Z',
  matchingRegion: { countryCode: 'SA', region: 'riyadh' },
  workSite: { lat: 24.7136, lng: 46.6753, instructions: 'Gate 2' }, notes: 'Day shift',
};

afterEach(() => {
  __test.setAuth(undefined);
  __test.setFirestore(undefined);
  __test.setOperatorDiscoveryActivation(undefined);
  __test.captureOperatorQueries(undefined);
  __test.captureWrites(undefined);
  __test.setPublicDriverLimiter(undefined);
  __test.resetMutationLimits();
});

describe('M2-D2 operator marketplace contracts', () => {
  test('builds one bounded indexed query with a stable opaque cursor', () => {
    const cursor = operatorCursor('operator:0001', 'operator_12345678');
    const filters = parseOperatorSearch(new URL(`https://worker.test/api/operators/search?countryCode=SA&region=riyadh&equipmentSkill=excavators&availability=available&limit=20&cursor=${encodeURIComponent(cursor)}`));
    expect(filters).not.toBeNull();
    const query: any = operatorDiscoveryQuery('test-project', filters!);
    expect(query.from).toEqual([{ collectionId: 'operatorDiscoveryProfiles' }]);
    expect(query.where.fieldFilter.op).toBe('ARRAY_CONTAINS');
    expect(query.limit).toBe(21);
    expect(query.orderBy.map((row: any) => row.field.fieldPath)).toEqual(['sortKey', '__name__']);
    expect(query.startAt.values).toHaveLength(2);
    expect(parseOperatorSearch(new URL('https://worker.test/api/operators/search?limit=21'))).toBeNull();
    expect(parseOperatorSearch(new URL('https://worker.test/api/operators/search?ownerUid=forged'))).toBeNull();
  });

  test('projects only explicit coarse public fields and rejects unverified drafts', () => {
    const projection = publicOperatorProjection('operator_12345678', eligible('operator_12345678'))!;
    expect(projection.eligibility).toBe('verified_eligible');
    expect(JSON.stringify(projection)).not.toContain('ownerUid');
    expect(JSON.stringify(projection)).not.toContain('organizationId');
    expect(JSON.stringify(projection)).not.toContain('exactLocation');
    expect(publicOperatorProjection('operator_87654321', { ...eligible('operator_87654321'), verificationState: 'unverified' })).toBeNull();
    expect(publicOperatorProjection('operator_87654321', { ...eligible('operator_87654321'), accountPurpose: 'store_review' })).toBeNull();
    expect(publicOperatorProjection('operator_87654321', { ...eligible('operator_87654321'), authorizationState: 'revoked' })).toBeNull();
    expect(publicOperatorProjection('operator_87654321', { ...eligible('operator_87654321'), revocationState: 'revoked' })).toBeNull();
    expect(publicOperatorProjection('operator_87654321', { ...eligible('operator_87654321'), kind: 'transporter' })).toBeNull();
  });

  test('validates a versioned fixed-duration private request without identity or money fields', () => {
    const parsed = parseOperatorRequestInput(validRequest);
    expect(parsed).not.toBeNull();
    expect(prepareOperatorRequest(parsed!).submissionEnabled).toBe(false);
    expect(parseOperatorRequestInput({ ...validRequest, customerUid: 'forged' })).toBeNull();
    expect(parseOperatorRequestInput({ ...validRequest, amountMinor: 1 })).toBeNull();
    expect(parseOperatorRequestInput({ ...validRequest, requestedEndAt: validRequest.requestedStartAt })).toBeNull();
    expect(parseOperatorRequestInput({ ...validRequest, workSite: { lat: 0, lng: 0 } })).toBeNull();
    expect(parseOperatorRequestInput({ ...validRequest, expectedRevision: 'stale' })).toBeNull();
  });

  test('keeps production discovery disabled and performs no Firestore query', async () => {
    const queries: unknown[] = [];
    __test.captureOperatorQueries(queries);
    const response = await worker.fetch(new Request('https://worker.test/api/operators/search?countryCode=SA'), env);
    const body: any = await response.json();
    expect(response.status).toBe(200);
    expect(body.activation).toEqual({ enabled: false, reason: 'regulatory_activation_required' });
    expect(body.operators).toEqual([]);
    expect(queries).toHaveLength(0);
  });

  test('discovers only eligible mocked fixtures with no N+1 account reads and stable pagination', async () => {
    const queries: unknown[] = [];
    const fixtures = [eligible('operator_00000001', 'operator:0001'), eligible('operator_00000002', 'operator:0002'), eligible('operator_00000003', 'operator:0003')];
    let accountReads = 0;
    __test.setOperatorDiscoveryActivation(true);
    __test.setPublicDriverLimiter(async () => true);
    __test.captureOperatorQueries(queries);
    __test.setFirestore((collection, id) => {
      if (collection === '__queries' && id === 'operatorDiscoveryProfiles') return fixtures;
      if (collection === 'users') accountReads += 1;
      return null;
    });
    const first = await worker.fetch(new Request('https://worker.test/api/operators/search?countryCode=SA&region=riyadh&equipmentSkill=excavators&availability=available&limit=2'), env);
    const firstBody: any = await first.json();
    expect(firstBody.operators).toHaveLength(2);
    expect(typeof firstBody.nextCursor).toBe('string');
    const secondBody: any = await (await worker.fetch(new Request(`https://worker.test/api/operators/search?countryCode=SA&region=riyadh&equipmentSkill=excavators&availability=available&limit=2&cursor=${encodeURIComponent(firstBody.nextCursor)}`), env)).json();
    expect(secondBody.operators.map((item: any) => item.id)).toEqual(['operator_00000003']);
    expect(queries).toHaveLength(2);
    expect(accountReads).toBe(0);
  });

  test('prepares customer requirements without persistence, dispatch, notification, or payment', async () => {
    const writes: Array<{ path: string; fields: Record<string, unknown> }> = [];
    const customer = { role: 'customer', accountPurpose: 'standard', accountStatus: 'active', isActive: true, emailVerified: true,
      email: 'customer@example.test', nameEn: 'Customer', countryCode: 'SA', region: 'riyadh', city: 'riyadh' };
    let customerState = customer;
    __test.setAuth({ uid: 'customer-123', admin: false, emailVerified: true, accountProfile: customerState });
    __test.setFirestore((collection, id) => collection === 'users' && id === 'customer-123' ? customerState : null);
    __test.captureWrites(writes);
    const call = (body: unknown) => worker.fetch(new Request('https://worker.test/api/operator-requests/prepare', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), env);
    const response = await call(validRequest);
    const body: any = await response.json();
    expect(response.status).toBe(200);
    expect(body.request.status).toBe('prepared_not_submitted');
    expect(body.request.submissionEnabled).toBe(false);
    expect(writes).toHaveLength(0);
    const concurrent = await Promise.all([call(validRequest), call(validRequest), call(validRequest)]);
    expect(concurrent.every(item => item.status === 200)).toBe(true);
    expect(writes).toHaveLength(0);
    expect((await call({ ...validRequest, providerUid: 'forged' })).status).toBe(400);
    customerState = { ...customer, accountStatus: 'restricted' };
    __test.setAuth({ uid: 'customer-123', admin: false, emailVerified: true, accountProfile: customerState });
    expect((await call(validRequest)).status).toBe(403);
    customerState = { ...customer, accountPurpose: 'store_review' };
    __test.setAuth({ uid: 'customer-123', admin: false, emailVerified: true, accountProfile: customerState });
    expect((await call(validRequest)).status).toBe(403);
    customerState = { ...customer, role: 'provider' };
    __test.setAuth({ uid: 'customer-123', admin: false, emailVerified: true, accountProfile: customerState });
    expect((await call(validRequest)).status).toBe(403);
    customerState = customer;
    __test.setAuth({ uid: 'customer-123', admin: false, emailVerified: true, accountProfile: customerState });
    __test.setAuthenticatedMutationLimiter(async () => ({ status: 'limited', retryAfterSeconds: 12 }));
    const limited = await call(validRequest);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('12');
    __test.setAuthenticatedMutationLimiter(async () => ({ status: 'unavailable' }));
    expect((await call(validRequest)).status).toBe(503);
  });
});
