import type { UserRole } from '../types';

export type RequestSection = 'equipment' | 'active' | 'drivers';
export const DRIVER_REQUEST_STALE_MS = 60_000;
export const DRIVER_REQUESTS_ROUTE = { pathname: '/(tabs)/requests' as const, params: { section: 'drivers' } };
export function requestSections(role?: UserRole): RequestSection[] {
  return role === 'driver' ? ['drivers'] : role ? ['equipment', 'active', 'drivers'] : [];
}
export function resolveRequestSection(role?: UserRole, section?: string, status?: string): RequestSection {
  const requested = section || (status === 'active' ? 'active' : undefined);
  return requestSections(role).includes(requested as RequestSection)
    ? requested as RequestSection : role === 'driver' ? 'drivers' : 'equipment';
}
export const driverRequestsKey = (uid: string, role: UserRole) => ['driver-requests', uid, role] as const;
export function driverRequestsAllowed(user?: { uid?: string; role?: UserRole; accountPurpose?: string } | null) {
  return !!user?.uid && !!user.role && user.accountPurpose !== 'store_review';
}