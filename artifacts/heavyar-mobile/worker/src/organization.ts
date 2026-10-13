export const ORGANIZATION_CAPABILITIES = [
  'equipment.view',
  'equipment.manage',
  'bookings.view',
  'bookings.respond',
  'bookings.operate',
  'operators.manage',
  'transport.manage',
] as const;

export type OrganizationCapability = (typeof ORGANIZATION_CAPABILITIES)[number];
export type OrganizationMemberRole = 'owner' | 'employee';
export type OrganizationAccountPurpose = 'standard' | 'store_review';

export const ORGANIZATION_PAGE_SIZE = 20;
export const ORGANIZATION_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeOrganizationEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

export function normalizeOrganizationCapabilities(value: unknown): OrganizationCapability[] | null {
  if (!Array.isArray(value) || value.length > ORGANIZATION_CAPABILITIES.length) return null;
  const unique = [...new Set(value)];
  if (!unique.every(item => typeof item === 'string' && ORGANIZATION_CAPABILITIES.includes(item as OrganizationCapability))) return null;
  return unique as OrganizationCapability[];
}

export function organizationAccountPurpose(account: Record<string, unknown> | null | undefined): OrganizationAccountPurpose {
  return account?.accountPurpose === 'store_review' ? 'store_review' : 'standard';
}

export function isCompanyProvider(account: Record<string, unknown> | null | undefined): boolean {
  return account?.role === 'provider' && account?.providerType === 'company';
}

export function isOrganizationAccountEligible(account: Record<string, unknown> | null | undefined): boolean {
  if (!account || !['customer', 'provider', 'driver'].includes(String(account.role || ''))) return false;
  return !['suspended', 'restricted', 'deletion_requested', 'deleted'].includes(String(account.accountStatus || account.suspensionStatus || ''))
    && account.isActive !== false;
}

export function organizationMemberCan(
  membership: Record<string, unknown> | null | undefined,
  capability: OrganizationCapability,
): boolean {
  if (!membership || membership.status !== 'active') return false;
  if (membership.role === 'owner') return true;
  if (membership.role !== 'employee' || !Array.isArray(membership.capabilities)) return false;
  if (membership.capabilities.includes(capability)) return true;
  // An operational permission necessarily includes the bounded sanitized view
  // needed to perform it. It never implies another mutation capability.
  if (capability === 'equipment.view') return membership.capabilities.includes('equipment.manage');
  if (capability === 'bookings.view') {
    return membership.capabilities.includes('bookings.respond') || membership.capabilities.includes('bookings.operate');
  }
  return false;
}

export function organizationInvitationIsAcceptable(
  invitation: Record<string, unknown> | null | undefined,
  nowMs: number,
): boolean {
  const expiresAt = Date.parse(String(invitation?.expiresAt || ''));
  return invitation?.status === 'pending' && Number.isFinite(nowMs) && Number.isFinite(expiresAt) && nowMs < expiresAt;
}

export function maskOrganizationEmail(normalizedEmail: string): string {
  const [local, domain] = normalizedEmail.split('@');
  return `${local.slice(0, 1)}${local.length > 1 ? '***' : ''}@${domain}`;
}

export function organizationTokenParts(value: unknown): { invitationId: string; secret: string } | null {
  if (typeof value !== 'string' || value.length > 220) return null;
  const match = /^(orginv_[A-Za-z0-9_-]{43})\.([A-Fa-f0-9]{64})$/.exec(value.trim());
  return match ? { invitationId: match[1], secret: match[2].toLowerCase() } : null;
}

export function safeOrganizationId(value: string): boolean {
  return /^org_[A-Za-z0-9_-]{43}$/.test(value);
}

export function safeOrganizationMemberId(value: string): boolean {
  return /^orgmem_[A-Za-z0-9_-]{43}$/.test(value);
}

export function safeOrganizationInvitationId(value: string): boolean {
  return /^orginv_[A-Za-z0-9_-]{43}$/.test(value);
}

export function organizationDisplayName(account: Record<string, unknown>, fallback: string): string {
  for (const candidate of [account.nameAr, account.nameEn, fallback]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim().slice(0, 120);
  }
  return 'Company';
}
