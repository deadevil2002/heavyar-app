import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '@/services/workerClient';
import { decodeTransporterSearchResponse, prepareTransportRequest, searchTransporters } from '@/services/transporterService';

vi.mock('@/services/workerClient', () => ({
  request: vi.fn(),
  WorkerError: class WorkerError extends Error {
    status: number; code: string;
    constructor(message: string, status = 500, code = 'WORKER_ERROR') { super(message); this.status = status; this.code = code; }
  },
}));

const mockedRequest = vi.mocked(request);
const profile = {
  id: 'transporter_12345678', displayName: 'Verified Transporter', countryCode: 'SA', region: 'riyadh', vehicleCategory: 'lowbed',
  vehicleType: 'hydraulic', declaredCapacityKg: 20_000, declaredDimensionsMm: { length: 12_000, width: 3_000, height: 4_000 },
  availability: 'available', eligibility: 'verified_eligible', capabilityBasis: 'declared_not_independently_verified',
};

describe('transporter mobile runtime boundary', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('decodes the disabled gate and rejects results behind it', () => {
    expect(decodeTransporterSearchResponse({ success: true, activation: { enabled: false, reason: 'regulatory_activation_required' }, transporters: [], nextCursor: null }).transporters).toEqual([]);
    expect(() => decodeTransporterSearchResponse({ success: true, activation: { enabled: false, reason: 'regulatory_activation_required' }, transporters: [profile], nextCursor: null })).toThrow();
  });

  it('accepts only the sanitized transporter projection', () => {
    expect(decodeTransporterSearchResponse({ success: true, activation: { enabled: true }, transporters: [profile], nextCursor: null }).transporters[0]).toEqual(profile);
    for (const privateField of ['ownerUid', 'organizationId', 'exactLocation', 'vin', 'permit', 'customerUid', 'bankAccount']) {
      expect(() => decodeTransporterSearchResponse({ success: true, activation: { enabled: true }, transporters: [{ ...profile, [privateField]: 'private' }], nextCursor: null })).toThrow();
    }
    expect(() => decodeTransporterSearchResponse({ success: true, activation: { enabled: true }, transporters: [{ ...profile, capabilityBasis: 'verified' }], nextCursor: null })).toThrow();
  });

  it('uses bounded filters without leaking private identity', async () => {
    mockedRequest.mockResolvedValue({ success: true, activation: { enabled: false, reason: 'regulatory_activation_required' }, transporters: [], nextCursor: null });
    await searchTransporters({ countryCode: 'SA', region: 'riyadh', vehicleCategory: 'lowbed', minCapacityKg: 10_000, minLengthMm: 8_000, minWidthMm: 2_500, minHeightMm: 3_000, limit: 20 });
    expect(mockedRequest).toHaveBeenCalledWith('/api/transporters/search?countryCode=SA&region=riyadh&vehicleCategory=lowbed&minCapacityKg=10000&minLengthMm=8000&minWidthMm=2500&minHeightMm=3000&limit=20', expect.any(Object), false);
  });

  it('binds private preparation to the captured customer and validates both endpoints', async () => {
    const input = {
      clientDraftId: 'draft_12345678', contractVersion: 1 as const, expectedRevision: null, equipmentCategory: 'excavators', loadWeightKg: 10_000,
      loadDimensionsMm: { length: 8_000, width: 2_500, height: 3_000 },
      origin: { region: { countryCode: 'SA' as const, region: 'riyadh' }, pin: { lat: 24.7, lng: 46.6, instructions: 'Pickup' } },
      destination: { region: { countryCode: 'SA' as const, region: 'eastern' }, pin: { lat: 26.4, lng: 50.1, instructions: 'Delivery' } },
      requestedPickupWindow: { startAt: '2026-11-01T05:00:00.000Z', endAt: '2026-11-01T07:00:00.000Z' }, requestedDeliveryBy: '2026-11-02T14:00:00.000Z',
    };
    mockedRequest.mockResolvedValue({ success: true, request: {
      contractVersion: 1, clientDraftId: input.clientDraftId, revision: null, status: 'prepared_not_submitted', submissionEnabled: false,
      preparedAt: '2026-10-14T12:00:00.000Z', requirementsSnapshot: { equipmentCategory: input.equipmentCategory, loadWeightKg: input.loadWeightKg,
        loadDimensionsMm: input.loadDimensionsMm, origin: input.origin, destination: input.destination, requestedPickupWindow: input.requestedPickupWindow, requestedDeliveryBy: input.requestedDeliveryBy },
    } });
    const result = await prepareTransportRequest(input, 'customer-uid');
    expect(result.submissionEnabled).toBe(false);
    expect(mockedRequest).toHaveBeenCalledWith('/api/transport-requests/prepare', expect.objectContaining({ method: 'POST' }), true, 'customer-uid');
    const body = JSON.parse(String(mockedRequest.mock.calls[0]?.[1]?.body));
    expect(body).not.toHaveProperty('customerUid'); expect(body).not.toHaveProperty('transporterUid'); expect(body).not.toHaveProperty('amount');
  });

  it('fails closed if the Worker alters the immutable prepared snapshot', async () => {
    mockedRequest.mockResolvedValue({ success: true, request: { contractVersion: 1, clientDraftId: 'draft_12345678', revision: null,
      status: 'prepared_not_submitted', submissionEnabled: false, preparedAt: '2026-10-14T12:00:00.000Z', requirementsSnapshot: {} } });
    await expect(prepareTransportRequest({} as never, 'customer-uid')).rejects.toThrow();
  });
});
