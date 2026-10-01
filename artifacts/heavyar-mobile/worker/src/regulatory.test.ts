import { describe, expect, test } from 'vitest';
import { effectiveDocumentStatus, evaluateCapabilities, isSaudiTruckRentalWithoutDriver, type RegulatoryDocument } from './regulatory';

const document = (documentType: RegulatoryDocument['documentType'], patch: Partial<RegulatoryDocument> = {}): RegulatoryDocument => ({
  id: `doc-${documentType}`, ownerUid: 'provider-1', documentType, documentNumber: 'SAFE-1', issuingAuthority: 'Authority',
  activityScope: [], equipmentIds: [], submittedAt: '2026-01-01T00:00:00.000Z', reviewStatus: 'VERIFIED',
  verificationMethod: 'HEAVYAR_MANUAL', updatedAt: '2026-01-01T00:00:00.000Z', ...patch,
});

describe('regulatory capability evaluation', () => {
  const now = new Date('2026-10-01T00:00:00.000Z');
  const required = [
    document('COMMERCIAL_REGISTRATION'),
    document('ACTIVITY_LICENSE', { activityScope: ['truck_rental_without_driver'] }),
    document('OPERATING_CARD'),
    document('OWNERSHIP_AUTHORIZATION'),
  ];

  test('distinguishes individual listing eligibility from regulated business truck rental', () => {
    const individual = evaluateCapabilities({ uid: 'provider-1', canonicalRole: 'provider', accountType: 'individual', countryCode: 'SA', categoryId: 'trucks', transactionType: 'rental', documents: [document('OWNERSHIP_AUTHORIZATION')], now });
    expect(individual.capabilities.CAN_LIST_EQUIPMENT).toBe(true);
    expect(individual.capabilities.CAN_ACCEPT_REGULATED_RENTAL).toBe(false);
    expect(individual.reasons.CAN_ACCEPT_REGULATED_RENTAL).toContain('VERIFIED_BUSINESS_REQUIRED');
  });

  test('allows only the fully scoped current business documents', () => {
    const result = evaluateCapabilities({ uid: 'provider-1', canonicalRole: 'provider', accountType: 'business', countryCode: 'SA', categoryId: 'trucks', transactionType: 'rental', documents: required, now });
    expect(result.capabilities.CAN_RENT_TRUCK_WITHOUT_DRIVER).toBe(true);
    expect(result.capabilities.CAN_ACCEPT_REGULATED_RENTAL).toBe(true);
    expect(result.badges.map(badge => badge.scope)).toEqual(['business', 'activity_license', 'operating_card']);
  });

  test.each(['EXPIRED', 'REVOKED', 'REJECTED'] as const)('%s activity licence removes only affected regulated capabilities', status => {
    const docs = required.map(item => item.documentType === 'ACTIVITY_LICENSE' ? { ...item, reviewStatus: status } : item);
    const result = evaluateCapabilities({ uid: 'provider-1', canonicalRole: 'provider', accountType: 'business', countryCode: 'SA', categoryId: 'trucks', transactionType: 'rental', documents: docs, now });
    expect(result.capabilities.CAN_ACCEPT_REGULATED_RENTAL).toBe(false);
    expect(result.capabilities.CAN_RECEIVE_PAYOUT).toBe(true);
  });

  test('treats a verified but elapsed document as expired', () => {
    expect(effectiveDocumentStatus(document('ACTIVITY_LICENSE', { expiryDate: '2026-09-30' }), now)).toBe('EXPIRED');
  });

  test('does not regulate unrelated categories or driver-included transactions', () => {
    expect(isSaudiTruckRentalWithoutDriver({ countryCode: 'SA', categoryId: 'excavators', transactionType: 'rental' })).toBe(false);
    expect(isSaudiTruckRentalWithoutDriver({ countryCode: 'SA', categoryId: 'trucks', transactionType: 'rental', includesDriver: true })).toBe(false);
  });
});
