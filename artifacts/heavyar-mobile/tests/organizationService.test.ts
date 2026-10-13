import { describe, expect, it, vi } from 'vitest';
import { request } from '@/services/workerClient';
import { decodeOrganizationBooking, decodeOrganizationEquipment, decodeOrganizationInvitation, decodeOrganizationMember, decodeOrganizationSummary, listOrganizations } from '@/services/organizationService';

vi.mock('@/services/firebaseConfig', () => ({ getFirebaseAuth: () => ({ currentUser: null }) }));
vi.mock('@/utils/mobilePerformance', () => ({ mobilePerformance: { trackNetwork: async (_label: string, operation: () => unknown) => operation(), readResponseText: async () => '', parseJson: JSON.parse, markCancellation: vi.fn(), markTimeout: vi.fn() } }));
vi.mock('@/services/workerClient', () => ({ request: vi.fn() }));

const orgId = `org_${'a'.repeat(43)}`;
const memberId = `orgmem_${'b'.repeat(43)}`;
const inviteId = `orginv_${'c'.repeat(43)}`;

describe('organization runtime response boundaries', () => {
  it('accepts only bounded organization, membership and invitation projections', () => {
    expect(decodeOrganizationSummary({ id: orgId, displayName: 'Heavy Co', verificationStatus: 'unverified', legalAuthorityVerified: false, memberRole: 'owner', capabilities: [] }).memberRole).toBe('owner');
    expect(decodeOrganizationMember({ id: memberId, displayName: 'Employee', role: 'employee', status: 'active', capabilities: ['equipment.manage'], revision: 'revision-1' }).capabilities).toEqual(['equipment.manage']);
    expect(decodeOrganizationInvitation({ id: inviteId, emailHint: 'p***@example.com', status: 'pending', capabilities: ['bookings.view'] }).status).toBe('pending');
  });

  it('decodes bounded equipment and booking projections without private or financial fields', () => {
    const equipment = decodeOrganizationEquipment({ id: 'equipment-1', publicEquipmentNumber: 'HV-EQP-1', revision: 'revision-1', titleAr: 'حفارة', titleEn: 'Excavator', descriptionAr: '', descriptionEn: '', category: 'excavator', isActive: true, moderationStatus: 'approved', availability: { from: '2026-10-13', until: null, blocked: [], temporarilyUnavailable: false }, lastOrganizationOperation: null });
    expect(equipment.availability?.temporarilyUnavailable).toBe(false);
    const booking = decodeOrganizationBooking({ id: 'request-1', publicRequestNumber: 'HV-REQ-1', pricingModelVersion: 2, status: 'pending', equipmentTitleAr: 'حفارة', equipmentTitleEn: 'Excavator', requestedStartAt: '2026-10-20T00:00:00.000Z', requestedEndAt: '2026-10-21T00:00:00.000Z', lastOrganizationOperation: null });
    expect(booking.pricingModelVersion).toBe(2);
    expect(() => decodeOrganizationEquipment({ id: 'equipment-1', revision: '', titleAr: '', titleEn: '', descriptionAr: '', descriptionEn: '', category: '', isActive: true, moderationStatus: '' })).toThrow('ORGANIZATION_RESPONSE_INVALID');
  });

  it('rejects forged capabilities, admin roles, raw identity fields and malformed IDs', () => {
    expect(() => decodeOrganizationSummary({ id: 'org-forged', displayName: 'X', verificationStatus: 'verified', legalAuthorityVerified: true, memberRole: 'owner', capabilities: [] })).toThrow('ORGANIZATION_RESPONSE_INVALID');
    expect(() => decodeOrganizationMember({ id: memberId, displayName: 'X', revision: 'r', role: 'admin', status: 'active', capabilities: ['finance.manage'] })).toThrow('ORGANIZATION_RESPONSE_INVALID');
    expect(() => decodeOrganizationMember({ id: memberId, displayName: 'X', revision: 'r', role: 'employee', status: 'active', capabilities: ['platform.admin'] })).toThrow('ORGANIZATION_RESPONSE_INVALID');
    expect(() => decodeOrganizationInvitation({ id: inviteId, emailHint: 'x'.repeat(255), status: 'pending', capabilities: [] })).toThrow('ORGANIZATION_RESPONSE_INVALID');
  });

  it('binds every load to the expected account and forwards cancellation', async () => {
    const controller = new AbortController();
    vi.mocked(request).mockResolvedValueOnce({ success: true, organizations: [], nextCursor: null });
    await listOrganizations('account-a', null, controller.signal);
    expect(request).toHaveBeenCalledWith('/api/organizations', { signal: controller.signal }, true, 'account-a');
    controller.abort();
    vi.mocked(request).mockRejectedValueOnce(new Error('AUTH_SESSION_CHANGED'));
    await expect(listOrganizations('account-b', null, controller.signal)).rejects.toThrow('AUTH_SESSION_CHANGED');
  });
});
