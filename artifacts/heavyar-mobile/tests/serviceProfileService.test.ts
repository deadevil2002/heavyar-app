import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request } from '@/services/workerClient';
import { decodeServiceProfile, savePersonalServiceProfile } from '@/services/serviceProfileService';

vi.mock('@/services/workerClient', () => ({ request: vi.fn() }));

const mockedRequest = vi.mocked(request);

const base = {
  profileState: 'draft', moderationState: 'not_submitted', verificationState: 'unverified',
  discoverable: false, canReceiveRequests: false, revision: 'revision-1', updatedAt: '2026-10-13T00:00:00.000Z',
};

describe('service profile mobile runtime decoding', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('decodes an operator draft while preserving declared/unverified semantics', () => {
    expect(decodeServiceProfile({ ...base, kind: 'operator', requestedCapability: 'operator', draft: {
      equipmentCategories: ['excavators'], yearsExperience: 5,
      serviceArea: { countryCode: 'SA', region: 'riyadh', city: 'riyadh' }, availability: 'available',
      declarations: [{ kind: 'qualification', title: 'Declared certificate', declarationState: 'declared_unverified' }], description: '',
    } }, 'operator')).toMatchObject({ discoverable: false, canReceiveRequests: false, draft: { yearsExperience: 5 } });
  });

  it('decodes safe-integer transporter dimensions and capacity', () => {
    expect(decodeServiceProfile({ ...base, kind: 'transporter', requestedCapability: 'transporter', draft: {
      vehicleCategory: 'lowbed', vehicleType: 'Lowbed', capacityKg: 50_000,
      dimensionsMm: { length: 12_000, width: 3_000, height: 4_000 },
      serviceArea: { countryCode: 'SA', region: 'riyadh', city: 'riyadh' }, availability: 'offline',
      declarations: [], description: 'Draft transport profile',
    } }, 'transporter').draft.capacityKg).toBe(50_000);
  });

  it('rejects forged verified/public states and malformed numeric values', () => {
    const validDraft = {
      vehicleCategory: 'lowbed', vehicleType: 'Lowbed', capacityKg: 50_000,
      dimensionsMm: { length: 12_000, width: 3_000, height: 4_000 },
      serviceArea: { countryCode: 'SA', region: 'riyadh' }, availability: 'offline', declarations: [], description: '',
    };
    expect(() => decodeServiceProfile({ ...base, kind: 'transporter', requestedCapability: 'transporter', verificationState: 'verified', draft: validDraft }, 'transporter')).toThrow('SERVICE_PROFILE_RESPONSE_INVALID');
    expect(() => decodeServiceProfile({ ...base, kind: 'transporter', requestedCapability: 'transporter', discoverable: true, draft: validDraft }, 'transporter')).toThrow('SERVICE_PROFILE_RESPONSE_INVALID');
    expect(() => decodeServiceProfile({ ...base, kind: 'transporter', requestedCapability: 'transporter', draft: { ...validDraft, capacityKg: 9.5 } }, 'transporter')).toThrow('SERVICE_PROFILE_RESPONSE_INVALID');
    expect(() => decodeServiceProfile({ ...base, kind: 'transporter', requestedCapability: 'transporter', draft: { ...validDraft, capacityKg: '50000' } }, 'transporter')).toThrow('SERVICE_PROFILE_RESPONSE_INVALID');
  });

  it('never sends the server-owned declaration state in a save payload', async () => {
    const draft = {
      equipmentCategories: ['excavators'], yearsExperience: 5,
      serviceArea: { countryCode: 'SA', region: 'riyadh', city: 'riyadh' }, availability: 'available' as const,
      declarations: [{ kind: 'qualification', title: 'Declared certificate', declarationState: 'declared_unverified' as const }],
      description: '',
    };
    mockedRequest.mockResolvedValue({ profile: { ...base, kind: 'operator', requestedCapability: 'operator', draft } });
    await savePersonalServiceProfile('driver-uid', 'operator', null, draft);
    const body = JSON.parse(String(mockedRequest.mock.calls[0]?.[1]?.body));
    expect(body.draft.declarations).toEqual([{ kind: 'qualification', title: 'Declared certificate' }]);
    expect(mockedRequest).toHaveBeenCalledWith('/api/service-profiles/operator', expect.any(Object), true, 'driver-uid');
  });
});
