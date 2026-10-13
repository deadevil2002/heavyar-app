import { request } from './workerClient';

export type OrganizationCapability = 'equipment.view' | 'equipment.manage' | 'bookings.view' | 'bookings.respond' | 'bookings.operate' | 'operators.manage' | 'transport.manage';
export type OrganizationSummary = {
  id: string;
  displayName: string;
  verificationStatus: 'verified' | 'unverified';
  legalAuthorityVerified: boolean;
  memberRole: 'owner' | 'employee';
  capabilities: OrganizationCapability[];
};
export type OrganizationMember = {
  id: string;
  displayName: string;
  role: 'owner' | 'employee';
  status: 'active' | 'revoked';
  capabilities: OrganizationCapability[];
  revision: string;
  createdAt?: string;
  updatedAt?: string;
};
export type OrganizationOperation = { actorMemberId: string; action: string; at: string };
export type OrganizationEquipment = {
  id: string;
  publicEquipmentNumber: string | null;
  revision: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  category: string;
  isActive: boolean;
  moderationStatus: string;
  availability: { from: string; until: string | null; blocked: Array<{ from: string; until: string }>; temporarilyUnavailable: boolean } | null;
  lastOrganizationOperation: OrganizationOperation | null;
};
export type OrganizationBooking = {
  id: string;
  publicRequestNumber: string | null;
  pricingModelVersion: 1 | 2;
  status: string;
  equipmentTitleAr: string;
  equipmentTitleEn: string;
  requestedStartAt: string | null;
  requestedEndAt: string | null;
  lastOrganizationOperation: OrganizationOperation | null;
};
export type OrganizationInvitation = {
  id: string;
  emailHint: string;
  status: string;
  capabilities: OrganizationCapability[];
  expiresAt?: string;
  createdAt?: string;
};

const organizationIdPattern = /^org_[A-Za-z0-9_-]{43}$/;
const memberIdPattern = /^orgmem_[A-Za-z0-9_-]{43}$/;
const invitationIdPattern = /^orginv_[A-Za-z0-9_-]{43}$/;
const tokenPattern = /^orginv_[A-Za-z0-9_-]{43}\.[A-Fa-f0-9]{64}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return value as Record<string, unknown>;
}

function capabilities(value: unknown): OrganizationCapability[] {
  if (!Array.isArray(value) || value.length > 7) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  const result = [...new Set(value)];
  if (!result.every(item => ['equipment.view', 'equipment.manage', 'bookings.view', 'bookings.respond', 'bookings.operate', 'operators.manage', 'transport.manage'].includes(String(item)))) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return result as OrganizationCapability[];
}

export function decodeOrganizationSummary(value: unknown): OrganizationSummary {
  const row = object(value);
  if (typeof row.id !== 'string' || !organizationIdPattern.test(row.id) || typeof row.displayName !== 'string' || row.displayName.length > 120 ||
      !['verified', 'unverified'].includes(String(row.verificationStatus)) || typeof row.legalAuthorityVerified !== 'boolean' ||
      !['owner', 'employee'].includes(String(row.memberRole))) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { id: row.id, displayName: row.displayName, verificationStatus: row.verificationStatus as OrganizationSummary['verificationStatus'], legalAuthorityVerified: row.legalAuthorityVerified, memberRole: row.memberRole as OrganizationSummary['memberRole'], capabilities: capabilities(row.capabilities) };
}

export function decodeOrganizationMember(value: unknown): OrganizationMember {
  const row = object(value);
  if (typeof row.id !== 'string' || !memberIdPattern.test(row.id) || typeof row.displayName !== 'string' || row.displayName.length > 120 || !['owner', 'employee'].includes(String(row.role)) || !['active', 'revoked'].includes(String(row.status)) || typeof row.revision !== 'string' || !row.revision) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { id: row.id, displayName: row.displayName, role: row.role as OrganizationMember['role'], status: row.status as OrganizationMember['status'], capabilities: capabilities(row.capabilities), revision: row.revision, ...(typeof row.createdAt === 'string' ? { createdAt: row.createdAt } : {}), ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}) };
}

function operation(value: unknown): OrganizationOperation | null {
  if (value === null || value === undefined) return null;
  const row = object(value);
  if (typeof row.actorMemberId !== 'string' || !memberIdPattern.test(row.actorMemberId) || typeof row.action !== 'string' || row.action.length > 80 || typeof row.at !== 'string') throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { actorMemberId: row.actorMemberId, action: row.action, at: row.at };
}

function availability(value: unknown): OrganizationEquipment['availability'] {
  if (value === null || value === undefined) return null;
  const row = object(value);
  if (typeof row.from !== 'string' || !(row.until === null || row.until === undefined || typeof row.until === 'string') || !(row.temporarilyUnavailable === undefined || typeof row.temporarilyUnavailable === 'boolean') || !(row.blocked === undefined || Array.isArray(row.blocked)) || Array.isArray(row.blocked) && row.blocked.length > 60) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  const blocked = (Array.isArray(row.blocked) ? row.blocked : []).map(item => {
    const range = object(item);
    if (typeof range.from !== 'string' || typeof range.until !== 'string') throw new Error('ORGANIZATION_RESPONSE_INVALID');
    return { from: range.from, until: range.until };
  });
  return { from: row.from, until: typeof row.until === 'string' ? row.until : null, blocked, temporarilyUnavailable: row.temporarilyUnavailable === true };
}

export function decodeOrganizationEquipment(value: unknown): OrganizationEquipment {
  const row = object(value);
  if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id) || typeof row.revision !== 'string' || !row.revision || typeof row.titleAr !== 'string' || typeof row.titleEn !== 'string' || typeof row.descriptionAr !== 'string' || typeof row.descriptionEn !== 'string' || typeof row.category !== 'string' || typeof row.isActive !== 'boolean' || typeof row.moderationStatus !== 'string') throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { id: row.id, publicEquipmentNumber: typeof row.publicEquipmentNumber === 'string' ? row.publicEquipmentNumber : null, revision: row.revision, titleAr: row.titleAr, titleEn: row.titleEn, descriptionAr: row.descriptionAr, descriptionEn: row.descriptionEn, category: row.category, isActive: row.isActive, moderationStatus: row.moderationStatus, availability: availability(row.availability), lastOrganizationOperation: operation(row.lastOrganizationOperation) };
}

export function decodeOrganizationBooking(value: unknown): OrganizationBooking {
  const row = object(value);
  if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id) || ![1, 2].includes(Number(row.pricingModelVersion)) || typeof row.status !== 'string' || typeof row.equipmentTitleAr !== 'string' || typeof row.equipmentTitleEn !== 'string') throw new Error('ORGANIZATION_RESPONSE_INVALID');
  const optionalDate = (input: unknown) => input === null || input === undefined ? null : typeof input === 'string' ? input : (() => { throw new Error('ORGANIZATION_RESPONSE_INVALID'); })();
  return { id: row.id, publicRequestNumber: typeof row.publicRequestNumber === 'string' ? row.publicRequestNumber : null, pricingModelVersion: Number(row.pricingModelVersion) as 1 | 2, status: row.status, equipmentTitleAr: row.equipmentTitleAr, equipmentTitleEn: row.equipmentTitleEn, requestedStartAt: optionalDate(row.requestedStartAt), requestedEndAt: optionalDate(row.requestedEndAt), lastOrganizationOperation: operation(row.lastOrganizationOperation) };
}

export function decodeOrganizationInvitation(value: unknown): OrganizationInvitation {
  const row = object(value);
  if (typeof row.id !== 'string' || !invitationIdPattern.test(row.id) || typeof row.emailHint !== 'string' || row.emailHint.length > 254 || typeof row.status !== 'string') throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { id: row.id, emailHint: row.emailHint, status: row.status, capabilities: capabilities(row.capabilities), ...(typeof row.expiresAt === 'string' ? { expiresAt: row.expiresAt } : {}), ...(typeof row.createdAt === 'string' ? { createdAt: row.createdAt } : {}) };
}

function pageCursor(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 300) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return value;
}

function query(path: string, cursor?: string | null) {
  return cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path;
}

export async function listOrganizations(expectedUid: string, cursor?: string | null, signal?: AbortSignal) {
  const response = object(await request(query('/api/organizations', cursor), { signal }, true, expectedUid));
  if (!Array.isArray(response.organizations)) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { organizations: response.organizations.map(decodeOrganizationSummary), nextCursor: pageCursor(response.nextCursor) };
}

export async function provisionOrganization(expectedUid: string, signal?: AbortSignal) {
  const response = object(await request('/api/organizations', { method: 'POST', body: '{}', signal }, true, expectedUid));
  return decodeOrganizationSummary(response.organization);
}

export async function listOrganizationMembers(expectedUid: string, organizationId: string, cursor?: string | null, signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId)) throw new Error('ORGANIZATION_ID_INVALID');
  const response = object(await request(query(`/api/organizations/${organizationId}/members`, cursor), { signal }, true, expectedUid));
  if (!Array.isArray(response.members)) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { members: response.members.map(decodeOrganizationMember), nextCursor: pageCursor(response.nextCursor) };
}

export async function listOrganizationInvitations(expectedUid: string, organizationId: string, cursor?: string | null, signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId)) throw new Error('ORGANIZATION_ID_INVALID');
  const response = object(await request(query(`/api/organizations/${organizationId}/invitations`, cursor), { signal }, true, expectedUid));
  if (!Array.isArray(response.invitations)) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { invitations: response.invitations.map(decodeOrganizationInvitation), nextCursor: pageCursor(response.nextCursor) };
}

export async function inviteOrganizationMember(expectedUid: string, organizationId: string, email: string, assignedCapabilities: OrganizationCapability[], signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId)) throw new Error('ORGANIZATION_ID_INVALID');
  const response = object(await request(`/api/organizations/${organizationId}/invitations`, { method: 'POST', body: JSON.stringify({ email, capabilities: assignedCapabilities }), signal }, true, expectedUid));
  const invitation = decodeOrganizationInvitation(response.invitation);
  if (typeof response.token !== 'string' || !tokenPattern.test(response.token)) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { invitation, token: response.token };
}

export async function acceptOrganizationInvitation(expectedUid: string, token: string, signal?: AbortSignal) {
  if (!tokenPattern.test(token.trim())) throw new Error('INVITATION_TOKEN_INVALID');
  const response = object(await request('/api/organization-invitations/accept', { method: 'POST', body: JSON.stringify({ token: token.trim() }), signal }, true, expectedUid));
  return decodeOrganizationSummary(response.organization);
}

export async function cancelOrganizationInvitation(expectedUid: string, organizationId: string, invitationId: string, signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId) || !invitationIdPattern.test(invitationId)) throw new Error('INVITATION_ID_INVALID');
  await request(`/api/organizations/${organizationId}/invitations/${invitationId}/cancel`, { method: 'POST', body: '{}', signal }, true, expectedUid);
}

export async function revokeOrganizationMember(expectedUid: string, organizationId: string, memberId: string, signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId) || !memberIdPattern.test(memberId)) throw new Error('MEMBER_ID_INVALID');
  await request(`/api/organizations/${organizationId}/members/${memberId}/revoke`, { method: 'POST', body: '{}', signal }, true, expectedUid);
}

export async function updateOrganizationMemberCapabilities(expectedUid: string, organizationId: string, memberId: string, expectedRevision: string, assignedCapabilities: OrganizationCapability[], signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId) || !memberIdPattern.test(memberId) || !expectedRevision) throw new Error('MEMBER_ID_INVALID');
  await request(`/api/organizations/${organizationId}/members/${memberId}/capabilities`, { method: 'PATCH', body: JSON.stringify({ expectedRevision, capabilities: assignedCapabilities }), signal }, true, expectedUid);
}

export async function listOrganizationEquipment(expectedUid: string, organizationId: string, cursor?: string | null, signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId)) throw new Error('ORGANIZATION_ID_INVALID');
  const response = object(await request(query(`/api/organizations/${organizationId}/workspace/equipment`, cursor), { signal }, true, expectedUid));
  if (!Array.isArray(response.items)) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { items: response.items.map(decodeOrganizationEquipment), nextCursor: pageCursor(response.nextCursor) };
}

export async function listOrganizationBookings(expectedUid: string, organizationId: string, cursor?: string | null, signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId)) throw new Error('ORGANIZATION_ID_INVALID');
  const response = object(await request(query(`/api/organizations/${organizationId}/workspace/bookings`, cursor), { signal }, true, expectedUid));
  if (!Array.isArray(response.items)) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { items: response.items.map(decodeOrganizationBooking), nextCursor: pageCursor(response.nextCursor) };
}

export async function updateOrganizationEquipmentMetadata(expectedUid: string, organizationId: string, equipmentId: string, expectedRevision: string, patch: Partial<Pick<OrganizationEquipment, 'titleAr' | 'titleEn' | 'descriptionAr' | 'descriptionEn'>>, signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId) || !/^[A-Za-z0-9_-]{1,128}$/.test(equipmentId) || !expectedRevision) throw new Error('EQUIPMENT_ID_INVALID');
  await request(`/api/organizations/${organizationId}/equipment/${equipmentId}/metadata`, { method: 'PATCH', body: JSON.stringify({ expectedRevision, patch }), signal }, true, expectedUid);
}

export async function updateOrganizationEquipmentAvailability(expectedUid: string, organizationId: string, equipmentId: string, expectedRevision: string, value: NonNullable<OrganizationEquipment['availability']>, signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId) || !/^[A-Za-z0-9_-]{1,128}$/.test(equipmentId) || !expectedRevision) throw new Error('EQUIPMENT_ID_INVALID');
  const availabilityValue = { from: value.from, blocked: value.blocked, temporarilyUnavailable: value.temporarilyUnavailable, ...(value.until ? { until: value.until } : {}) };
  await request(`/api/organizations/${organizationId}/equipment/${equipmentId}/availability`, { method: 'PATCH', body: JSON.stringify({ expectedRevision, availability: availabilityValue }), signal }, true, expectedUid);
}

export async function transitionOrganizationBooking(expectedUid: string, organizationId: string, requestId: string, action: 'accept' | 'reject' | 'start' | 'request_completion', signal?: AbortSignal) {
  if (!organizationIdPattern.test(organizationId) || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new Error('REQUEST_ID_INVALID');
  await request(`/api/organizations/${organizationId}/bookings/${requestId}/transition`, { method: 'POST', body: JSON.stringify({ action }), signal }, true, expectedUid);
}
