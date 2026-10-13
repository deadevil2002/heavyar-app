import { request } from './workerClient';

export type OrganizationCapability = 'equipment.view' | 'bookings.view';
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
  role: 'owner' | 'employee';
  status: 'active' | 'revoked';
  capabilities: OrganizationCapability[];
  createdAt?: string;
  updatedAt?: string;
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
  if (!Array.isArray(value) || value.length > 2) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  const result = [...new Set(value)];
  if (!result.every(item => item === 'equipment.view' || item === 'bookings.view')) throw new Error('ORGANIZATION_RESPONSE_INVALID');
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
  if (typeof row.id !== 'string' || !memberIdPattern.test(row.id) || !['owner', 'employee'].includes(String(row.role)) || !['active', 'revoked'].includes(String(row.status))) throw new Error('ORGANIZATION_RESPONSE_INVALID');
  return { id: row.id, role: row.role as OrganizationMember['role'], status: row.status as OrganizationMember['status'], capabilities: capabilities(row.capabilities), ...(typeof row.createdAt === 'string' ? { createdAt: row.createdAt } : {}), ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}) };
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
