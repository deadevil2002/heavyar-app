import { STAFF_ROLES, type StaffRole } from './completion';

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeAuthorityEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && emailPattern.test(email) ? email : null;
}

/** Owners are established only by bootstrap or accepted ownership transfer. */
export function invitationRole(value: unknown): Exclude<StaffRole, 'owner'> | null {
  return typeof value === 'string' && value !== 'owner' && (STAFF_ROLES as readonly string[]).includes(value)
    ? value as Exclude<StaffRole, 'owner'>
    : null;
}

export function isFreshReauthentication(authTime: unknown, now = Date.now(), maxAgeMs = 5 * 60_000): boolean {
  return typeof authTime === 'number' && Number.isFinite(authTime) && authTime <= now && now - authTime <= maxAgeMs;
}

export function pendingAndUnexpired(invitation: Record<string, unknown> | undefined, now = Date.now()): boolean {
  return !!invitation && invitation.status === 'pending' &&
    typeof invitation.expiresAt === 'string' && Number.isFinite(Date.parse(invitation.expiresAt)) &&
    Date.parse(invitation.expiresAt) > now;
}