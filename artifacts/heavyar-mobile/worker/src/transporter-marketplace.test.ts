import { afterEach, describe, expect, test } from 'bun:test';
import worker, { __test, type Env } from './index';
import {
  matchTransportLoad,
  parseTransporterSearch,
  parseTransportRequestInput,
  prepareTransportRequest,
  publicTransporterProjection,
  transporterCursor,
  transporterDiscoveryFacet,
  transporterDiscoveryQuery,
  type TransporterSearchFilters,
} from './transporter-marketplace';

const env = { FIREBASE_PROJECT_ID: 'test-project' } as Env;
const filters: TransporterSearchFilters = {
  countryCode: 'SA', region: 'riyadh', vehicleCategory: 'lowbed', vehicleType: 'hydraulic', availability: 'available',
  minCapacityKg: 10_000, minLengthMm: 8_000, minWidthMm: 2_500, minHeightMm: 3_000, limit: 2,
};
const eligible = (id: string, capacity = 20_000, sortKey = id) => ({
  id, schemaVersion: 1, kind: 'transporter', eligibilityState: 'verified_eligible', profileState: 'active', moderationState: 'approved',
  verificationState: 'verified', discoverable: true, canReceiveRequests: true, accountPurpose: 'standard', principalType: 'individual',
  authorizationState: 'active', revocationState: 'clear', displayName: 'Verified Transporter', countryCode: 'SA', region: 'riyadh',
  vehicleCategory: 'lowbed', vehicleType: 'hydraulic', declaredCapacityKg: capacity,
  declaredDimensionsMm: { length: 12_000, width: 3_000, height: 4_000 }, availability: 'available', description: 'Declared vehicle capabilities', sortKey,
  discoveryFacets: [transporterDiscoveryFacet(filters)], ownerUid: 'private-owner', organizationId: 'private-org', vin: 'private', permit: 'private',
  exactLocation: { lat: 24.1, lng: 46.1 },
});
const validRequest = {
  clientDraftId: 'draft_12345678', contractVersion: 1, expectedRevision: null, equipmentCategory: 'excavators', loadWeightKg: 10_000,
  loadDimensionsMm: { length: 8_000, width: 2_500, height: 3_000 },
  origin: { region: { countryCode: 'SA', region: 'riyadh' }, pin: { lat: 24.7136, lng: 46.6753, instructions: 'Pickup gate' } },
  destination: { region: { countryCode: 'SA', region: 'eastern' }, pin: { lat: 26.4207, lng: 50.0888, instructions: 'Delivery gate' } },
  requestedPickupWindow: { startAt: '2026-11-01T05:00:00.000Z', endAt: '2026-11-01T07:00:00.000Z' },
  requestedDeliveryBy: '2026-11-02T14:00:00.000Z', notes: 'Declared dimensions only',
};

afterEach(() => {
  __test.setAuth(undefined); __test.setFirestore(undefined); __test.setTransporterDiscoveryActivation(undefined);
  __test.captureTransporterQueries(undefined); __test.captureWrites(undefined); __test.setPublicDriverLimiter(undefined); __test.resetMutationLimits();
});

describe('M2-D3 transporter marketplace contracts', () => {
  test('builds one bounded indexed query and binds opaque cursors to all filters', () => {
    const profile = publicTransporterProjection('transporter_12345678', eligible('transporter_12345678'))!;
    const cursor = transporterCursor(filters, profile, 'transporter:0001');
    const queryUrl = new URL(`https://worker.test/api/transporters/search?countryCode=SA&region=riyadh&vehicleCategory=lowbed&vehicleType=hydraulic&availability=available&minCapacityKg=10000&minLengthMm=8000&minWidthMm=2500&minHeightMm=3000&limit=2&cursor=${encodeURIComponent(cursor)}`);
    const parsed = parseTransporterSearch(queryUrl);
    expect(parsed).not.toBeNull();
    const query: any = transporterDiscoveryQuery('test-project', parsed!);
    expect(query.from).toEqual([{ collectionId: 'transporterDiscoveryProfiles' }]);
    expect(query.where.compositeFilter.filters).toHaveLength(5);
    expect(query.limit).toBe(3);
    expect(query.orderBy.map((row: any) => row.field.fieldPath)).toEqual([
      'declaredCapacityKg', 'declaredDimensionsMm.length', 'declaredDimensionsMm.width', 'declaredDimensionsMm.height', 'sortKey', '__name__',
    ]);
    expect(query.startAt.values).toHaveLength(6);
    queryUrl.searchParams.set('region', 'eastern');
    expect(parseTransporterSearch(queryUrl)).toBeNull();
    expect(parseTransporterSearch(new URL('https://worker.test/api/transporters/search?countryCode=SA'))).not.toBeNull();
    expect(parseTransporterSearch(new URL('https://worker.test/api/transporters/search?countryCode=SA&region=riyadh'))?.region).toBe('riyadh');
    expect(parseTransporterSearch(new URL('https://worker.test/api/transporters/search?countryCode=SA&region=*'))).toBeNull();
    expect(() => transporterDiscoveryFacet({ ...filters, region: '*' })).toThrow('INVALID_TRANSPORTER_REGION');
    expect(parseTransporterSearch(new URL('https://worker.test/api/transporters/search?limit=21'))).toBeNull();
    expect(parseTransporterSearch(new URL('https://worker.test/api/transporters/search?ownerUid=forged'))).toBeNull();
    expect((transporterDiscoveryQuery('test-project', { ...filters, limit: 20 }) as any).limit).toBe(21);
  });

  test('exposes only verified coarse capabilities and never private transporter fields', () => {
    const projection = publicTransporterProjection('transporter_12345678', eligible('transporter_12345678'))!;
    expect(projection.capabilityBasis).toBe('declared_not_independently_verified');
    for (const privateValue of ['private-owner', 'private-org', 'vin', 'permit', 'exactLocation']) expect(JSON.stringify(projection)).not.toContain(privateValue);
    for (const patch of [{ verificationState: 'unverified' }, { discoverable: false }, { accountPurpose: 'store_review' }, { authorizationState: 'revoked' }, { kind: 'operator' }]) {
      expect(publicTransporterProjection('transporter_87654321', { ...eligible('transporter_87654321'), ...patch })).toBeNull();
    }
  });

  test('validates kg/mm edges, both location roles, ordering, identity exclusion, and immutable preparation', () => {
    const parsed = parseTransportRequestInput(validRequest);
    expect(parsed).not.toBeNull();
    const prepared = prepareTransportRequest(parsed!, '2026-10-14T12:00:00.000Z');
    expect(prepared.status).toBe('prepared_not_submitted');
    expect(prepared.submissionEnabled).toBe(false);
    expect(prepared.requirementsSnapshot.origin).not.toBe(prepared.requirementsSnapshot.destination);
    expect(parseTransportRequestInput({ ...validRequest, customerUid: 'forged' })).toBeNull();
    expect(parseTransportRequestInput({ ...validRequest, transporterUid: 'forged' })).toBeNull();
    expect(parseTransportRequestInput({ ...validRequest, amountMinor: 1 })).toBeNull();
    expect(parseTransportRequestInput({ ...validRequest, loadWeightKg: 1.5 })).toBeNull();
    expect(parseTransportRequestInput({ ...validRequest, loadDimensionsMm: { length: 0, width: 1, height: 1 } })).toBeNull();
    expect(parseTransportRequestInput({ ...validRequest, origin: { ...validRequest.origin, pin: { lat: 0, lng: 0 } } })).toBeNull();
    expect(parseTransportRequestInput({ ...validRequest, destination: undefined })).toBeNull();
    expect(parseTransportRequestInput({ ...validRequest, requestedDeliveryBy: validRequest.requestedPickupWindow.startAt })).toBeNull();
  });

  test('matches declared capacity and dimensions without certifying route or legal feasibility', () => {
    const capability = publicTransporterProjection('transporter_12345678', eligible('transporter_12345678'))!;
    expect(matchTransportLoad(validRequest, capability)).toEqual({ compatible: true, reasons: [], capabilityBasis: 'declared_not_independently_verified', routeSuitability: 'not_evaluated', legalEligibility: 'not_evaluated' });
    const mismatch = matchTransportLoad({ loadWeightKg: 30_000, loadDimensionsMm: { length: 13_000, width: 3_500, height: 4_500 } }, capability);
    expect(mismatch.compatible).toBe(false);
    expect(mismatch.reasons).toEqual(['capacity', 'length', 'width', 'height']);
  });

  test('keeps production discovery hard-disabled before rate limits or Firestore', async () => {
    const queries: unknown[] = [];
    __test.captureTransporterQueries(queries);
    __test.setPublicDriverLimiter(async () => { throw new Error('must not run'); });
    const response = await worker.fetch(new Request('https://worker.test/api/transporters/search?countryCode=SA'), env);
    const body: any = await response.json();
    expect(response.status).toBe(200);
    expect(body.activation).toEqual({ enabled: false, reason: 'regulatory_activation_required' });
    expect(body.transporters).toEqual([]);
    expect(queries).toHaveLength(0);
    const forgedActivation = await worker.fetch(new Request('https://worker.test/api/transporters/search?countryCode=SA&activation=true'), env);
    expect(forgedActivation.status).toBe(400);
    expect(queries).toHaveLength(0);
  });

  test('discovers bounded eligible test fixtures without N+1 reads and keeps pagination stable', async () => {
    const queries: unknown[] = [];
    const fixtures = [eligible('transporter_00000001', 20_000, 'a'), eligible('transporter_00000002', 25_000, 'b'), eligible('transporter_00000003', 30_000, 'c')];
    let accountReads = 0;
    __test.setTransporterDiscoveryActivation(true); __test.setPublicDriverLimiter(async () => true); __test.captureTransporterQueries(queries);
    __test.setFirestore((collection, id) => {
      if (collection === '__queries' && id === 'transporterDiscoveryProfiles') return fixtures;
      if (collection === 'users') accountReads += 1;
      return null;
    });
    const base = 'https://worker.test/api/transporters/search?countryCode=SA&region=riyadh&vehicleCategory=lowbed&vehicleType=hydraulic&availability=available&minCapacityKg=10000&minLengthMm=8000&minWidthMm=2500&minHeightMm=3000&limit=2';
    const firstBody: any = await (await worker.fetch(new Request(base), env)).json();
    expect(firstBody.transporters).toHaveLength(2);
    expect(typeof firstBody.nextCursor).toBe('string');
    const secondBody: any = await (await worker.fetch(new Request(`${base}&cursor=${encodeURIComponent(firstBody.nextCursor)}`), env)).json();
    expect(secondBody.transporters.map((item: any) => item.id)).toEqual(['transporter_00000003']);
    expect(queries).toHaveLength(2); expect(accountReads).toBe(0);
  });

  test('advances across an excluded boundary row with equal sort keys and never skips or duplicates eligible profiles', async () => {
    const queries: any[] = [];
    const fixtures = [
      eligible('transporter_00000001', 20_000, 'same'),
      { ...eligible('transporter_00000002', 20_000, 'same'), verificationState: 'unverified' },
      eligible('transporter_00000003', 20_000, 'same'),
      eligible('transporter_00000004', 20_000, 'same'),
      eligible('transporter_00000005', 20_000, 'same'),
    ];
    __test.setTransporterDiscoveryActivation(true); __test.setPublicDriverLimiter(async () => true); __test.captureTransporterQueries(queries);
    __test.setFirestore((collection, id) => collection === '__queries' && id === 'transporterDiscoveryProfiles' ? fixtures : null);
    const base = 'https://worker.test/api/transporters/search?countryCode=SA&region=riyadh&vehicleCategory=lowbed&vehicleType=hydraulic&availability=available&minCapacityKg=10000&minLengthMm=8000&minWidthMm=2500&minHeightMm=3000&limit=2';
    const found: string[] = [];
    let cursor: string | null = null;
    do {
      const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const body: any = await (await worker.fetch(new Request(`${base}${suffix}`), env)).json();
      found.push(...body.transporters.map((item: any) => item.id));
      cursor = body.nextCursor;
    } while (cursor);
    expect(found).toEqual(['transporter_00000001', 'transporter_00000003', 'transporter_00000004', 'transporter_00000005']);
    expect(new Set(found).size).toBe(found.length);
    expect(queries).toHaveLength(3);
    expect(queries.every(query => query.limit === 3)).toBe(true);
  });

  test('returns a continuation cursor for a fully excluded consumed page without consuming its eligible lookahead', async () => {
    const queries: any[] = [];
    const fixtures = [
      { ...eligible('transporter_00000001', 20_000, 'same'), authorizationState: 'revoked' },
      { ...eligible('transporter_00000002', 20_000, 'same'), accountPurpose: 'store_review' },
      eligible('transporter_00000003', 20_000, 'same'),
    ];
    __test.setTransporterDiscoveryActivation(true); __test.setPublicDriverLimiter(async () => true); __test.captureTransporterQueries(queries);
    __test.setFirestore((collection, id) => collection === '__queries' && id === 'transporterDiscoveryProfiles' ? fixtures : null);
    const base = 'https://worker.test/api/transporters/search?countryCode=SA&region=riyadh&vehicleCategory=lowbed&vehicleType=hydraulic&availability=available&minCapacityKg=10000&minLengthMm=8000&minWidthMm=2500&minHeightMm=3000&limit=2';
    const first: any = await (await worker.fetch(new Request(base), env)).json();
    expect(first.transporters).toEqual([]);
    expect(typeof first.nextCursor).toBe('string');
    const second: any = await (await worker.fetch(new Request(`${base}&cursor=${encodeURIComponent(first.nextCursor)}`), env)).json();
    expect(second.transporters.map((item: any) => item.id)).toEqual(['transporter_00000003']);
    expect(second.nextCursor).toBeNull();
    expect(queries.every(query => query.limit === 3)).toBe(true);
  });

  test('prepares for an eligible customer without persistence, dispatch, notification, or payment', async () => {
    const writes: { path: string; fields: Record<string, unknown> }[] = [];
    const customer = { role: 'customer', accountPurpose: 'standard', accountStatus: 'active', isActive: true, emailVerified: true,
      email: 'customer@example.test', nameEn: 'Test Customer', countryCode: 'SA', region: 'riyadh', city: 'riyadh' };
    let customerState = customer;
    __test.setAuth({ uid: 'customer-123', admin: false, emailVerified: true, accountProfile: customerState });
    __test.setFirestore((collection, id) => collection === 'users' && id === 'customer-123' ? customerState : null);
    __test.captureWrites(writes);
    const call = (body: unknown) => worker.fetch(new Request('https://worker.test/api/transport-requests/prepare', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), env);
    const response = await call(validRequest), body: any = await response.json();
    expect(response.status).toBe(200); expect(body.request.status).toBe('prepared_not_submitted'); expect(body.request.submissionEnabled).toBe(false);
    expect(writes).toHaveLength(0);
    expect((await call({ ...validRequest, providerUid: 'forged' })).status).toBe(400);
    customerState = { ...customer, accountStatus: 'restricted' };
    __test.setAuth({ uid: 'customer-123', admin: false, emailVerified: true, accountProfile: customerState });
    expect((await call(validRequest)).status).toBe(403);
    customerState = customer;
    __test.setAuth({ uid: 'customer-123', admin: false, emailVerified: true, accountProfile: customerState });
    __test.setAuthenticatedMutationLimiter(async () => ({ status: 'limited', retryAfterSeconds: 9 }));
    const limited = await call(validRequest);
    expect(limited.status).toBe(429); expect(limited.headers.get('Retry-After')).toBe('9');
    expect(writes).toHaveLength(0);
  });
});
