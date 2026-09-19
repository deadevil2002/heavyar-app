import type { UserRole } from '@/types';

export type RoleCapability = 'profile' | 'verification' | 'notifications' | 'settings' | 'deletion' | 'rentEquipment' | 'findDriver' | 'customerRequests' | 'manageEquipment' | 'providerRequests' | 'manageDriverProfile' | 'driverRequests';

const ROLE_CAPABILITIES: Record<UserRole, readonly RoleCapability[]> = {
  customer: ['profile', 'verification', 'notifications', 'settings', 'deletion', 'rentEquipment', 'findDriver', 'customerRequests'],
  provider: ['profile', 'verification', 'notifications', 'settings', 'deletion', 'manageEquipment', 'providerRequests', 'findDriver'],
  driver: ['profile', 'verification', 'notifications', 'settings', 'deletion', 'manageDriverProfile', 'driverRequests'],
};

export function hasCapability(role: UserRole | undefined, capability: RoleCapability) {
  return role ? ROLE_CAPABILITIES[role].includes(capability) : false;
}
export function canAccessRolePath(role: UserRole | undefined, path: string) {
  if (path.includes('my-equipment') || path.includes('create-listing') || path.includes('edit-equipment')) return hasCapability(role, 'manageEquipment');
  if (path.includes('driver-profile')) return hasCapability(role, 'manageDriverProfile');
  if (path.includes('driver/request') || path.includes('driver/requests')) return hasCapability(role, 'driverRequests');
  return true;
}
export const roleLabel = (role: UserRole, ar: boolean) => ({ customer: ar ? 'عميل' : 'Customer', provider: ar ? 'مقدم خدمة' : 'Provider', driver: ar ? 'سائق' : 'Driver' }[role]);