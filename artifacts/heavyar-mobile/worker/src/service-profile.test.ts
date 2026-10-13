import { describe, expect, test } from 'bun:test';
import {
  isEligibleIndividualServiceAccount,
  parseServiceProfileDraft,
  serviceProfileCollection,
  serviceProfileProjection,
} from './service-profile';

const operator = {
  equipmentCategories: ['excavators', 'cranes'],
  yearsExperience: 8,
  serviceArea: { countryCode: 'SA', region: 'riyadh', city: 'riyadh' },
  availability: 'available',
  declarations: [{ kind: 'qualification', title: 'Heavy equipment certificate', issuer: 'Declared issuer' }],
  description: 'Declared operating experience.',
};

const transporter = {
  vehicleCategory: 'lowbed',
  vehicleType: 'Lowbed trailer',
  capacityKg: 65_000,
  dimensionsMm: { length: 14_000, width: 3_200, height: 4_000 },
  serviceArea: { countryCode: 'SA', region: 'riyadh', city: 'riyadh' },
  availability: 'busy',
  declarations: [{ kind: 'transport_license', title: 'Transport licence' }],
  description: 'Declared transport vehicle.',
};

describe('M2-D1 service-profile contracts', () => {
  test('supports separate operator, transporter, and dual draft capability without a new canonical role', () => {
    expect(parseServiceProfileDraft('operator', operator)).toMatchObject({ yearsExperience: 8, declarations: [{ declarationState: 'declared_unverified' }] });
    expect(parseServiceProfileDraft('transporter', transporter)).toMatchObject({ capacityKg: 65_000, declarations: [{ declarationState: 'declared_unverified' }] });
    for (const role of ['customer', 'provider']) expect(isEligibleIndividualServiceAccount({ role, accountStatus: 'active' }, { moderationStatus: 'approved' })).toBe(false);
    expect(isEligibleIndividualServiceAccount({ role: 'driver', accountStatus: 'active' }, { moderationStatus: 'pending_review' })).toBe(true);
  });

  test('rejects forged verification/discovery fields and never projects a publishable profile', () => {
    expect(parseServiceProfileDraft('operator', { ...operator, verificationState: 'verified' })).toBeNull();
    expect(parseServiceProfileDraft('operator', { ...operator, declarations: [{ ...operator.declarations[0], declarationState: 'verified' }] })).toBeNull();
    const projection = serviceProfileProjection('operator', { draft: operator, verificationState: 'verified', discoverable: true }, 'rev-1');
    expect(projection).toMatchObject({ profileState: 'draft', moderationState: 'not_submitted', verificationState: 'unverified', discoverable: false, canReceiveRequests: false, revision: 'rev-1' });
  });

  test('strictly bounds categories, capacity, dimensions, strings, and precise-location fields', () => {
    expect(parseServiceProfileDraft('operator', { ...operator, equipmentCategories: [] })).toBeNull();
    expect(parseServiceProfileDraft('operator', { ...operator, equipmentCategories: ['bad category'] })).toBeNull();
    expect(parseServiceProfileDraft('operator', { ...operator, yearsExperience: 8.5 })).toBeNull();
    expect(parseServiceProfileDraft('operator', { ...operator, serviceArea: { ...operator.serviceArea, latitude: 24.7 } })).toBeNull();
    for (const capacityKg of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '65000']) {
      expect(parseServiceProfileDraft('transporter', { ...transporter, capacityKg })).toBeNull();
    }
    expect(parseServiceProfileDraft('transporter', { ...transporter, dimensionsMm: { ...transporter.dimensionsMm, width: 20_001 } })).toBeNull();
    expect(parseServiceProfileDraft('transporter', { ...transporter, vehicleCategory: 'truck_rental_authority' })).toBeNull();
  });

  test('restricted accounts fail closed and individual/company documents remain separated', () => {
    for (const accountStatus of ['suspended', 'restricted', 'deletion_requested', 'deleted']) {
      expect(isEligibleIndividualServiceAccount({ role: 'driver', accountStatus }, { moderationStatus: 'approved' })).toBe(false);
    }
    expect(isEligibleIndividualServiceAccount({ role: 'driver', accountStatus: 'active' }, { moderationStatus: 'suspended' })).toBe(false);
    expect(isEligibleIndividualServiceAccount({ role: 'driver', accountStatus: 'active' }, { moderationStatus: 'rejected' })).toBe(false);
    expect(serviceProfileCollection('operator')).toBe('operatorProfiles');
    expect(serviceProfileCollection('transporter')).toBe('transporterProfiles');
    expect(serviceProfileCollection('operator', true)).toBe('organizationOperatorProfiles');
    expect(serviceProfileCollection('transporter', true)).toBe('organizationTransporterProfiles');
  });
});
