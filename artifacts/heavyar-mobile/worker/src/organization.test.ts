import { describe, expect, test } from 'bun:test';
import {
  ORGANIZATION_CAPABILITIES,
  isCompanyProvider,
  isOrganizationAccountEligible,
  maskOrganizationEmail,
  normalizeOrganizationCapabilities,
  normalizeOrganizationEmail,
  organizationAccountPurpose,
  organizationInvitationIsAcceptable,
  organizationMemberCan,
  organizationTokenParts,
  safeOrganizationId,
  safeOrganizationInvitationId,
  safeOrganizationMemberId,
} from './organization';

describe('organization security model', () => {
  test('only company providers can provision and platform roles never become organization roles', () => {
    expect(isCompanyProvider({ role: 'provider', providerType: 'company' })).toBe(true);
    expect(isCompanyProvider({ role: 'provider', providerType: 'individual' })).toBe(false);
    expect(isCompanyProvider({ role: 'admin', providerType: 'company' })).toBe(false);
    expect(organizationAccountPurpose({ accountPurpose: 'store_review' })).toBe('store_review');
    expect(organizationAccountPurpose({})).toBe('standard');
  });

  test('restricted accounts fail closed while canonical marketplace roles remain eligible', () => {
    for (const role of ['customer', 'provider', 'driver']) expect(isOrganizationAccountEligible({ role, accountStatus: 'active' })).toBe(true);
    for (const accountStatus of ['suspended', 'restricted', 'deletion_requested', 'deleted']) {
      expect(isOrganizationAccountEligible({ role: 'customer', accountStatus })).toBe(false);
    }
    expect(isOrganizationAccountEligible({ role: 'super_admin', accountStatus: 'active' })).toBe(false);
    expect(isOrganizationAccountEligible({ role: 'provider', accountStatus: 'active', isActive: false })).toBe(false);
  });

  test('employee capabilities are allowlisted and owner authority cannot be assigned', () => {
    expect(normalizeOrganizationCapabilities([...ORGANIZATION_CAPABILITIES])).toEqual([...ORGANIZATION_CAPABILITIES]);
    expect(normalizeOrganizationCapabilities(['equipment.view', 'equipment.view'])).toEqual(['equipment.view']);
    expect(normalizeOrganizationCapabilities(['finance.manage'])).toBeNull();
    expect(normalizeOrganizationCapabilities('equipment.view')).toBeNull();
    expect(organizationMemberCan({ role: 'employee', status: 'active', capabilities: ['equipment.view'] }, 'equipment.view')).toBe(true);
    expect(organizationMemberCan({ role: 'employee', status: 'revoked', capabilities: ['equipment.view'] }, 'equipment.view')).toBe(false);
    expect(organizationMemberCan({ role: 'owner', status: 'active', capabilities: [] }, 'bookings.view')).toBe(true);
  });

  test('invitation input is bounded, opaque and expiry is fail closed', () => {
    expect(normalizeOrganizationEmail(' Person@Example.COM ')).toBe('person@example.com');
    expect(normalizeOrganizationEmail('not-an-email')).toBeNull();
    expect(maskOrganizationEmail('person@example.com')).toBe('p***@example.com');
    const invitationId = `orginv_${'a'.repeat(43)}`;
    expect(organizationTokenParts(`${invitationId}.${'B'.repeat(64)}`)).toEqual({ invitationId, secret: 'b'.repeat(64) });
    expect(organizationTokenParts(`${invitationId}.secret`)).toBeNull();
    expect(organizationInvitationIsAcceptable({ status: 'pending', expiresAt: '2030-01-02T00:00:00.000Z' }, Date.parse('2030-01-01T00:00:00.000Z'))).toBe(true);
    expect(organizationInvitationIsAcceptable({ status: 'pending', expiresAt: '2030-01-01T00:00:00.000Z' }, Date.parse('2030-01-01T00:00:00.000Z'))).toBe(false);
  });

  test('server IDs use disjoint namespaces with fixed digest lengths', () => {
    expect(safeOrganizationId(`org_${'a'.repeat(43)}`)).toBe(true);
    expect(safeOrganizationMemberId(`orgmem_${'b'.repeat(43)}`)).toBe(true);
    expect(safeOrganizationInvitationId(`orginv_${'c'.repeat(43)}`)).toBe(true);
    expect(safeOrganizationId(`org_${'a'.repeat(42)}`)).toBe(false);
    expect(safeOrganizationMemberId(`org_${'b'.repeat(43)}`)).toBe(false);
  });
});
