import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '@/services/workerClient';
import { decodeOperatorSearchResponse, prepareOperatorRequest, searchOperators } from '@/services/operatorService';

vi.mock('@/services/workerClient', () => ({
  request: vi.fn(),
  WorkerError: class WorkerError extends Error {
    status: number; code: string;
    constructor(message: string, status = 500, code = 'WORKER_ERROR') { super(message); this.status = status; this.code = code; }
  },
}));

const mockedRequest = vi.mocked(request);
const publicOperator = {
  id: 'operator_12345678', displayName: 'Qualified Operator', countryCode: 'SA', region: 'riyadh',
  equipmentSkills: ['excavators'], yearsExperience: 8, availability: 'available', eligibility: 'verified_eligible',
};

describe('operator mobile runtime boundary', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('decodes the disabled regulatory gate with no public results', () => {
    expect(decodeOperatorSearchResponse({ success: true, activation: { enabled: false, reason: 'regulatory_activation_required' }, operators: [], nextCursor: null }))
      .toEqual({ activation: { enabled: false, reason: 'regulatory_activation_required' }, operators: [], nextCursor: null });
    expect(() => decodeOperatorSearchResponse({ success: true, activation: { enabled: false, reason: 'regulatory_activation_required' }, operators: [publicOperator], nextCursor: null })).toThrow();
  });

  it('accepts only the sanitized public allowlist', () => {
    expect(decodeOperatorSearchResponse({ success: true, activation: { enabled: true }, operators: [publicOperator], nextCursor: null }).operators[0]).toEqual(publicOperator);
    for (const privateField of ['ownerUid', 'organizationId', 'exactLocation', 'customerUid', 'declarations', 'moderationReason']) {
      expect(() => decodeOperatorSearchResponse({ success: true, activation: { enabled: true }, operators: [{ ...publicOperator, [privateField]: 'private' }], nextCursor: null })).toThrow();
    }
    expect(() => decodeOperatorSearchResponse({ success: true, activation: { enabled: true }, operators: [{ ...publicOperator, eligibility: 'unverified' }], nextCursor: null })).toThrow();
  });

  it('uses a bounded public cursor contract', async () => {
    mockedRequest.mockResolvedValue({ success: true, activation: { enabled: false, reason: 'regulatory_activation_required' }, operators: [], nextCursor: null });
    await searchOperators({ countryCode: 'SA', region: 'riyadh', equipmentSkill: 'excavators', availability: 'available', limit: 20 });
    expect(mockedRequest).toHaveBeenCalledWith('/api/operators/search?countryCode=SA&region=riyadh&equipmentSkill=excavators&availability=available&limit=20', expect.any(Object), false);
  });

  it('binds preparation to the captured account and does not expose submit semantics', async () => {
    const input = {
      clientDraftId: 'draft_12345678', contractVersion: 1 as const, expectedRevision: null,
      equipmentSkill: 'excavators', requestedStartAt: '2026-11-01T05:00:00.000Z', requestedEndAt: '2026-11-01T14:00:00.000Z',
      matchingRegion: { countryCode: 'SA' as const, region: 'riyadh' }, workSite: { lat: 24.7, lng: 46.6 },
    };
    mockedRequest.mockResolvedValue({ success: true, request: {
      contractVersion: 1, clientDraftId: input.clientDraftId, revision: null, status: 'prepared_not_submitted', submissionEnabled: false,
      preparedAt: '2026-10-14T12:00:00.000Z', requirementsSnapshot: { equipmentSkill: input.equipmentSkill,
        requestedStartAt: input.requestedStartAt, requestedEndAt: input.requestedEndAt, matchingRegion: input.matchingRegion, workSite: input.workSite },
    } });
    const result = await prepareOperatorRequest(input, 'customer-uid');
    expect(result.submissionEnabled).toBe(false);
    expect(mockedRequest).toHaveBeenCalledWith('/api/operator-requests/prepare', expect.objectContaining({ method: 'POST' }), true, 'customer-uid');
    const body = JSON.parse(String(mockedRequest.mock.calls[0]?.[1]?.body));
    expect(body).not.toHaveProperty('customerUid');
    expect(body).not.toHaveProperty('operatorUid');
    expect(body).not.toHaveProperty('amount');
  });
});
